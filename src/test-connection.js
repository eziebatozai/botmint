#!/usr/bin/env node

/**
 * Test koneksi dan konfigurasi sebelum mint
 */

const { ethers } = require('ethers');
const { config } = require('./config');
const { MINT_ABI } = require('./abi');
const Logger = require('./utils/logger');

async function testConnection() {
  Logger.banner();
  Logger.info('🧪 TEST KONEKSI & KONFIGURASI');
  Logger.divider();

  let errors = 0;

  // 1. Test RPC
  Logger.info('1. Testing RPC connection...');
  try {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    Logger.success(`   RPC OK! Network: ${network.name}, Block: ${blockNumber}`);
  } catch (e) {
    Logger.error(`   RPC GAGAL: ${e.message}`);
    errors++;
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
    
    const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
    const balance = await provider.getBalance(wallet.address);
    Logger.success(`   Balance: ${ethers.formatEther(balance)} ETH`);

    if (balance === 0n) {
      Logger.warn('   ⚠️  Balance 0! Pastikan wallet memiliki ETH untuk gas + mint');
    }
  } catch (e) {
    Logger.error(`   Wallet GAGAL: ${e.message}`);
    errors++;
  }

  // 3. Test Contract
  Logger.info('3. Testing contract...');
  try {
    if (!config.contractAddress || config.contractAddress.includes('YOUR')) {
      throw new Error('Contract address belum diset');
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
    const code = await provider.getCode(config.contractAddress);
    
    if (code === '0x') {
      Logger.error('   Contract TIDAK DITEMUKAN di address tersebut!');
      errors++;
    } else {
      Logger.success(`   Contract ditemukan! Code size: ${(code.length - 2) / 2} bytes`);

      // Try reading some data
      const contract = new ethers.Contract(config.contractAddress, MINT_ABI, provider);
      
      try {
        const supply = await contract.totalSupply();
        Logger.success(`   totalSupply(): ${supply.toString()}`);
      } catch (e) {
        Logger.warn('   totalSupply() tidak tersedia');
      }

      try {
        const price = await contract.price();
        Logger.success(`   price(): ${ethers.formatEther(price)} ETH`);
      } catch (e) {
        try {
          const price = await contract.mintPrice();
          Logger.success(`   mintPrice(): ${ethers.formatEther(price)} ETH`);
        } catch (e2) {
          Logger.warn('   price()/mintPrice() tidak tersedia');
        }
      }
    }
  } catch (e) {
    Logger.error(`   Contract GAGAL: ${e.message}`);
    errors++;
  }

  // 4. Gas check
  Logger.info('4. Checking gas prices...');
  try {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
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
    Logger.info('   Jalankan: npm start');
  } else {
    Logger.error(`❌ ${errors} test GAGAL. Perbaiki konfigurasi sebelum menjalankan bot.`);
  }
  Logger.divider();
}

testConnection();
