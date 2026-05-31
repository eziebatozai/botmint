#!/usr/bin/env node

/**
 * Test koneksi dan konfigurasi sebelum mint Lobster NFT
 */

const { ethers } = require('ethers');
const { config } = require('./config');
const { NFT_READ_ABI, MINT_FUNCTIONS_ABI } = require('./abi');
const Logger = require('./utils/logger');

async function testConnection() {
  Logger.banner();
  Logger.info('TEST CONNECTION & CONFIGURATION');
  Logger.divider();

  let errors = 0;
  let provider;

  // 1. Test RPC
  Logger.info('1. Testing RPC connection...');
  try {
    provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    Logger.success(`   RPC OK! Network: ${network.name}, ChainId: ${network.chainId}, Block: ${blockNumber}`);
  } catch (e) {
    Logger.error(`   RPC FAILED: ${e.message}`);
    errors++;

    // Try backups
    for (const backup of config.rpcBackups) {
      try {
        provider = new ethers.JsonRpcProvider(backup, config.chainId);
        await provider.getNetwork();
        Logger.success(`   Backup RPC OK: ${backup.slice(0, 40)}...`);
        break;
      } catch (e2) {
        continue;
      }
    }
    if (!provider) return;
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
    Logger.success(`   Balance: ${ethers.formatEther(balance)} ETH`);

    if (balance === 0n) {
      Logger.warn('   Balance 0! Top up wallet sebelum mint');
      errors++;
    }
  } catch (e) {
    Logger.error(`   Wallet FAILED: ${e.message}`);
    errors++;
  }

  // 3. Test Contract
  Logger.info('3. Testing NFT contract...');
  if (!config.contractAddress) {
    Logger.error('   CONTRACT_ADDRESS not set! Edit .env');
    errors++;
  } else {
    try {
      const code = await provider.getCode(config.contractAddress);

      if (code === '0x') {
        Logger.error('   Contract NOT FOUND at this address!');
        errors++;
      } else {
        Logger.success(`   Contract found! Code size: ${(code.length - 2) / 2} bytes`);

        const nftContract = new ethers.Contract(
          config.contractAddress,
          [...NFT_READ_ABI, ...MINT_FUNCTIONS_ABI],
          provider
        );

        try {
          const name = await nftContract.name();
          const symbol = await nftContract.symbol();
          Logger.success(`   Name: ${name} (${symbol})`);
        } catch (e) {
          Logger.warn('   name()/symbol() not available');
        }

        try {
          const supply = await nftContract.totalSupply();
          Logger.success(`   totalSupply(): ${supply.toString()}`);
        } catch (e) {
          Logger.warn('   totalSupply() not available');
        }

        let maxSup = null;
        try { maxSup = await nftContract.maxSupply(); } catch (e) {}
        if (!maxSup) try { maxSup = await nftContract.MAX_SUPPLY(); } catch (e) {}
        if (maxSup) {
          Logger.success(`   maxSupply: ${maxSup.toString()}`);
        }

        // Check mint function availability
        Logger.info(`   Testing mint function: ${config.mintFunction}...`);
        const fnName = config.mintFunction.split('(')[0];
        if (nftContract[fnName]) {
          Logger.success(`   Function "${fnName}" found in ABI`);
        } else {
          Logger.warn(`   Function "${fnName}" not found - may still work via raw call`);
        }

        // Check mint status
        const statusFns = ['mintActive', 'isMintActive', 'saleActive', 'publicSaleActive', 'paused'];
        for (const fn of statusFns) {
          try {
            const result = await nftContract[fn]();
            Logger.info(`   ${fn}() = ${result}`);
          } catch (e) { continue; }
        }

        // Check price
        const priceFns = ['mintPrice', 'price', 'PRICE', 'cost', 'publicPrice'];
        for (const fn of priceFns) {
          try {
            const p = await nftContract[fn]();
            Logger.info(`   ${fn}() = ${ethers.formatEther(p)} ETH`);
            break;
          } catch (e) { continue; }
        }
      }
    } catch (e) {
      Logger.error(`   Contract FAILED: ${e.message}`);
      errors++;
    }
  }

  // 4. Gas check
  Logger.info('4. Checking gas prices...');
  try {
    const feeData = await provider.getFeeData();
    Logger.success(`   Gas Price: ${ethers.formatUnits(feeData.gasPrice || 0n, 'gwei')} Gwei`);
    Logger.success(`   Max Fee: ${ethers.formatUnits(feeData.maxFeePerGas || 0n, 'gwei')} Gwei`);
    Logger.info(`   Your max gas config: ${config.maxGasPriceGwei} Gwei`);
    Logger.info(`   Your priority fee: ${config.priorityFeeGwei} Gwei`);
    Logger.info(`   Speed mode: ${config.speedMode}`);
  } catch (e) {
    Logger.error(`   Gas check failed: ${e.message}`);
    errors++;
  }

  // 5. Config summary
  Logger.info('5. Configuration summary:');
  Logger.info(`   Bot Mode: ${config.botMode}`);
  Logger.info(`   Mint Function: ${config.mintFunction}`);
  Logger.info(`   Mint Price: ${config.mintPrice} ETH`);
  Logger.info(`   Mint Amount: ${config.mintAmount}`);
  Logger.info(`   Gas Limit: ${config.gasLimit}`);
  Logger.info(`   Pre-sign TX: ${config.preSign}`);
  Logger.info(`   Poll Interval: ${config.pollInterval}ms`);

  // Summary
  Logger.divider();
  if (errors === 0) {
    Logger.success('All tests PASSED! Bot ready to run.');
    Logger.info('   Monitor: npm run monitor');
    Logger.info('   Mint:    npm start');
    Logger.info('   Instant: npm run instant');
  } else {
    Logger.error(`${errors} test(s) FAILED. Fix configuration before running bot.`);
  }
  Logger.divider();
}

testConnection();
