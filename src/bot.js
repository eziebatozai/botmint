#!/usr/bin/env node

const { ethers } = require('ethers');
const { config, validateConfig } = require('./config');
const { THIRDWEB_DROP_ABI, NFT_READ_ABI, NATIVE_TOKEN_ADDRESS } = require('./abi');
const Logger = require('./utils/logger');
const WalletManager = require('./utils/wallet');
const GasEstimator = require('./utils/gas');
const Notifier = require('./utils/notifier');

// ============================================
// LOBSTER NFT - FCFS MINT BOT
// Contract: 0x1de237c7063a9ee531e06a6c3fba4e3e704f2a74
// Type: Thirdweb ERC721Drop (claim function)
// Chain: Ethereum Mainnet
// ============================================

class LobsterMintBot {
  constructor() {
    this.provider = null;
    this.walletManager = null;
    this.gasEstimator = null;
    this.notifier = null;
    this.nftContract = null;
    this.isMinting = false;
    this.mintResults = [];
    this.claimCondition = null;
    this.activeConditionId = null;
  }

  async initialize() {
    Logger.banner();
    validateConfig();

    // Setup provider
    this.provider = await this.setupProvider();

    // Setup wallet
    this.walletManager = new WalletManager(this.provider);
    this.walletManager.loadWallets();
    await this.walletManager.checkBalances();

    // Setup gas estimator
    this.gasEstimator = new GasEstimator(this.provider, config);

    // Setup notifier
    this.notifier = new Notifier(config.enableNotifications);

    // Setup NFT contract (read-only)
    this.nftContract = new ethers.Contract(
      config.contractAddress,
      THIRDWEB_DROP_ABI,
      this.provider
    );

    // Display config
    Logger.info(`Contract: ${config.contractAddress}`);
    Logger.info(`Collection: ${config.collectionName}`);
    Logger.info(`Type: Thirdweb ERC721Drop (claim)`);
    Logger.info(`Chain ID: ${config.chainId} (Ethereum Mainnet)`);
    Logger.info(`Mode: ${config.botMode.toUpperCase()}`);
    Logger.info(`Speed: ${config.speedMode.toUpperCase()}`);
    Logger.divider();

    // Show contract info & claim conditions
    await this.showContractInfo();
    await this.fetchClaimCondition();
  }

  async setupProvider() {
    try {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
      const network = await provider.getNetwork();
      Logger.success(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
      return provider;
    } catch (error) {
      Logger.warn(`Primary RPC failed: ${error.message}`);

      for (const backupUrl of config.rpcBackups) {
        try {
          const provider = new ethers.JsonRpcProvider(backupUrl, config.chainId);
          await provider.getNetwork();
          Logger.success(`Connected via backup RPC: ${backupUrl.slice(0, 30)}...`);
          return provider;
        } catch (e) {
          continue;
        }
      }

      throw new Error('All RPCs failed! Check RPC_URL configuration');
    }
  }

  async showContractInfo() {
    try {
      Logger.info('Fetching contract info...');

      let name = '?', symbol = '?', totalSupply = '?', maxSupply = '?';

      try { name = await this.nftContract.name(); } catch (e) {}
      try { symbol = await this.nftContract.symbol(); } catch (e) {}
      try { totalSupply = (await this.nftContract.totalSupply()).toString(); } catch (e) {}
      try { maxSupply = (await this.nftContract.maxSupply()).toString(); } catch (e) {}

      Logger.divider();
      Logger.info(`Name: ${name} (${symbol})`);
      Logger.info(`Supply: ${totalSupply} / ${maxSupply}`);
      Logger.divider();
    } catch (e) {
      Logger.warn(`Cannot fetch contract info: ${e.message}`);
    }
  }

  // ============================================
  // FETCH CLAIM CONDITION (thirdweb specific)
  // ============================================

  async fetchClaimCondition() {
    try {
      Logger.info('Fetching active claim condition...');

      this.activeConditionId = await this.nftContract.getActiveClaimConditionId();
      Logger.info(`Active Condition ID: ${this.activeConditionId.toString()}`);

      this.claimCondition = await this.nftContract.getClaimConditionById(this.activeConditionId);

      const startTime = Number(this.claimCondition.startTimestamp);
      const maxClaimable = this.claimCondition.maxClaimableSupply.toString();
      const supplyClaimed = this.claimCondition.supplyClaimed.toString();
      const quantityLimit = this.claimCondition.quantityLimitPerWallet.toString();
      const pricePerToken = ethers.formatEther(this.claimCondition.pricePerToken);
      const currency = this.claimCondition.currency;
      const merkleRoot = this.claimCondition.merkleRoot;

      Logger.divider();
      Logger.info('CLAIM CONDITION:');
      Logger.info(`  Start Time: ${startTime === 0 ? 'Not set' : new Date(startTime * 1000).toLocaleString()}`);
      Logger.info(`  Max Claimable: ${maxClaimable}`);
      Logger.info(`  Supply Claimed: ${supplyClaimed}`);
      Logger.info(`  Limit/Wallet: ${quantityLimit}`);
      Logger.info(`  Price: ${pricePerToken} ETH`);
      Logger.info(`  Currency: ${currency}`);

      const isPublic = merkleRoot === '0x0000000000000000000000000000000000000000000000000000000000000000';
      Logger.info(`  Type: ${isPublic ? 'PUBLIC MINT' : 'ALLOWLIST (Merkle proof needed)'}`);

      // Check if mint is currently active
      const now = Math.floor(Date.now() / 1000);
      if (startTime > 0 && startTime <= now) {
        Logger.success('  STATUS: MINT IS LIVE!');
      } else if (startTime > now) {
        const diff = startTime - now;
        const mins = Math.floor(diff / 60);
        const hours = Math.floor(mins / 60);
        Logger.warn(`  STATUS: Starts in ${hours}h ${mins % 60}m (${new Date(startTime * 1000).toLocaleString()})`);
      } else {
        Logger.warn('  STATUS: Start time not set');
      }

      Logger.divider();

      // Override mint price from claim condition if not manually set
      if (config.mintPrice === '0' && this.claimCondition.pricePerToken > 0n) {
        config.mintPrice = ethers.formatEther(this.claimCondition.pricePerToken);
        Logger.info(`Mint price auto-set from claim condition: ${config.mintPrice} ETH`);
      }

      return this.claimCondition;
    } catch (e) {
      Logger.warn(`Cannot fetch claim condition: ${e.message}`);
      Logger.warn('This may mean no active claim phase is set yet.');
      return null;
    }
  }

  // ============================================
  // CHECK IF MINT IS ACTIVE
  // ============================================

  async checkMintActive() {
    try {
      // Refresh claim condition
      const conditionId = await this.nftContract.getActiveClaimConditionId();
      const condition = await this.nftContract.getClaimConditionById(conditionId);

      const startTime = Number(condition.startTimestamp);
      const now = Math.floor(Date.now() / 1000);

      // Check if started
      if (startTime === 0) {
        return { active: false, reason: 'startTimestamp = 0 (not configured)' };
      }

      if (startTime > now) {
        const diff = startTime - now;
        return { active: false, reason: `Starts in ${Math.floor(diff / 60)}m ${diff % 60}s` };
      }

      // Check supply
      const maxClaimable = condition.maxClaimableSupply;
      const supplyClaimed = condition.supplyClaimed;
      if (maxClaimable > 0n && supplyClaimed >= maxClaimable) {
        return { active: false, reason: 'SOLD OUT (supplyClaimed >= maxClaimableSupply)' };
      }

      // Also check total supply vs max supply
      try {
        const totalSupply = await this.nftContract.totalSupply();
        const maxSupply = await this.nftContract.maxSupply();
        if (maxSupply > 0n && totalSupply >= maxSupply) {
          return { active: false, reason: 'SOLD OUT (totalSupply >= maxSupply)' };
        }
      } catch (e) {}

      // Update stored condition
      this.activeConditionId = conditionId;
      this.claimCondition = condition;

      return { active: true, method: 'claimCondition.startTimestamp' };
    } catch (e) {
      // If getActiveClaimConditionId fails, no active phase
      return { active: false, reason: `No active claim condition: ${e.message.slice(0, 60)}` };
    }
  }

  // ============================================
  // EXECUTE CLAIM (MINT) - Thirdweb ERC721Drop
  // ============================================

  async executeMint(wallet) {
    const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
    Logger.mint(`Claiming for wallet ${shortAddr}...`);

    const contract = new ethers.Contract(
      config.contractAddress,
      THIRDWEB_DROP_ABI,
      wallet
    );

    // Build claim parameters
    const receiver = wallet.address;
    const quantity = BigInt(config.mintAmount);
    const currency = config.currency;
    const pricePerToken = ethers.parseEther(config.mintPrice);
    const totalValue = pricePerToken * quantity;

    // AllowlistProof (empty for public mint)
    const allowlistProof = {
      proof: config.allowlistProof.proof,
      quantityLimitPerWallet: BigInt(config.allowlistProof.quantityLimitPerWallet),
      pricePerToken: ethers.parseEther(config.allowlistProof.pricePerToken),
      currency: config.allowlistProof.currency,
    };

    // Empty data
    const data = '0x';

    Logger.info(`  Receiver: ${receiver}`);
    Logger.info(`  Quantity: ${quantity.toString()}`);
    Logger.info(`  Price: ${config.mintPrice} ETH x ${config.mintAmount} = ${ethers.formatEther(totalValue)} ETH`);
    Logger.info(`  Currency: ${currency}`);

    // Get aggressive gas settings for FCFS
    const gasSettings = await this.gasEstimator.getOptimalGasSettings();

    let txOverrides = {
      value: totalValue,
      gasLimit: BigInt(config.gasLimit),
      ...gasSettings,
    };

    // Try to estimate gas
    try {
      const estimated = await contract.claim.estimateGas(
        receiver, quantity, currency, pricePerToken, allowlistProof, data,
        { value: totalValue }
      );
      txOverrides.gasLimit = (estimated * BigInt(Math.floor(config.gasMultiplier * 100))) / 100n;
      Logger.gas(`Estimated gas: ${estimated.toString()} (buffered: ${txOverrides.gasLimit.toString()})`);
    } catch (e) {
      Logger.warn(`Gas estimate failed, using default ${config.gasLimit}: ${e.message.slice(0, 80)}`);
    }

    // Execute claim!
    let tx;
    try {
      Logger.mint(`Calling claim()...`);
      tx = await contract.claim(
        receiver,
        quantity,
        currency,
        pricePerToken,
        allowlistProof,
        data,
        txOverrides
      );
    } catch (e) {
      throw new Error(`Claim TX failed: ${e.message}`);
    }

    Logger.mint(`TX sent! Hash: ${tx.hash}`);
    Logger.info(`  Waiting for confirmation...`);

    const receipt = await tx.wait(1);

    if (receipt.status === 1) {
      Logger.success(`CLAIM SUCCESS! Gas used: ${receipt.gasUsed.toString()}`);
      Logger.success(`TX: ${this.getExplorerUrl(tx.hash)}`);
      this.notifier.mintSuccess(tx.hash, shortAddr);
      return { success: true, txHash: tx.hash, wallet: shortAddr };
    } else {
      Logger.error(`TX REVERTED! Hash: ${tx.hash}`);
      this.notifier.mintFailed('Transaction reverted', shortAddr);
      return { success: false, txHash: tx.hash, wallet: shortAddr, error: 'reverted' };
    }
  }

  async executeMintWithRetry(wallet) {
    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        const result = await this.executeMint(wallet);
        return result;
      } catch (error) {
        const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
        Logger.error(`Attempt ${attempt}/${config.maxRetries} failed for ${shortAddr}: ${error.message}`);

        if (attempt < config.maxRetries) {
          Logger.info(`Retrying in ${config.retryDelay}ms...`);
          await this.sleep(config.retryDelay);
        } else {
          this.notifier.mintFailed(error.message, shortAddr);
          return { success: false, wallet: shortAddr, error: error.message };
        }
      }
    }
  }

  async mintAllWallets() {
    if (this.isMinting) return;
    this.isMinting = true;

    Logger.mint(`EXECUTING FCFS CLAIM!`);
    this.notifier.mintOpen();

    // Mint for all wallets in parallel
    const wallets = this.walletManager.getWallets();
    Logger.info(`Claiming for ${wallets.length} wallet(s) in parallel...`);
    const mintPromises = wallets.map(wallet => this.executeMintWithRetry(wallet));
    this.mintResults = await Promise.allSettled(mintPromises);

    // Summary
    Logger.divider();
    Logger.info('CLAIM RESULTS:');
    Logger.divider();

    let successCount = 0;
    for (const result of this.mintResults) {
      if (result.status === 'fulfilled' && result.value && result.value.success) {
        successCount++;
        Logger.success(`${result.value.wallet} - TX: ${result.value.txHash}`);
      } else {
        const val = result.status === 'fulfilled' ? result.value : { wallet: '?', error: result.reason };
        Logger.error(`${val.wallet || '?'} - Error: ${val.error || 'unknown'}`);
      }
    }

    Logger.divider();
    Logger.info(`Total: ${successCount}/${this.mintResults.length} successful`);
    this.isMinting = false;
  }

  // ============================================
  // BOT MODES
  // ============================================

  async runMonitorMode() {
    Logger.info('MODE: MONITOR - Waiting for claim to go live...');
    Logger.info(`Polling every ${config.pollInterval}ms`);
    Logger.divider();

    let pollCount = 0;

    while (true) {
      pollCount++;

      try {
        const status = await this.checkMintActive();

        if (status.active) {
          Logger.success(`CLAIM IS LIVE! (detected via ${status.method})`);
          await this.mintAllWallets();
          break;
        } else {
          if (pollCount % 10 === 0) {
            let totalSupply = '?';
            try { totalSupply = (await this.nftContract.totalSupply()).toString(); } catch (e) {}
            Logger.info(`[Poll #${pollCount}] Not active | Supply: ${totalSupply}/${config.maxSupply} | ${status.reason || ''}`);
          }
        }
      } catch (error) {
        Logger.error(`Monitor error: ${error.message}`);
      }

      await this.sleep(config.pollInterval);
    }
  }

  async runInstantMode() {
    Logger.info('MODE: INSTANT - Claiming immediately!');
    Logger.divider();
    await this.mintAllWallets();
  }

  async runCountdownMode() {
    let targetTime;

    if (/^\d+$/.test(config.mintStartTime)) {
      targetTime = parseInt(config.mintStartTime) * 1000;
    } else {
      targetTime = new Date(config.mintStartTime).getTime();
    }

    if (isNaN(targetTime)) {
      Logger.error('Invalid MINT_START_TIME! Use Unix timestamp or ISO date string');
      process.exit(1);
    }

    const offset = config.countdownOffsetMs;
    const executeTime = targetTime - offset;

    Logger.info('MODE: COUNTDOWN');
    Logger.info(`Target claim time: ${new Date(targetTime).toLocaleString()}`);
    Logger.info(`TX will be sent ${offset}ms BEFORE target time`);
    Logger.divider();

    while (Date.now() < executeTime) {
      const remaining = executeTime - Date.now();
      const secs = Math.floor(remaining / 1000);
      const mins = Math.floor(secs / 60);
      const hours = Math.floor(mins / 60);

      if (remaining > 60000) {
        Logger.info(`Countdown: ${hours}h ${mins % 60}m ${secs % 60}s remaining...`);
        await this.sleep(Math.min(remaining - 1000, 30000));
      } else if (remaining > 5000) {
        Logger.warn(`Countdown: ${secs}s remaining...`);
        await this.sleep(1000);
      } else {
        Logger.mint(`EXECUTING IN ${remaining}ms!`);
        await this.sleep(remaining);
      }
    }

    Logger.mint('TIME! EXECUTING CLAIM NOW!');
    await this.mintAllWallets();
  }

  // ============================================
  // MAIN RUN
  // ============================================

  async run() {
    try {
      await this.initialize();

      switch (config.botMode) {
        case 'monitor':
          await this.runMonitorMode();
          break;
        case 'instant':
          await this.runInstantMode();
          break;
        case 'countdown':
          await this.runCountdownMode();
          break;
        default:
          Logger.error(`Unknown mode: "${config.botMode}". Use: monitor, instant, countdown`);
          process.exit(1);
      }
    } catch (error) {
      Logger.error(`Fatal error: ${error.message}`);
      console.error(error);
      process.exit(1);
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  getExplorerUrl(txHash) {
    const explorers = {
      1: 'https://etherscan.io/tx/',
      5: 'https://goerli.etherscan.io/tx/',
      11155111: 'https://sepolia.etherscan.io/tx/',
    };
    const base = explorers[config.chainId] || 'https://etherscan.io/tx/';
    return `${base}${txHash}`;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================
// START BOT
// ============================================

const bot = new LobsterMintBot();

process.on('SIGINT', () => {
  Logger.warn('\nBot stopped by user');
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  Logger.error(`Unhandled rejection: ${error.message}`);
});

bot.run();
