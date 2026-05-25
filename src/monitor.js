#!/usr/bin/env node

/**
 * Monitor-only mode - Cek status mint SeaDrop tanpa eksekusi
 * Berguna untuk memantau kapan mint dibuka sebelum menjalankan bot utama
 */

const { ethers } = require('ethers');
const { config } = require('./config');
const { NFT_CONTRACT_ABI, SEADROP_ABI, SEADROP_ADDRESSES } = require('./abi');
const Logger = require('./utils/logger');

async function monitor() {
  Logger.banner();
  Logger.info('🔍 MODE: Monitor Only (tidak akan mint)');
  Logger.info('📋 Protocol: OpenSea SeaDrop');
  Logger.divider();

  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  const nftContract = new ethers.Contract(config.contractAddress, NFT_CONTRACT_ABI, provider);
  
  const seaDropAddress = SEADROP_ADDRESSES[config.chainId] || SEADROP_ADDRESSES[8453];
  const seaDropContract = new ethers.Contract(seaDropAddress, SEADROP_ABI, provider);

  Logger.info(`NFT Contract: ${config.contractAddress}`);
  Logger.info(`SeaDrop: ${seaDropAddress}`);
  Logger.info(`RPC: ${config.rpcUrl.slice(0, 40)}...`);
  Logger.divider();

  let iteration = 0;

  while (true) {
    iteration++;
    
    try {
      // Supply info
      let totalSupply = '?', maxSupply = '?';
      try { totalSupply = (await nftContract.totalSupply()).toString(); } catch (e) {}
      try { maxSupply = (await nftContract.maxSupply()).toString(); } catch (e) {}

      // Public Drop info dari SeaDrop
      let mintPrice = '?', startTime = '?', endTime = '?', maxPerWallet = '?';
      let mintStatus = 'UNKNOWN';

      try {
        const publicDrop = await seaDropContract.getPublicDrop(config.contractAddress);
        mintPrice = ethers.formatEther(publicDrop.mintPrice);
        
        const start = Number(publicDrop.startTime);
        const end = Number(publicDrop.endTime);
        const now = Math.floor(Date.now() / 1000);
        
        startTime = start === 0 ? 'Not set' : new Date(start * 1000).toLocaleString();
        endTime = end === 0 ? 'No end' : new Date(end * 1000).toLocaleString();
        maxPerWallet = Number(publicDrop.maxTotalMintableByWallet).toString();

        if (start === 0) {
          mintStatus = '⚪ NOT CONFIGURED';
        } else if (start > now) {
          const diff = start - now;
          const mins = Math.floor(diff / 60);
          const secs = diff % 60;
          mintStatus = `🟡 STARTS IN ${mins}m ${secs}s`;
        } else if (end > 0 && end < now) {
          mintStatus = '🔴 ENDED';
        } else {
          mintStatus = '🟢 ACTIVE!';
        }
      } catch (e) {
        mintStatus = `❓ Error: ${e.message.slice(0, 50)}`;
      }

      // Block info
      const blockNumber = await provider.getBlockNumber();
      const feeData = await provider.getFeeData();
      const gasPrice = ethers.formatUnits(feeData.gasPrice || 0n, 'gwei');

      // Display
      console.clear();
      Logger.banner();
      Logger.info(`📊 SEADROP MONITOR - Iteration #${iteration}`);
      Logger.divider();
      Logger.info(`NFT Contract: ${config.contractAddress}`);
      Logger.info(`SeaDrop:      ${seaDropAddress}`);
      Logger.info(`Block:        ${blockNumber}`);
      Logger.info(`Gas Price:    ${parseFloat(gasPrice).toFixed(4)} Gwei`);
      Logger.divider();
      Logger.info(`Supply:       ${totalSupply} / ${maxSupply}`);
      Logger.info(`Mint Price:   ${mintPrice} ETH`);
      Logger.info(`Start Time:   ${startTime}`);
      Logger.info(`End Time:     ${endTime}`);
      Logger.info(`Max/Wallet:   ${maxPerWallet}`);
      Logger.divider();
      Logger.info(`Mint Status:  ${mintStatus}`);
      Logger.divider();
      Logger.info(`Polling every ${config.pollInterval}ms... (Ctrl+C to stop)`);

      if (mintStatus.includes('ACTIVE')) {
        Logger.success('\n🚨 MINT IS LIVE! Jalankan: npm start');
        process.stdout.write('\x07'); // Beep
      }

    } catch (error) {
      Logger.error(`Error: ${error.message}`);
    }

    await new Promise(r => setTimeout(r, config.pollInterval));
  }
}

process.on('SIGINT', () => {
  Logger.warn('\nMonitor dihentikan.');
  process.exit(0);
});

monitor();
