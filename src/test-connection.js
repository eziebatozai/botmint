#!/usr/bin/env node

/**
 * Test koneksi dan konfigurasi sebelum claim Lobster NFT
 * Contract: 0x1de237c7063a9ee531e06a6c3fba4e3e704f2a74 (Thirdweb ERC721Drop)
 */

const { ethers } = require('ethers');
const { config } = require('./config');
const { THIRDWEB_DROP_ABI, NATIVE_TOKEN_ADDRESS } = require('./abi');
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
      Logger.warn('   Balance 0! Top up wallet sebelum claim');
      errors++;
    }
  } catch (e) {
    Logger.error(`   Wallet FAILED: ${e.message}`);
    errors++;
  }

  // 3. Test Contract
  Logger.info('3. Testing NFT contract (Thirdweb ERC721Drop)...');
  try {
    const code = await provider.getCode(config.contractAddress);

    if (code === '0x') {
      Logger.error('   Contract NOT FOUND at this address!');
      errors++;
    } else {
      Logger.success(`   Contract found! Code size: ${(code.length - 2) / 2} bytes`);

      const nftContract = new ethers.Contract(
        config.contractAddress,
        THIRDWEB_DROP_ABI,
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

      try {
        const maxSup = await nftContract.maxSupply();
        Logger.success(`   maxSupply(): ${maxSup.toString()}`);
      } catch (e) {
        Logger.warn('   maxSupply() not available');
      }

      // Check claim condition
      Logger.info('   Checking claim condition...');
      try {
        const conditionId = await nftContract.getActiveClaimConditionId();
        Logger.success(`   Active Condition ID: ${conditionId.toString()}`);

        const condition = await nftContract.getClaimConditionById(conditionId);
        const startTime = Number(condition.startTimestamp);
        const now = Math.floor(Date.now() / 1000);
        const pricePerToken = ethers.formatEther(condition.pricePerToken);
        const supplyClaimed = condition.supplyClaimed.toString();
        const maxClaimable = condition.maxClaimableSupply.toString();
        const quantityLimit = condition.quantityLimitPerWallet.toString();
        const merkleRoot = condition.merkleRoot;

        Logger.info(`   Price: ${pricePerToken} ETH`);
        Logger.info(`   Claimed: ${supplyClaimed} / ${maxClaimable}`);
        Logger.info(`   Limit/Wallet: ${quantityLimit}`);

        const isPublic = merkleRoot === '0x0000000000000000000000000000000000000000000000000000000000000000';
        Logger.info(`   Type: ${isPublic ? 'PUBLIC' : 'ALLOWLIST'}`);

        if (startTime === 0) {
          Logger.warn('   Start time: NOT SET');
        } else if (startTime > now) {
          const diff = startTime - now;
          Logger.warn(`   Start time: ${new Date(startTime * 1000).toLocaleString()} (in ${Math.floor(diff / 60)}m)`);
        } else {
          Logger.success(`   Start time: ${new Date(startTime * 1000).toLocaleString()} (ACTIVE!)`);
        }

        // Check wallet claimed
        if (process.env.PRIVATE_KEY) {
          try {
            const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
            const claimed = await nftContract.getSupplyClaimedByWallet(conditionId, wallet.address);
            Logger.info(`   Your wallet claimed: ${claimed.toString()}`);
          } catch (e) {}
        }
      } catch (e) {
        Logger.warn(`   No active claim condition: ${e.message.slice(0, 60)}`);
      }
    }
  } catch (e) {
    Logger.error(`   Contract FAILED: ${e.message}`);
    errors++;
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
  Logger.info(`   Contract: ${config.contractAddress}`);
  Logger.info(`   Mint Price: ${config.mintPrice} ETH`);
  Logger.info(`   Mint Amount: ${config.mintAmount}`);
  Logger.info(`   Currency: ${config.currency}`);
  Logger.info(`   Gas Limit: ${config.gasLimit}`);
  Logger.info(`   Poll Interval: ${config.pollInterval}ms`);

  // Summary
  Logger.divider();
  if (errors === 0) {
    Logger.success('All tests PASSED! Bot ready to run.');
    Logger.info('   Monitor: npm run monitor');
    Logger.info('   Claim:   npm start');
    Logger.info('   Instant: npm run instant');
  } else {
    Logger.error(`${errors} test(s) FAILED. Fix configuration before running bot.`);
  }
  Logger.divider();
}

testConnection();
