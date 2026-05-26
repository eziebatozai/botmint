#!/usr/bin/env node

const { ethers } = require('ethers');
const { config, validateConfig } = require('./config');
const { NFT_CONTRACT_ABI, SEADROP_ABI, SEADROP_ADDRESSES, OPENSEA_FEE_RECIPIENT } = require('./abi');
const Logger = require('./utils/logger');
const WalletManager = require('./utils/wallet');
const GasEstimator = require('./utils/gas');
const Notifier = require('./utils/notifier');

// ============================================
// MAIN BOT CLASS - SeaDrop PUBLIC MINT (Ethereum)
// ============================================

class MintBot {
  constructor() {
    this.provider = null;
    this.walletManager = null;
    this.gasEstimator = null;
    this.notifier = null;
    this.nftContract = null;
    this.seaDropContract = null;
    this.seaDropAddress = null;
    this.feeRecipient = OPENSEA_FEE_RECIPIENT;
    this.isMinting = false;
    this.mintResults = [];
  }

  async initialize() {
    Logger.banner();
    validateConfig();

    // Setup provider dengan fallback
    this.provider = await this.setupProvider();
    
    // Setup wallet
    this.walletManager = new WalletManager(this.provider);
    this.walletManager.loadWallets();
    await this.walletManager.checkBalances();

    // Setup gas estimator
    this.gasEstimator = new GasEstimator(this.provider, config);

    // Setup notifier
    this.notifier = new Notifier(config.enableNotifications);

    // Setup NFT contract (untuk monitoring)
    this.nftContract = new ethers.Contract(
      config.contractAddress,
      NFT_CONTRACT_ABI,
      this.provider
    );

    // Setup SeaDrop contract
    this.seaDropAddress = SEADROP_ADDRESSES[config.chainId] || SEADROP_ADDRESSES[1];
    this.seaDropContract = new ethers.Contract(
      this.seaDropAddress,
      SEADROP_ABI,
      this.provider
    );

    // Resolve fee recipient dari contract
    await this.resolveFeeRecipient();

    Logger.info(`NFT Contract: ${config.contractAddress}`);
    Logger.info(`SeaDrop Contract: ${this.seaDropAddress}`);
    Logger.info(`Fee Recipient: ${this.feeRecipient}`);
    Logger.info(`Collection: ${config.collectionSlug}`);
    Logger.info(`Mint Price: ${config.mintPrice} ETH`);
    Logger.info(`Mint Amount: ${config.mintAmount}`);
    Logger.info(`Chain: Ethereum (${config.chainId})`);
    Logger.info(`Mode: ${config.botMode}`);
    Logger.divider();

    // Show public drop info
    await this.showPublicDropInfo();
  }

  async setupProvider() {
    try {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
      const network = await provider.getNetwork();
      Logger.success(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
      return provider;
    } catch (error) {
      Logger.warn(`Primary RPC gagal: ${error.message}`);
      
      // Coba backup RPCs
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

      throw new Error('Semua RPC gagal! Periksa konfigurasi RPC_URL');
    }
  }

  async resolveFeeRecipient() {
    try {
      const feeRecipients = await this.seaDropContract.getAllowedFeeRecipients(config.contractAddress);
      if (feeRecipients && feeRecipients.length > 0) {
        this.feeRecipient = feeRecipients[0];
        Logger.info(`Fee recipient resolved: ${this.feeRecipient}`);
      }
    } catch (e) {
      Logger.warn(`Tidak bisa resolve fee recipient, menggunakan default: ${this.feeRecipient}`);
    }
  }

  async showPublicDropInfo() {
    try {
      const publicDrop = await this.seaDropContract.getPublicDrop(config.contractAddress);
      
      const mintPrice = ethers.formatEther(publicDrop.mintPrice || 0n);
      const startTime = Number(publicDrop.startTime);
      const endTime = Number(publicDrop.endTime);
      const maxPerWallet = Number(publicDrop.maxTotalMintableByWallet);
      const now = Math.floor(Date.now() / 1000);

      Logger.divider();
      Logger.info('📋 PUBLIC DROP INFO (on-chain):');
      Logger.info(`   Mint Price: ${mintPrice} ETH`);
      Logger.info(`   Max/Wallet: ${maxPerWallet}`);
      Logger.info(`   Start: ${startTime > 0 ? new Date(startTime * 1000).toLocaleString() : 'Not set'}`);
      Logger.info(`   End: ${endTime > 0 ? new Date(endTime * 1000).toLocaleString() : 'Not set'}`);
      
      if (startTime > 0 && now >= startTime && (endTime === 0 || now < endTime)) {
        Logger.success(`   Status: 🟢 PUBLIC MINT AKTIF!`);
      } else if (startTime > 0 && now < startTime) {
        const diff = startTime - now;
        Logger.warn(`   Status: ⏳ Belum mulai (${Math.floor(diff / 60)} menit lagi)`);
      } else if (endTime > 0 && now >= endTime) {
        Logger.error(`   Status: 🔴 SUDAH BERAKHIR`);
      } else {
        Logger.warn(`   Status: ❓ Tidak bisa ditentukan`);
      }
      Logger.divider();
    } catch (e) {
      Logger.warn(`Tidak bisa fetch public drop info: ${e.message}`);
      Logger.info('Bot tetap akan mencoba mint...');
      Logger.divider();
    }
  }

  // ============================================
  // PUBLIC MINT STATUS CHECK
  // ============================================

  async checkPublicMintStatus() {
    try {
      const publicDrop = await this.seaDropContract.getPublicDrop(config.contractAddress);
      
      const startTime = Number(publicDrop.startTime);
      const endTime = Number(publicDrop.endTime);
      const now = Math.floor(Date.now() / 1000);

      if (startTime === 0) {
        return { active: false, reason: 'Public mint belum dikonfigurasi (startTime=0)' };
      }

      if (now < startTime) {
        const diff = startTime - now;
        return { active: false, reason: `Belum mulai (${Math.floor(diff / 60)}m ${diff % 60}s lagi)` };
      }

      if (endTime > 0 && now >= endTime) {
        return { active: false, reason: 'Public mint sudah berakhir' };
      }

      return { active: true };
    } catch (e) {
      return { active: false, reason: `Error cek status: ${e.message}` };
    }
  }

  async getSupplyInfo() {
    try {
      let totalSupply = '?';
      let maxSupply = '?';

      try { totalSupply = (await this.nftContract.totalSupply()).toString(); } catch (e) {}
      try { maxSupply = (await this.nftContract.maxSupply()).toString(); } catch (e) {}

      return { totalSupply, maxSupply };
    } catch (e) {
      return { totalSupply: '?', maxSupply: '?' };
    }
  }

  // ============================================
  // SEADROP PUBLIC MINT EXECUTION
  // ============================================

  async executeMint(wallet) {
    const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
    Logger.mint(`🎯 Memulai PUBLIC MINT untuk wallet ${shortAddr}...`);

    const connectedSeaDrop = this.seaDropContract.connect(wallet);

    // Hitung total value (mintPrice * quantity)
    const mintPriceWei = ethers.parseEther(config.mintPrice);
    const totalValue = mintPriceWei * BigInt(config.mintAmount);

    Logger.info(`   Value: ${ethers.formatEther(totalValue)} ETH (${config.mintAmount} x ${config.mintPrice} ETH)`);

    // Get gas settings
    const gasSettings = await this.gasEstimator.getOptimalGasSettings();

    const txOverrides = {
      value: totalValue,
      ...gasSettings,
    };

    // Estimate gas limit
    try {
      const estimated = await connectedSeaDrop.mintPublic.estimateGas(
        config.contractAddress,
        this.feeRecipient,
        ethers.ZeroAddress, // minterIfNotPayer = payer sendiri
        config.mintAmount,
        { value: totalValue }
      );
      txOverrides.gasLimit = (estimated * BigInt(Math.floor(config.gasMultiplier * 100))) / 100n;
      Logger.gas(`Estimated gas: ${estimated.toString()} (with buffer: ${txOverrides.gasLimit.toString()})`);
    } catch (e) {
      Logger.warn(`Gas estimate gagal: ${e.message}`);
      // Fallback gas limit untuk public mint di Ethereum
      txOverrides.gasLimit = 200000n;
      Logger.info(`Menggunakan fallback gasLimit: 200000`);
    }

    // Execute SeaDrop mintPublic!
    Logger.mint(`Calling SeaDrop.mintPublic(${config.contractAddress}, ${this.feeRecipient}, 0x0, ${config.mintAmount})`);

    const tx = await connectedSeaDrop.mintPublic(
      config.contractAddress,
      this.feeRecipient,
      ethers.ZeroAddress,
      config.mintAmount,
      txOverrides
    );

    Logger.mint(`TX dikirim! Hash: ${tx.hash}`);
    Logger.info(`Menunggu konfirmasi...`);

    const receipt = await tx.wait(1);

    if (receipt.status === 1) {
      Logger.success(`✅ MINT BERHASIL! Gas used: ${receipt.gasUsed.toString()}`);
      Logger.success(`TX: https://etherscan.io/tx/${tx.hash}`);
      this.notifier.mintSuccess(tx.hash, shortAddr);
      return { success: true, txHash: tx.hash, wallet: shortAddr };
    } else {
      Logger.error(`❌ TX reverted! Hash: ${tx.hash}`);
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
        Logger.error(`Attempt ${attempt}/${config.maxRetries} gagal untuk ${shortAddr}: ${error.message}`);
        
        if (attempt < config.maxRetries) {
          Logger.info(`Retry dalam ${config.retryDelay}ms...`);
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

    const wallets = this.walletManager.getWallets();
    Logger.mint(`🚀 EKSEKUSI PUBLIC MINT UNTUK ${wallets.length} WALLET(S)!`);
    this.notifier.mintOpen();

    // Mint semua wallet secara paralel
    const mintPromises = wallets.map(wallet => this.executeMintWithRetry(wallet));
    this.mintResults = await Promise.allSettled(mintPromises);

    // Summary
    Logger.divider();
    Logger.info('📊 HASIL MINT:');
    Logger.divider();

    let successCount = 0;
    for (const result of this.mintResults) {
      if (result.status === 'fulfilled' && result.value.success) {
        successCount++;
        Logger.success(`✅ ${result.value.wallet} - TX: ${result.value.txHash}`);
      } else {
        const val = result.status === 'fulfilled' ? result.value : { wallet: '?', error: result.reason };
        Logger.error(`❌ ${val.wallet} - Error: ${val.error}`);
      }
    }

    Logger.divider();
    Logger.info(`Total: ${successCount}/${wallets.length} berhasil`);
    this.isMinting = false;
  }

  // ============================================
  // BOT MODES
  // ============================================

  async runMonitorMode() {
    Logger.info('🔍 Mode MONITOR - Menunggu PUBLIC MINT aktif...');
    Logger.info(`Polling setiap ${config.pollInterval}ms`);
    Logger.divider();

    let pollCount = 0;

    while (true) {
      pollCount++;
      
      try {
        const status = await this.checkPublicMintStatus();
        const supply = await this.getSupplyInfo();

        if (status.active) {
          Logger.success(`🟢 PUBLIC MINT TERBUKA! Supply: ${supply.totalSupply}/${supply.maxSupply}`);
          await this.mintAllWallets();
          break;
        } else {
          // Update status setiap 10 poll
          if (pollCount % 10 === 0) {
            Logger.info(`⏳ Public mint belum aktif... (poll #${pollCount}) Supply: ${supply.totalSupply}/${supply.maxSupply} | ${status.reason || ''}`);
          }
        }
      } catch (error) {
        Logger.error(`Monitor error: ${error.message}`);
      }

      await this.sleep(config.pollInterval);
    }
  }

  async runInstantMode() {
    Logger.info('⚡ Mode INSTANT - Langsung mint PUBLIC!');
    Logger.divider();
    await this.mintAllWallets();
  }

  // ============================================
  // MAIN RUN
  // ============================================

  async run() {
    try {
      await this.initialize();

      if (config.botMode === 'monitor') {
        await this.runMonitorMode();
      } else if (config.botMode === 'instant') {
        await this.runInstantMode();
      } else {
        Logger.error(`Mode "${config.botMode}" tidak dikenal. Gunakan "monitor" atau "instant"`);
        process.exit(1);
      }
    } catch (error) {
      Logger.error(`Fatal error: ${error.message}`);
      console.error(error);
      process.exit(1);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================
// START BOT
// ============================================

const bot = new MintBot();

// Handle graceful shutdown
process.on('SIGINT', () => {
  Logger.warn('\n⛔ Bot dihentikan oleh user');
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  Logger.error(`Unhandled rejection: ${error.message}`);
});

bot.run();
