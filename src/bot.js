#!/usr/bin/env node

const { ethers } = require('ethers');
const { config, validateConfig } = require('./config');
const { MINT_ABI } = require('./abi');
const Logger = require('./utils/logger');
const WalletManager = require('./utils/wallet');
const GasEstimator = require('./utils/gas');
const Notifier = require('./utils/notifier');

// ============================================
// MAIN BOT CLASS
// ============================================

class MintBot {
  constructor() {
    this.provider = null;
    this.walletManager = null;
    this.gasEstimator = null;
    this.notifier = null;
    this.contract = null;
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

    // Setup contract
    this.contract = new ethers.Contract(
      config.contractAddress,
      MINT_ABI,
      this.provider
    );

    Logger.info(`Contract: ${config.contractAddress}`);
    Logger.info(`Mint Function: ${config.mintFunction}`);
    Logger.info(`Mint Price: ${config.mintPrice} ETH`);
    Logger.info(`Mint Amount: ${config.mintAmount}`);
    Logger.info(`Mode: ${config.botMode}`);
    Logger.divider();
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

  // ============================================
  // MINT STATUS MONITORING
  // ============================================

  async checkMintStatus() {
    const checks = [
      { fn: 'mintActive', name: 'mintActive' },
      { fn: 'isPublicMintActive', name: 'isPublicMintActive' },
      { fn: 'publicSaleActive', name: 'publicSaleActive' },
      { fn: 'saleIsActive', name: 'saleIsActive' },
    ];

    for (const check of checks) {
      try {
        const result = await this.contract[check.fn]();
        if (result === true) {
          Logger.success(`Mint AKTIF! (via ${check.name})`);
          return true;
        }
        return false;
      } catch (e) {
        // Function tidak ada di contract, skip
        continue;
      }
    }

    // Cek paused (inverted logic)
    try {
      const paused = await this.contract.paused();
      if (paused === false) {
        Logger.success('Contract NOT paused - mint mungkin aktif');
        return true;
      }
      return false;
    } catch (e) {
      // Skip
    }

    // Jika tidak bisa detect, coba langsung estimasi gas (jika berhasil = mint aktif)
    try {
      const wallet = this.walletManager.getPrimaryWallet();
      const connectedContract = this.contract.connect(wallet);
      const mintValue = ethers.parseEther(config.mintPrice);
      
      await connectedContract[config.mintFunction].estimateGas(
        config.mintAmount,
        { value: mintValue }
      );
      Logger.success('Mint AKTIF! (gas estimate berhasil)');
      return true;
    } catch (e) {
      if (e.message && (e.message.includes('not active') || e.message.includes('not started') || e.message.includes('paused'))) {
        return false;
      }
      // Error lain mungkin berarti fungsi membutuhkan parameter berbeda
      // Coba tanpa parameter
      try {
        const wallet = this.walletManager.getPrimaryWallet();
        const connectedContract = this.contract.connect(wallet);
        const mintValue = ethers.parseEther(config.mintPrice);
        
        await connectedContract[config.mintFunction].estimateGas({ value: mintValue });
        Logger.success('Mint AKTIF! (gas estimate berhasil, no params)');
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  async getSupplyInfo() {
    try {
      let totalSupply = '?';
      let maxSupply = '?';

      try { totalSupply = (await this.contract.totalSupply()).toString(); } catch (e) {}
      try { maxSupply = (await this.contract.maxSupply()).toString(); } catch (e) {
        try { maxSupply = (await this.contract.MAX_SUPPLY()).toString(); } catch (e2) {}
      }

      return { totalSupply, maxSupply };
    } catch (e) {
      return { totalSupply: '?', maxSupply: '?' };
    }
  }

  // ============================================
  // MINT EXECUTION
  // ============================================

  async executeMint(wallet) {
    const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
    Logger.mint(`Memulai mint untuk wallet ${shortAddr}...`);

    const connectedContract = this.contract.connect(wallet);
    const mintValue = ethers.parseEther(config.mintPrice) * BigInt(config.mintAmount);

    // Get gas settings
    const gasSettings = await this.gasEstimator.getOptimalGasSettings();

    // Determine mint arguments
    let tx;
    const txOverrides = {
      value: mintValue,
      ...gasSettings,
    };

    // Estimate gas limit
    try {
      const gasLimit = await this.gasEstimator.estimateGasLimit(
        connectedContract,
        config.mintFunction,
        [config.mintAmount],
        mintValue
      );
      txOverrides.gasLimit = gasLimit;
    } catch (e) {
      // Coba tanpa parameter
      try {
        const gasLimit = await this.gasEstimator.estimateGasLimit(
          connectedContract,
          config.mintFunction,
          [],
          mintValue
        );
        txOverrides.gasLimit = gasLimit;
      } catch (e2) {
        txOverrides.gasLimit = 300000n;
      }
    }

    // Execute mint transaction
    try {
      // Coba dengan quantity parameter dulu
      tx = await connectedContract[config.mintFunction](config.mintAmount, txOverrides);
    } catch (e) {
      // Jika gagal, coba tanpa parameter
      try {
        tx = await connectedContract[config.mintFunction](txOverrides);
      } catch (e2) {
        throw new Error(`Mint gagal: ${e2.reason || e2.message}`);
      }
    }

    Logger.mint(`TX dikirim! Hash: ${tx.hash}`);
    Logger.info(`Menunggu konfirmasi...`);

    // Tunggu konfirmasi
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
    Logger.mint(`🚀 EKSEKUSI MINT UNTUK ${wallets.length} WALLET(S)!`);
    this.notifier.mintOpen();

    // Mint semua wallet secara paralel untuk kecepatan FCFS
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
    Logger.info('🔍 Mode MONITOR - Menunggu mint dibuka...');
    Logger.info(`Polling setiap ${config.pollInterval}ms`);
    Logger.divider();

    let pollCount = 0;

    while (true) {
      pollCount++;
      
      try {
        const isActive = await this.checkMintStatus();
        const supply = await this.getSupplyInfo();

        if (isActive) {
          Logger.success(`🟢 MINT TERBUKA! Supply: ${supply.totalSupply}/${supply.maxSupply}`);
          await this.mintAllWallets();
          break;
        } else {
          // Update status setiap 10 poll
          if (pollCount % 10 === 0) {
            Logger.info(`⏳ Mint belum aktif... (poll #${pollCount}) Supply: ${supply.totalSupply}/${supply.maxSupply}`);
          }
        }
      } catch (error) {
        Logger.error(`Monitor error: ${error.message}`);
      }

      await this.sleep(config.pollInterval);
    }
  }

  async runInstantMode() {
    Logger.info('⚡ Mode INSTANT - Langsung mint!');
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
