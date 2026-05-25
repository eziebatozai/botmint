#!/usr/bin/env node

/**
 * Test koneksi dan konfigurasi SeaDrop sebelum mint
 */

const { ethers } = require('ethers');
const { config } = require('./config');
const { NFT_CONTRACT_ABI, SEADROP_ABI, SEADROP_ADDRESSES, OPENSEA_FEE_RECIPIENT } = require('./abi');
const Logger = require('./utils/logger');

async function testConnection() {
  Logger.banner();
  Logger.info('🧪 TEST KONEKSI & KONFIGURASI SEADROP');
  Logger.divider();

  let errors = 0;
  let provider;

  // 1. Test RPC
  Logger.info('1. Testing RPC connection (Base Chain)...');
  try {
    provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    Logger.success(`   RPC OK! Network: ${network.name}, ChainId: ${network.chainId}, Block: ${blockNumber}`);
  } catch (e) {
    Logger.error(`   RPC GAGAL: ${e.message}`);
    errors++;
    return;
  }

  // 2. Test Wallet
  Logger.info('2. Testing wallet...');
  try {
    if (!process.env.PRIVATE_KEY && !process.env.PRIVATE_KEYS) {
      throw new Error('No private key configured');
    }
    const key = process.env.PRIVATE_KEY || process.env.PRIVATE_KEYS.split(',')[0].trim();
    const wallet = new ethers.Wallet(key);
    Logger.success(`   Wallet OK! Address: ${wallet.address}`);
    
    const balance = await provider.getBalance(wallet.address);
    Logger.success(`   Balance: ${ethers.formatEther(balance)} ETH (Base)`);

    if (balance === 0n) {
      Logger.warn('   ⚠️  Balance 0! Bridge ETH ke Base chain via https://bridge.base.org');
      errors++;
    }
  } catch (e) {
    Logger.error(`   Wallet GAGAL: ${e.message}`);
    errors++;
  }

  // 3. Test NFT Contract
  Logger.info('3. Testing NFT contract...');
  try {
    const code = await provider.getCode(config.contractAddress);
    
    if (code === '0x') {
      Logger.error('   Contract TIDAK DITEMUKAN di address tersebut!');
      errors++;
    } else {
      Logger.success(`   Contract ditemukan! Code size: ${(code.length - 2) / 2} bytes`);

      const nftContract = new ethers.Contract(config.contractAddress, NFT_CONTRACT_ABI, provider);
      
      try {
        const name = await nftContract.name();
        const symbol = await nftContract.symbol();
        Logger.success(`   Name: ${name} (${symbol})`);
      } catch (e) {
        Logger.warn('   name()/symbol() tidak tersedia');
      }

      try {
        const supply = await nftContract.totalSupply();
        Logger.success(`   totalSupply(): ${supply.toString()}`);
      } catch (e) {
        Logger.warn('   totalSupply() tidak tersedia');
      }

      try {
        const maxSup = await nftContract.maxSupply();
        Logger.success(`   maxSupply(): ${maxSup.toString()}`);
      } catch (e) {
        Logger.warn('   maxSupply() tidak tersedia');
      }
    }
  } catch (e) {
    Logger.error(`   Contract GAGAL: ${e.message}`);
    errors++;
  }

  // 4. Test SeaDrop Contract
  Logger.info('4. Testing SeaDrop contract...');
  const seaDropAddress = SEADROP_ADDRESSES[config.chainId] || SEADROP_ADDRESSES[8453];
  try {
    const code = await provider.getCode(seaDropAddress);
    
    if (code === '0x') {
      Logger.error(`   SeaDrop contract TIDAK DITEMUKAN di ${seaDropAddress}`);
      errors++;
    } else {
      Logger.success(`   SeaDrop contract OK: ${seaDropAddress}`);

      const seaDrop = new ethers.Contract(seaDropAddress, SEADROP_ABI, provider);

      // Get public drop info
      try {
        const publicDrop = await seaDrop.getPublicDrop(config.contractAddress);
        Logger.success(`   Public Drop Info:`);
        Logger.info(`      Mint Price: ${ethers.formatEther(publicDrop.mintPrice)} ETH`);
        
        const start = Number(publicDrop.startTime);
        const end = Number(publicDrop.endTime);
        const now = Math.floor(Date.now() / 1000);

        Logger.info(`      Start: ${start === 0 ? 'Not set' : new Date(start * 1000).toLocaleString()}`);
        Logger.info(`      End: ${end === 0 ? 'No end' : new Date(end * 1000).toLocaleString()}`);
        Logger.info(`      Max per wallet: ${Number(publicDrop.maxTotalMintableByWallet)}`);
        Logger.info(`      Fee BPS: ${Number(publicDrop.feeBps)}`);

        if (start === 0) {
          Logger.warn('      ⚠️  Mint belum di-configure (startTime = 0)');
        } else if (start > now) {
          Logger.warn(`      ⏰ Mint belum dibuka (mulai: ${new Date(start * 1000).toLocaleString()})`);
        } else if (end > 0 && end < now) {
          Logger.error('      ❌ Mint sudah berakhir!');
        } else {
          Logger.success('      🟢 MINT AKTIF!');
        }
      } catch (e) {
        Logger.warn(`   Public drop info gagal: ${e.message}`);
      }

      // Get fee recipients
      try {
        const feeRecipients = await seaDrop.getAllowedFeeRecipients(config.contractAddress);
        if (feeRecipients.length > 0) {
          Logger.success(`   Fee recipients: ${feeRecipients.join(', ')}`);
        } else {
          Logger.info(`   Using default fee recipient: ${OPENSEA_FEE_RECIPIENT}`);
        }
      } catch (e) {
        Logger.warn(`   Fee recipient check gagal: ${e.message}`);
      }
    }
  } catch (e) {
    Logger.error(`   SeaDrop GAGAL: ${e.message}`);
    errors++;
  }

  // 5. Gas check
  Logger.info('5. Checking gas prices (Base chain = super murah)...');
  try {
    const feeData = await provider.getFeeData();
    Logger.success(`   Gas Price: ${ethers.formatUnits(feeData.gasPrice || 0n, 'gwei')} Gwei`);
    Logger.success(`   Max Fee: ${ethers.formatUnits(feeData.maxFeePerGas || 0n, 'gwei')} Gwei`);
    Logger.info(`   Your max gas limit: ${config.maxGasPriceGwei} Gwei`);
  } catch (e) {
    Logger.error(`   Gas check gagal: ${e.message}`);
    errors++;
  }

  // Summary
  Logger.divider();
  if (errors === 0) {
    Logger.success('✅ Semua test PASSED! Bot siap dijalankan.');
    Logger.info('   Mode monitor: npm run monitor');
    Logger.info('   Mint langsung: npm start');
  } else {
    Logger.error(`❌ ${errors} test GAGAL. Perbaiki konfigurasi sebelum menjalankan bot.`);
  }
  Logger.divider();
}

testConnection();
