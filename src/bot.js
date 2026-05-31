#!/usr/bin/env node

const { ethers } = require('ethers');
const { config, validateConfig } = require('./config');
const { NFT_READ_ABI, MINT_FUNCTIONS_ABI, SEADROP_ABI, SEADROP_ADDRESSES, OPENSEA_FEE_RECIPIENT } = require('./abi');
const Logger = require('./utils/logger');
const WalletManager = require('./utils/wallet');
const GasEstimator = require('./utils/gas');
const Notifier = require('./utils/notifier');

// ============================================
// LOBSTER NFT - FCFS MINT BOT
// Speed-optimized for First Come First Serve
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
    this.mintFunctionName = null;
    this.mintFunctionFragment = null;
    this.preSignedTxs = [];
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
      [...NFT_READ_ABI, ...MINT_FUNCTIONS_ABI],
      this.provider
    );

    // Detect mint function
    await this.detectMintFunction();

    // Display config
    Logger.info(`Contract: ${config.contractAddress}`);
    Logger.info(`Collection: ${config.collectionName}`);
    Logger.info(`Mint Price: ${config.mintPrice} ETH`);
    Logger.info(`Mint Amount: ${config.mintAmount}`);
    Logger.info(`Mint Function: ${this.mintFunctionName}`);
    Logger.info(`Chain ID: ${config.chainId}`);
    Logger.info(`Mode: ${config.botMode.toUpperCase()}`);
    Logger.info(`Speed: ${config.speedMode.toUpperCase()}`);
    Logger.divider();

    // Show contract info
    await this.showContractInfo();

    // Pre-sign transactions if enabled
    if (config.preSign && config.botMode === 'monitor') {
      await this.preSignTransactions();
    }
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

  // ============================================
  // DETECT MINT FUNCTION (auto-detect from contract)
  // ============================================

  async detectMintFunction() {
    const mintFunc = config.mintFunction.toLowerCase();

    if (mintFunc === 'custom') {
      // Custom function signature
      this.mintFunctionName = config.customMintSig;
      Logger.info(`Using custom mint function: ${this.mintFunctionName}`);
      return;
    }

    // Mapping of common function names
    const functionMap = {
      'mint': 'mint(uint256)',
      'publicmint': 'publicMint(uint256)',
      'mintpublic': 'mintPublic(uint256)',
      'claim': 'claim(uint256)',
      'purchase': 'purchase(uint256)',
      'safemint': 'safeMint(uint256)',
      'mintnft': 'mintNFT(uint256)',
      'buy': 'buy(uint256)',
    };

    this.mintFunctionName = functionMap[mintFunc] || 'mint(uint256)';

    // Try to verify function exists on contract
    try {
      const code = await this.provider.getCode(config.contractAddress);
      if (code === '0x') {
        Logger.error('Contract address has no code! Check CONTRACT_ADDRESS');
        process.exit(1);
      }
      Logger.success(`Contract verified at ${config.contractAddress}`);
    } catch (e) {
      Logger.warn(`Cannot verify contract: ${e.message}`);
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
      if (maxSupply === '?') {
        try { maxSupply = (await this.nftContract.MAX_SUPPLY()).toString(); } catch (e) {}
      }

      Logger.divider();
      Logger.info(`Name: ${name} (${symbol})`);
      Logger.info(`Supply: ${totalSupply} / ${maxSupply}`);

      // Check mint status
      const mintStatus = await this.checkMintActive();
      if (mintStatus.active) {
        Logger.success(`Mint Status: ACTIVE`);
      } else {
        Logger.warn(`Mint Status: ${mintStatus.reason}`);
      }

      // Check on-chain price
      let onchainPrice = null;
      try { onchainPrice = await this.nftContract.mintPrice(); } catch (e) {}
      if (!onchainPrice) try { onchainPrice = await this.nftContract.price(); } catch (e) {}
      if (!onchainPrice) try { onchainPrice = await this.nftContract.PRICE(); } catch (e) {}
      if (!onchainPrice) try { onchainPrice = await this.nftContract.cost(); } catch (e) {}
      if (!onchainPrice) try { onchainPrice = await this.nftContract.getPrice(); } catch (e) {}
      if (!onchainPrice) try { onchainPrice = await this.nftContract.publicPrice(); } catch (e) {}

      if (onchainPrice) {
        Logger.info(`On-chain Price: ${ethers.formatEther(onchainPrice)} ETH`);
      }

      Logger.divider();
    } catch (e) {
      Logger.warn(`Cannot fetch contract info: ${e.message}`);
    }
  }

  // ============================================
  // CHECK MINT STATUS (supports various contracts)
  // ============================================

  async checkMintActive() {
    // Try various mint status functions
    const checks = [
      { fn: 'mintActive', invert: false },
      { fn: 'isMintActive', invert: false },
      { fn: 'saleActive', invert: false },
      { fn: 'publicSaleActive', invert: false },
      { fn: 'isPublicSaleActive', invert: false },
      { fn: 'saleIsActive', invert: false },
      { fn: 'mintEnabled', invert: false },
      { fn: 'publicMintOpen', invert: false },
      { fn: 'paused', invert: true }, // paused=false means active
    ];

    for (const check of checks) {
      try {
        const result = await this.nftContract[check.fn]();
        const isActive = check.invert ? !result : result;
        if (isActive) {
          return { active: true, method: check.fn };
        } else {
          return { active: false, reason: `${check.fn}() = ${result}` };
        }
      } catch (e) {
        // Function doesn't exist, try next
        continue;
      }
    }

    // If no status function found, try estimating gas for mint
    try {
      const wallet = this.walletManager.getPrimaryWallet();
      const contract = this.nftContract.connect(wallet);
      const mintPriceWei = ethers.parseEther(config.mintPrice);

      await contract.mint.estimateGas(config.mintAmount, { value: mintPriceWei });
      return { active: true, method: 'gas_estimate' };
    } catch (e) {
      if (e.message.includes('not active') || e.message.includes('not started') || e.message.includes('paused')) {
        return { active: false, reason: `Mint not active (${e.message.slice(0, 60)})` };
      }
      // Could be active but failing for other reasons
      return { active: false, reason: `Unknown (${e.message.slice(0, 60)})` };
    }
  }

  // ============================================
  // PRE-SIGN TRANSACTIONS (for speed)
  // ============================================

  async preSignTransactions() {
    Logger.info('Pre-signing transactions for maximum speed...');
    const wallets = this.walletManager.getWallets();

    for (const wallet of wallets) {
      try {
        const nonce = await this.provider.getTransactionCount(wallet.address, 'pending');
        const mintPriceWei = ethers.parseEther(config.mintPrice);
        const totalValue = mintPriceWei * BigInt(config.mintAmount);

        // Build transaction data
        const iface = new ethers.Interface(MINT_FUNCTIONS_ABI);
        let txData;

        try {
          txData = iface.encodeFunctionData(this.mintFunctionName, [config.mintAmount]);
        } catch (e) {
          // Fallback: try mint(uint256)
          txData = iface.encodeFunctionData('mint(uint256)', [config.mintAmount]);
        }

        const gasSettings = await this.gasEstimator.getOptimalGasSettings();

        const tx = {
          to: config.contractAddress,
          value: totalValue,
          data: txData,
          nonce: nonce,
          gasLimit: BigInt(config.gasLimit),
          chainId: config.chainId,
          ...gasSettings,
        };

        const signedTx = await wallet.signTransaction(tx);
        this.preSignedTxs.push({
          wallet: wallet.address,
          signedTx,
          nonce,
        });

        const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
        Logger.success(`Pre-signed TX for ${shortAddr} (nonce: ${nonce})`);
      } catch (e) {
        Logger.warn(`Failed to pre-sign for ${wallet.address.slice(0, 8)}...: ${e.message}`);
      }
    }

    if (this.preSignedTxs.length > 0) {
      Logger.success(`${this.preSignedTxs.length} transaction(s) pre-signed and ready!`);
    }
    Logger.divider();
  }

  // ============================================
  // EXECUTE MINT - FCFS OPTIMIZED
  // ============================================

  async executeMint(wallet) {
    const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
    Logger.mint(`Minting for wallet ${shortAddr}...`);

    const contract = new ethers.Contract(
      config.contractAddress,
      [...NFT_READ_ABI, ...MINT_FUNCTIONS_ABI],
      wallet
    );

    const mintPriceWei = ethers.parseEther(config.mintPrice);
    const totalValue = mintPriceWei * BigInt(config.mintAmount);

    Logger.info(`   Value: ${ethers.formatEther(totalValue)} ETH (${config.mintAmount} x ${config.mintPrice} ETH)`);

    // Get aggressive gas settings for FCFS
    const gasSettings = await this.gasEstimator.getOptimalGasSettings();

    const txOverrides = {
      value: totalValue,
      gasLimit: BigInt(config.gasLimit),
      ...gasSettings,
    };

    // Try to estimate gas (if fails, use configured gasLimit)
    try {
      const fnName = this.mintFunctionName.split('(')[0];
      if (contract[fnName]) {
        const estimated = await contract[fnName].estimateGas(config.mintAmount, { value: totalValue });
        txOverrides.gasLimit = (estimated * BigInt(Math.floor(config.gasMultiplier * 100))) / 100n;
        Logger.gas(`Estimated gas: ${estimated.toString()} (buffered: ${txOverrides.gasLimit.toString()})`);
      }
    } catch (e) {
      Logger.warn(`Gas estimate failed, using default ${config.gasLimit}: ${e.message.slice(0, 60)}`);
    }

    // Execute mint!
    let tx;
    const fnName = this.mintFunctionName.split('(')[0];

    try {
      if (contract[fnName]) {
        Logger.mint(`Calling ${this.mintFunctionName}(${config.mintAmount})...`);
        tx = await contract[fnName](config.mintAmount, txOverrides);
      } else {
        // Fallback: raw transaction
        Logger.mint(`Sending raw transaction to ${config.contractAddress}...`);
        const iface = new ethers.Interface(MINT_FUNCTIONS_ABI);
        const data = iface.encodeFunctionData(this.mintFunctionName, [config.mintAmount]);
        tx = await wallet.sendTransaction({
          to: config.contractAddress,
          data,
          ...txOverrides,
        });
      }
    } catch (e) {
      throw new Error(`Mint TX failed: ${e.message}`);
    }

    Logger.mint(`TX sent! Hash: ${tx.hash}`);
    Logger.info(`   Waiting for confirmation...`);

    const receipt = await tx.wait(1);

    if (receipt.status === 1) {
      Logger.success(`MINT SUCCESS! Gas used: ${receipt.gasUsed.toString()}`);
      Logger.success(`TX: ${this.getExplorerUrl(tx.hash)}`);
      this.notifier.mintSuccess(tx.hash, shortAddr);
      return { success: true, txHash: tx.hash, wallet: shortAddr };
    } else {
      Logger.error(`TX REVERTED! Hash: ${tx.hash}`);
      this.notifier.mintFailed('Transaction reverted', shortAddr);
      return { success: false, txHash: tx.hash, wallet: shortAddr, error: 'reverted' };
    }
  }

  // Send pre-signed transaction (fastest method)
  async sendPreSignedTx(preSigned) {
    const shortAddr = `${preSigned.wallet.slice(0, 6)}...${preSigned.wallet.slice(-4)}`;
    Logger.mint(`Sending pre-signed TX for ${shortAddr}...`);

    try {
      const txResponse = await this.provider.broadcastTransaction(preSigned.signedTx);
      Logger.mint(`TX broadcast! Hash: ${txResponse.hash}`);

      const receipt = await txResponse.wait(1);
      if (receipt.status === 1) {
        Logger.success(`MINT SUCCESS (pre-signed)! Gas: ${receipt.gasUsed.toString()}`);
        Logger.success(`TX: ${this.getExplorerUrl(txResponse.hash)}`);
        this.notifier.mintSuccess(txResponse.hash, shortAddr);
        return { success: true, txHash: txResponse.hash, wallet: shortAddr };
      } else {
        return { success: false, txHash: txResponse.hash, wallet: shortAddr, error: 'reverted' };
      }
    } catch (e) {
      Logger.warn(`Pre-signed TX failed for ${shortAddr}: ${e.message}`);
      // Fallback to normal mint
      const wallet = this.walletManager.getWallets().find(w => w.address === preSigned.wallet);
      if (wallet) {
        return await this.executeMint(wallet);
      }
      return { success: false, wallet: shortAddr, error: e.message };
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

    Logger.mint(`EXECUTING FCFS MINT!`);
    this.notifier.mintOpen();

    // Use pre-signed TXs if available
    if (this.preSignedTxs.length > 0) {
      Logger.info(`Using ${this.preSignedTxs.length} pre-signed transaction(s)...`);
      const promises = this.preSignedTxs.map(ps => this.sendPreSignedTx(ps));
      this.mintResults = await Promise.allSettled(promises);
    } else {
      // Normal mint for all wallets in parallel
      const wallets = this.walletManager.getWallets();
      Logger.info(`Minting for ${wallets.length} wallet(s) in parallel...`);
      const mintPromises = wallets.map(wallet => this.executeMintWithRetry(wallet));
      this.mintResults = await Promise.allSettled(mintPromises);
    }

    // Summary
    Logger.divider();
    Logger.info('MINT RESULTS:');
    Logger.divider();

    let successCount = 0;
    for (const result of this.mintResults) {
      if (result.status === 'fulfilled' && result.value.success) {
        successCount++;
        Logger.success(`${result.value.wallet} - TX: ${result.value.txHash}`);
      } else {
        const val = result.status === 'fulfilled' ? result.value : { wallet: '?', error: result.reason };
        Logger.error(`${val.wallet} - Error: ${val.error}`);
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
    Logger.info('MODE: MONITOR - Waiting for mint to go live...');
    Logger.info(`Polling every ${config.pollInterval}ms`);
    Logger.divider();

    let pollCount = 0;

    while (true) {
      pollCount++;

      try {
        const status = await this.checkMintActive();

        if (status.active) {
          Logger.success(`MINT IS LIVE! (detected via ${status.method})`);
          await this.mintAllWallets();
          break;
        } else {
          if (pollCount % 10 === 0) {
            let totalSupply = '?';
            try { totalSupply = (await this.nftContract.totalSupply()).toString(); } catch (e) {}
            Logger.info(`[Poll #${pollCount}] Mint not active | Supply: ${totalSupply} | ${status.reason || ''}`);
          }
        }
      } catch (error) {
        Logger.error(`Monitor error: ${error.message}`);
      }

      await this.sleep(config.pollInterval);
    }
  }

  async runInstantMode() {
    Logger.info('MODE: INSTANT - Minting immediately!');
    Logger.divider();
    await this.mintAllWallets();
  }

  async runCountdownMode() {
    let targetTime;

    if (/^\d+$/.test(config.mintStartTime)) {
      targetTime = parseInt(config.mintStartTime) * 1000; // Unix timestamp to ms
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
    Logger.info(`Target mint time: ${new Date(targetTime).toLocaleString()}`);
    Logger.info(`TX will be sent ${offset}ms BEFORE target time`);
    Logger.divider();

    // Wait until execute time
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
        // Final milliseconds - tight loop
        Logger.mint(`EXECUTING IN ${remaining}ms!`);
        await this.sleep(remaining);
      }
    }

    Logger.mint('TIME! EXECUTING MINT NOW!');
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
      8453: 'https://basescan.org/tx/',
      137: 'https://polygonscan.com/tx/',
      42161: 'https://arbiscan.io/tx/',
      10: 'https://optimistic.etherscan.io/tx/',
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
