#!/usr/bin/env node

const { ethers } = require('ethers');
const { config, validateConfig } = require('./config');
const { NFT_CONTRACT_ABI, SEADROP_ABI, SEADROP_ADDRESSES, OPENSEA_FEE_RECIPIENT } = require('./abi');
const Logger = require('./utils/logger');
const WalletManager = require('./utils/wallet');
const GasEstimator = require('./utils/gas');
const Notifier = require('./utils/notifier');

// ============================================
// MAIN BOT CLASS - SeaDrop Mint
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

    // Setup SeaDrop contract (untuk mint!)
    this.seaDropAddress = SEADROP_ADDRESSES[config.chainId] || SEADROP_ADDRESSES[8453];
    this.seaDropContract = new ethers.Contract(
      this.seaDropAddress,
      SEADROP_ABI,
      this.provider
    );

    // Coba ambil fee recipient dari contract
    await this.resolveFeeRecipient();

    Logger.info(`NFT Contract: ${config.contractAddress}`);
    Logger.info(`SeaDrop Contract: ${this.seaDropAddress}`);
    Logger.info(`Fee Recipient: ${this.feeRecipient}`);
    Logger.info(`Mint Amount: ${config.mintAmount}`);
    Logger.info(`Mode: ${config.botMode}`);
    Logger.divider();

    // Tampilkan info public drop jika tersedia
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
      Logger.warn(`Tidak bisa resolve fee recipient, menggunakan default OpenSea: ${this.feeRecipient}`);
    }
  }

  async showPublicDropInfo() {
    try {
      const publicDrop = await this.seaDropContract.getPublicDrop(config.contractAddress);
      
      const mintPrice = ethers.formatEther(publicDrop.mintPrice);
      const startTime = new Date(Number(publicDrop.startTime) * 1000);
      const endTime = Number(publicDrop.endTime) === 0 ? 'No end' : new Date(Number(publicDrop.endTime) * 1000);
      const maxPerWallet = Number(publicDrop.maxTotalMintableByWallet);

      Logger.divider();
      Logger.info('📋 PUBLIC DROP INFO:');
      Logger.info(`   Mint Price: ${mintPrice} ETH`);
      Logger.info(`   Start Time: ${startTime.toLocaleString()}`);
      Logger.info(`   End Time: ${endTime}`);
      Logger.info(`   Max Per Wallet: ${maxPerWallet}`);
      Logger.info(`   Fee BPS: ${Number(publicDrop.feeBps)}`);
      Logger.divider();

      // Auto-set mint price jika belum diset
      if (config.mintPrice === '0' && publicDrop.mintPrice > 0n) {
        config.mintPrice = mintPrice;
        Logger.info(`💰 Auto-detected mint price: ${mintPrice} ETH`);
      }

      // Cek apakah mint sudah aktif berdasarkan waktu
      const now = Math.floor(Date.now() / 1000);
      if (Number(publicDrop.startTime) > now) {
        const diff = Number(publicDrop.startTime) - now;
        Logger.warn(`⏰ Mint belum dibuka! Mulai dalam ${Math.floor(diff / 60)} menit ${diff % 60} detik`);
      } else if (Number(publicDrop.endTime) > 0 && Number(publicDrop.endTime) < now) {
        Logger.error(`❌ Mint sudah berakhir!`);
      } else {
        Logger.success(`🟢 Mint AKTIF berdasarkan waktu!`);
      }

    } catch (e) {
      Logger.warn(`Tidak bisa membaca public drop info: ${e.message}`);
    }
  }

  // ============================================
  // MINT STATUS MONITORING
  // ============================================

  async checkMintStatus() {
    try {
      const publicDrop = await this.seaDropContract.getPublicDrop(config.contractAddress);
      const now = Math.floor(Date.now() / 1000);
      const startTime = Number(publicDrop.startTime);
      const endTime = Number(publicDrop.endTime);

      // Cek apakah dalam window waktu mint
      if (startTime === 0) {
        return false; // Belum di-configure
      }

      if (startTime > now) {
        return false; // Belum mulai
      }

      if (endTime > 0 && endTime < now) {
        return false; // Sudah berakhir
      }

      // Mint aktif!
      return true;
    } catch (e) {
      // Fallback: coba estimasi gas
      try {
        const wallet = this.walletManager.getPrimaryWallet();
        const connectedSeaDrop = this.seaDropContract.connect(wallet);
        const mintValue = ethers.parseEther(config.mintPrice || '0');

        await connectedSeaDrop.mintPublic.estimateGas(
          config.contractAddress,
          this.feeRecipient,
          ethers.ZeroAddress, // minterIfNotPayer = zero address (minting for self)
          config.mintAmount,
          { value: mintValue * BigInt(config.mintAmount) }
        );
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

      try { totalSupply = (await this.nftContract.totalSupply()).toString(); } catch (e) {}
      try { maxSupply = (await this.nftContract.maxSupply()).toString(); } catch (e) {}

      return { totalSupply, maxSupply };
    } catch (e) {
      return { totalSupply: '?', maxSupply: '?' };
    }
  }

  // ============================================
  // SEADROP MINT EXECUTION
  // ============================================

  async executeMint(wallet) {
    const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
    Logger.mint(`Memulai SeaDrop mint untuk wallet ${shortAddr}...`);

    const connectedSeaDrop = this.seaDropContract.connect(wallet);
    
    // Hitung total value (mint price * quantity)
    const mintPricePerUnit = ethers.parseEther(config.mintPrice || '0');
    const totalValue = mintPricePerUnit * BigInt(config.mintAmount);

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
        ethers.ZeroAddress, // minterIfNotPayer (zero = minting for self)
        config.mintAmount,
        { value: totalValue }
      );
      txOverrides.gasLimit = (estimated * BigInt(Math.floor(config.gasMultiplier * 100))) / 100n;
      Logger.gas(`Estimated gas: ${estimated.toString()} (with buffer: ${txOverrides.gasLimit.toString()})`);
    } catch (e) {
      Logger.warn(`Gas estimate gagal, menggunakan 300000: ${e.message}`);
      txOverrides.gasLimit = 300000n;
    }

    // Execute SeaDrop mintPublic!
    Logger.mint(`Calling SeaDrop.mintPublic(${config.contractAddress}, ${this.feeRecipient}, 0x0, ${config.mintAmount}) | value: ${ethers.formatEther(totalValue)} ETH`);

    const tx = await connectedSeaDrop.mintPublic(
      config.contractAddress,        // nftContract
      this.feeRecipient,             // feeRecipient
      ethers.ZeroAddress,            // minterIfNotPayer (zero = self)
      config.mintAmount,             // quantity
      txOverrides
    );

    Logger.mint(`TX dikirim! Hash: ${tx.hash}`);
    Logger.info(`Menunggu konfirmasi...`);

    // Tunggu konfirmasi
    const receipt = await tx.wait(1);

    if (receipt.status === 1) {
      Logger.success(`✅ MINT BERHASIL! Gas used: ${receipt.gasUsed.toString()}`);
      Logger.success(`TX: https://basescan.org/tx/${tx.hash}`);
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
    Logger.mint(`🚀 EKSEKUSI SEADROP MINT UNTUK ${wallets.length} WALLET(S)!`);
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
    Logger.info('🔍 Mode MONITOR - Menunggu mint dibuka (via SeaDrop)...');
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
    Logger.info('⚡ Mode INSTANT - Langsung mint via SeaDrop!');
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
