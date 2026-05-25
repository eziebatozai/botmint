#!/usr/bin/env node

const { ethers } = require('ethers');
const { config, validateConfig } = require('./config');
const { NFT_CONTRACT_ABI, SEADROP_ABI, SEADROP_ADDRESSES, OPENSEA_FEE_RECIPIENT } = require('./abi');
const Logger = require('./utils/logger');
const WalletManager = require('./utils/wallet');
const GasEstimator = require('./utils/gas');
const Notifier = require('./utils/notifier');

// ============================================
// OPENSEA SIGNATURE FETCHER
// ============================================

class OpenSeaSignatureFetcher {
  constructor(config) {
    this.apiUrl = 'https://opensea.io/__api/graphql';
    this.collectionSlug = config.collectionSlug;
    this.stageIndex = config.stageIndex;
    this.apiKey = config.opensea_api_key;
  }

  /**
   * Fetch mint signature dari OpenSea GraphQL API
   * OpenSea menggunakan SIGNED_PRESALE - server-side signature untuk FCFS mint
   */
  async fetchMintSignature(walletAddress, quantity) {
    Logger.info(`🔑 Fetching signature untuk ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)} (qty: ${quantity})...`);

    const query = `
      mutation GenerateSignedMintFulfillmentDataMutation($input: GenerateSignedMintFulfillmentDataInput!) {
        drops {
          generateSignedMintFulfillmentData(input: $input) {
            ... on GenerateSignedMintFulfillmentDataSuccess {
              fulfillmentData {
                transaction {
                  to
                  value
                  data
                }
                mintParameters {
                  mintPrice
                  maxTotalMintableByWallet
                  startTime
                  endTime
                  dropStageIndex
                  maxTokenSupplyForStage
                  feeBps
                  restrictFeeRecipients
                }
                salt
                signature
                feeRecipient
              }
            }
            ... on GenerateSignedMintFulfillmentDataError {
              message
              code
            }
          }
        }
      }
    `;

    const variables = {
      input: {
        collectionSlug: this.collectionSlug,
        minterAddress: walletAddress,
        quantity: quantity,
        stageIndex: this.stageIndex,
      },
    };

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Origin': 'https://opensea.io',
      'Referer': 'https://opensea.io/',
      'X-Signed-Query': 'true',
    };

    if (this.apiKey) {
      headers['X-API-KEY'] = this.apiKey;
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`OpenSea API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    const result = data?.data?.drops?.generateSignedMintFulfillmentData;

    if (!result) {
      throw new Error('No fulfillment data returned from OpenSea');
    }

    // Check for error response type
    if (result.message || result.code) {
      throw new Error(`OpenSea error: ${result.message} (code: ${result.code})`);
    }

    const fulfillment = result.fulfillmentData;
    if (!fulfillment) {
      throw new Error('Fulfillment data is empty');
    }

    Logger.success(`✅ Signature diterima! Salt: ${fulfillment.salt}`);

    return {
      transaction: fulfillment.transaction,
      mintParams: fulfillment.mintParameters,
      salt: fulfillment.salt,
      signature: fulfillment.signature,
      feeRecipient: fulfillment.feeRecipient,
    };
  }

  /**
   * Fetch drop info dari OpenSea GraphQL (cek eligibility & stage status)
   */
  async fetchDropInfo(walletAddress) {
    const query = `
      query DropBySlugQuery($slug: String!, $address: AddressScalar) {
        dropBySlug(slug: $slug, address: $address) {
          __typename
          ... on Erc721SeaDropV1 {
            minterQuantityMinted
            stages {
              stageType
              stageIndex
              isEligible
              maxTotalMintableByWallet
              eligibleMaxTotalMintableByWallet
              eligiblePrice {
                usd
                token {
                  unit
                  symbol
                  contractAddress
                  chain {
                    identifier
                  }
                }
              }
            }
          }
        }
      }
    `;

    const variables = {
      slug: this.collectionSlug,
      address: walletAddress,
    };

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Origin': 'https://opensea.io',
      'Referer': 'https://opensea.io/',
    };

    if (this.apiKey) {
      headers['X-API-KEY'] = this.apiKey;
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`OpenSea API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data?.data?.dropBySlug;
  }
}

// ============================================
// MAIN BOT CLASS - SeaDrop FCFS Mint (SIGNED_PRESALE)
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
    this.signatureFetcher = null;
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
    this.seaDropAddress = SEADROP_ADDRESSES[config.chainId] || SEADROP_ADDRESSES[8453];
    this.seaDropContract = new ethers.Contract(
      this.seaDropAddress,
      SEADROP_ABI,
      this.provider
    );

    // Setup OpenSea Signature Fetcher
    this.signatureFetcher = new OpenSeaSignatureFetcher(config);

    // Coba ambil fee recipient dari contract
    await this.resolveFeeRecipient();

    Logger.info(`NFT Contract: ${config.contractAddress}`);
    Logger.info(`SeaDrop Contract: ${this.seaDropAddress}`);
    Logger.info(`Fee Recipient: ${this.feeRecipient}`);
    Logger.info(`Collection Slug: ${config.collectionSlug}`);
    Logger.info(`Stage Index (FCFS): ${config.stageIndex}`);
    Logger.info(`Mint Amount: ${config.mintAmount}`);
    Logger.info(`Mode: ${config.botMode}`);
    Logger.divider();

    // Tampilkan info stage/eligibility
    await this.showFCFSInfo();
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

  async showFCFSInfo() {
    try {
      const primaryWallet = this.walletManager.getPrimaryWallet();
      const dropInfo = await this.signatureFetcher.fetchDropInfo(primaryWallet.address);

      if (!dropInfo || !dropInfo.stages) {
        Logger.warn('Tidak bisa fetch drop info dari OpenSea');
        return;
      }

      Logger.divider();
      Logger.info('📋 DROP STAGES INFO:');
      
      for (const stage of dropInfo.stages) {
        const emoji = stage.stageIndex === config.stageIndex ? '🎯' : '  ';
        const eligibleText = stage.isEligible ? '✅ ELIGIBLE' : '❌ NOT ELIGIBLE';
        const price = stage.eligiblePrice?.token?.unit || 0;
        Logger.info(`${emoji} Stage ${stage.stageIndex} [${stage.stageType}] - ${eligibleText} | Price: ${price} ETH | Max/Wallet: ${stage.maxTotalMintableByWallet}`);
      }

      // Cek target stage
      const targetStage = dropInfo.stages.find(s => s.stageIndex === config.stageIndex);
      if (targetStage) {
        Logger.divider();
        if (targetStage.isEligible) {
          Logger.success(`🟢 Wallet ELIGIBLE untuk Stage ${config.stageIndex} (${targetStage.stageType})!`);
          Logger.info(`   Max mintable: ${targetStage.eligibleMaxTotalMintableByWallet}`);
          Logger.info(`   Price: ${targetStage.eligiblePrice?.token?.unit || 0} ETH`);
        } else {
          Logger.error(`❌ Wallet TIDAK ELIGIBLE untuk Stage ${config.stageIndex}!`);
          Logger.warn(`   Bot tetap akan mencoba saat stage dibuka (FCFS).`);
        }
      }

      if (dropInfo.minterQuantityMinted !== null) {
        Logger.info(`   Already minted: ${dropInfo.minterQuantityMinted}`);
      }

      Logger.divider();
    } catch (e) {
      Logger.warn(`Tidak bisa fetch drop info: ${e.message}`);
    }
  }

  // ============================================
  // FCFS STATUS MONITORING
  // ============================================

  async checkFCFSStatus() {
    try {
      const primaryWallet = this.walletManager.getPrimaryWallet();
      const dropInfo = await this.signatureFetcher.fetchDropInfo(primaryWallet.address);

      if (!dropInfo || !dropInfo.stages) {
        return { active: false, reason: 'Cannot fetch drop info' };
      }

      const targetStage = dropInfo.stages.find(s => s.stageIndex === config.stageIndex);
      if (!targetStage) {
        return { active: false, reason: `Stage ${config.stageIndex} not found` };
      }

      if (!targetStage.isEligible) {
        return { active: false, reason: `Not eligible for stage ${config.stageIndex}` };
      }

      // Coba fetch signature - jika berhasil berarti mint aktif
      try {
        await this.signatureFetcher.fetchMintSignature(primaryWallet.address, config.mintAmount);
        return { active: true };
      } catch (sigError) {
        return { active: false, reason: `Signature not available: ${sigError.message}` };
      }
    } catch (e) {
      return { active: false, reason: e.message };
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
  // SEADROP MINT SIGNED EXECUTION (FCFS)
  // ============================================

  async executeMint(wallet) {
    const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
    Logger.mint(`🎯 Memulai FCFS mint (mintSigned) untuk wallet ${shortAddr}...`);

    // Step 1: Fetch signature dari OpenSea
    const fulfillment = await this.signatureFetcher.fetchMintSignature(wallet.address, config.mintAmount);

    // Step 2: Cek apakah OpenSea mengembalikan raw transaction data
    if (fulfillment.transaction && fulfillment.transaction.data) {
      // OpenSea mengembalikan pre-built transaction - langsung kirim
      Logger.info(`📦 Menggunakan pre-built transaction dari OpenSea`);
      return await this.executeRawTransaction(wallet, fulfillment, shortAddr);
    }

    // Step 3: Kalau tidak ada pre-built tx, build sendiri dari mintParams
    return await this.executeMintSigned(wallet, fulfillment, shortAddr);
  }

  async executeRawTransaction(wallet, fulfillment, shortAddr) {
    const { transaction } = fulfillment;

    // Get gas settings
    const gasSettings = await this.gasEstimator.getOptimalGasSettings();

    const tx = await wallet.sendTransaction({
      to: transaction.to,
      value: BigInt(transaction.value || '0'),
      data: transaction.data,
      ...gasSettings,
    });

    Logger.mint(`TX dikirim! Hash: ${tx.hash}`);
    Logger.info(`Menunggu konfirmasi...`);

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

  async executeMintSigned(wallet, fulfillment, shortAddr) {
    const { mintParams, salt, signature, feeRecipient } = fulfillment;

    const connectedSeaDrop = this.seaDropContract.connect(wallet);
    const resolvedFeeRecipient = feeRecipient || this.feeRecipient;

    // Build MintParams tuple
    const mintParamsTuple = [
      BigInt(mintParams.mintPrice || 0),           // mintPrice
      parseInt(mintParams.maxTotalMintableByWallet || 1), // maxTotalMintableByWallet
      parseInt(mintParams.startTime || 0),         // startTime
      parseInt(mintParams.endTime || 0),           // endTime
      parseInt(mintParams.dropStageIndex || config.stageIndex), // dropStageIndex
      parseInt(mintParams.maxTokenSupplyForStage || 0), // maxTokenSupplyForStage
      parseInt(mintParams.feeBps || 0),            // feeBps
      Boolean(mintParams.restrictFeeRecipients),   // restrictFeeRecipients
    ];

    // Hitung total value
    const mintPricePerUnit = BigInt(mintParams.mintPrice || 0);
    const totalValue = mintPricePerUnit * BigInt(config.mintAmount);

    // Get gas settings
    const gasSettings = await this.gasEstimator.getOptimalGasSettings();

    const txOverrides = {
      value: totalValue,
      ...gasSettings,
    };

    // Estimate gas limit
    try {
      const estimated = await connectedSeaDrop.mintSigned.estimateGas(
        config.contractAddress,
        resolvedFeeRecipient,
        ethers.ZeroAddress,
        config.mintAmount,
        mintParamsTuple,
        BigInt(salt),
        signature,
        { value: totalValue }
      );
      txOverrides.gasLimit = (estimated * BigInt(Math.floor(config.gasMultiplier * 100))) / 100n;
      Logger.gas(`Estimated gas: ${estimated.toString()} (with buffer: ${txOverrides.gasLimit.toString()})`);
    } catch (e) {
      Logger.warn(`Gas estimate gagal, menggunakan 300000: ${e.message}`);
      txOverrides.gasLimit = 300000n;
    }

    // Execute SeaDrop mintSigned!
    Logger.mint(`Calling SeaDrop.mintSigned(${config.contractAddress}, ${resolvedFeeRecipient}, 0x0, ${config.mintAmount}, params, salt, sig)`);

    const tx = await connectedSeaDrop.mintSigned(
      config.contractAddress,
      resolvedFeeRecipient,
      ethers.ZeroAddress,
      config.mintAmount,
      mintParamsTuple,
      BigInt(salt),
      signature,
      txOverrides
    );

    Logger.mint(`TX dikirim! Hash: ${tx.hash}`);
    Logger.info(`Menunggu konfirmasi...`);

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
    Logger.mint(`🚀 EKSEKUSI FCFS MINT (SIGNED_PRESALE) UNTUK ${wallets.length} WALLET(S)!`);
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
    Logger.info('🔍 Mode MONITOR - Menunggu FCFS stage aktif (SIGNED_PRESALE)...');
    Logger.info(`Target Stage Index: ${config.stageIndex}`);
    Logger.info(`Polling setiap ${config.pollInterval}ms`);
    Logger.divider();

    let pollCount = 0;

    while (true) {
      pollCount++;
      
      try {
        const status = await this.checkFCFSStatus();
        const supply = await this.getSupplyInfo();

        if (status.active) {
          Logger.success(`🟢 FCFS MINT TERBUKA! Supply: ${supply.totalSupply}/${supply.maxSupply}`);
          await this.mintAllWallets();
          break;
        } else {
          // Update status setiap 10 poll
          if (pollCount % 10 === 0) {
            Logger.info(`⏳ FCFS belum aktif... (poll #${pollCount}) Supply: ${supply.totalSupply}/${supply.maxSupply} | ${status.reason || ''}`);
          }
        }
      } catch (error) {
        Logger.error(`Monitor error: ${error.message}`);
      }

      await this.sleep(config.pollInterval);
    }
  }

  async runInstantMode() {
    Logger.info('⚡ Mode INSTANT - Langsung mint FCFS via mintSigned!');
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
