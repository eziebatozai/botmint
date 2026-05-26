#!/usr/bin/env node

/**
 * Monitor-only mode - Cek status PUBLIC MINT di SeaDrop contract (on-chain)
 * Berguna untuk memantau kapan public mint dibuka sebelum menjalankan bot utama
 */

const { ethers } = require('ethers');
const { config } = require('./config');
const { NFT_CONTRACT_ABI, SEADROP_ABI, SEADROP_ADDRESSES, OPENSEA_FEE_RECIPIENT } = require('./abi');
const Logger = require('./utils/logger');

// ============================================
// MONITOR MAIN
// ============================================

async function monitor() {
  Logger.banner();
  Logger.info('🔍 MODE: Lacertians PUBLIC MINT Monitor');
  Logger.info('📋 Protocol: SeaDrop.mintPublic() - Ethereum Mainnet');
  Logger.divider();

  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  const nftContract = new ethers.Contract(config.contractAddress, NFT_CONTRACT_ABI, provider);
  
  const seaDropAddress = SEADROP_ADDRESSES[config.chainId] || SEADROP_ADDRESSES[1];
  const seaDropContract = new ethers.Contract(seaDropAddress, SEADROP_ABI, provider);

  // Get wallet address for balance check
  let walletAddress = null;
  let walletBalance = '?';
  if (process.env.PRIVATE_KEY) {
    try {
      const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
      walletAddress = wallet.address;
    } catch (e) {}
  }

  Logger.info(`NFT Contract: ${config.contractAddress}`);
  Logger.info(`SeaDrop: ${seaDropAddress}`);
  Logger.info(`Collection: ${config.collectionSlug}`);
  Logger.info(`Mint Price: ${config.mintPrice} ETH`);
  if (walletAddress) Logger.info(`Wallet: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);
  Logger.info(`RPC: ${config.rpcUrl.slice(0, 40)}...`);
  Logger.divider();

  let iteration = 0;

  while (true) {
    iteration++;
    
    try {
      // Supply info from contract
      let totalSupply = '?', maxSupply = '?';
      try { totalSupply = (await nftContract.totalSupply()).toString(); } catch (e) {}
      try { maxSupply = (await nftContract.maxSupply()).toString(); } catch (e) {}

      // Block info
      const blockNumber = await provider.getBlockNumber();
      const feeData = await provider.getFeeData();
      const gasPrice = ethers.formatUnits(feeData.gasPrice || 0n, 'gwei');

      // Wallet balance
      if (walletAddress) {
        try {
          const bal = await provider.getBalance(walletAddress);
          walletBalance = ethers.formatEther(bal).slice(0, 8);
        } catch (e) {}
      }

      // Fetch PUBLIC DROP info from SeaDrop contract (on-chain)
      let mintStatus = 'UNKNOWN';
      let onchainPrice = '?';
      let maxPerWallet = '?';
      let startTime = 0;
      let endTime = 0;
      let isActive = false;

      try {
        const publicDrop = await seaDropContract.getPublicDrop(config.contractAddress);
        
        onchainPrice = ethers.formatEther(publicDrop.mintPrice || 0n);
        maxPerWallet = Number(publicDrop.maxTotalMintableByWallet).toString();
        startTime = Number(publicDrop.startTime);
        endTime = Number(publicDrop.endTime);
        
        const now = Math.floor(Date.now() / 1000);

        if (startTime === 0) {
          mintStatus = '⚪ Public mint belum dikonfigurasi';
        } else if (now < startTime) {
          const diff = startTime - now;
          const hours = Math.floor(diff / 3600);
          const mins = Math.floor((diff % 3600) / 60);
          const secs = diff % 60;
          mintStatus = `⏳ Mulai dalam ${hours}h ${mins}m ${secs}s`;
        } else if (endTime > 0 && now >= endTime) {
          mintStatus = '🔴 PUBLIC MINT SUDAH BERAKHIR';
        } else {
          mintStatus = '🟢 PUBLIC MINT AKTIF! SIAP MINT!';
          isActive = true;
        }
      } catch (e) {
        mintStatus = `❓ Error: ${e.message.slice(0, 50)}`;
      }

      // Mint stats per wallet
      let walletMinted = '?';
      if (walletAddress) {
        try {
          const stats = await seaDropContract.getMintStats(config.contractAddress, walletAddress);
          walletMinted = stats.minterNumMinted.toString();
        } catch (e) {}
      }

      // Display
      console.clear();
      Logger.banner();
      Logger.info(`📊 PUBLIC MINT MONITOR - Iteration #${iteration}`);
      Logger.divider();
      Logger.info(`NFT Contract: ${config.contractAddress}`);
      Logger.info(`SeaDrop:      ${seaDropAddress}`);
      Logger.info(`Collection:   ${config.collectionSlug}`);
      Logger.info(`Block:        ${blockNumber}`);
      Logger.info(`Gas Price:    ${parseFloat(gasPrice).toFixed(2)} Gwei`);
      Logger.divider();
      Logger.info(`Supply:       ${totalSupply} / ${maxSupply}`);
      Logger.info(`Mint Price:   ${onchainPrice} ETH (on-chain)`);
      Logger.info(`Max/Wallet:   ${maxPerWallet}`);
      if (startTime > 0) {
        Logger.info(`Start Time:   ${new Date(startTime * 1000).toLocaleString()}`);
      }
      if (endTime > 0) {
        Logger.info(`End Time:     ${new Date(endTime * 1000).toLocaleString()}`);
      }
      Logger.divider();
      if (walletAddress) {
        Logger.info(`Wallet:       ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);
        Logger.info(`Balance:      ${walletBalance} ETH`);
        Logger.info(`Already Mint: ${walletMinted}`);
        Logger.divider();
      }
      Logger.info(`STATUS:       ${mintStatus}`);
      Logger.divider();
      Logger.info(`Polling every ${config.pollInterval}ms... (Ctrl+C to stop)`);

      if (isActive) {
        Logger.success('\n🚨 PUBLIC MINT IS LIVE! Jalankan: npm start');
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
