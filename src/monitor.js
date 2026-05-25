#!/usr/bin/env node

/**
 * Monitor-only mode - Cek status mint tanpa eksekusi
 * Berguna untuk memantau kapan mint dibuka sebelum menjalankan bot utama
 */

const { ethers } = require('ethers');
const { config, validateConfig } = require('./config');
const { MINT_ABI } = require('./abi');
const Logger = require('./utils/logger');

async function monitor() {
  Logger.banner();
  Logger.info('🔍 MODE: Monitor Only (tidak akan mint)');
  Logger.divider();

  // Minimal validation - hanya butuh RPC dan contract
  if (!config.contractAddress || config.contractAddress.includes('YOUR')) {
    Logger.error('CONTRACT_ADDRESS belum diset!');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  const contract = new ethers.Contract(config.contractAddress, MINT_ABI, provider);

  Logger.info(`Contract: ${config.contractAddress}`);
  Logger.info(`RPC: ${config.rpcUrl.slice(0, 40)}...`);
  Logger.divider();

  let iteration = 0;

  while (true) {
    iteration++;
    
    try {
      // Supply info
      let totalSupply = '?', maxSupply = '?';
      try { totalSupply = (await contract.totalSupply()).toString(); } catch (e) {}
      try { maxSupply = (await contract.maxSupply()).toString(); } catch (e) {
        try { maxSupply = (await contract.MAX_SUPPLY()).toString(); } catch (e2) {}
      }

      // Price info
      let price = '?';
      try { price = ethers.formatEther(await contract.price()); } catch (e) {
        try { price = ethers.formatEther(await contract.mintPrice()); } catch (e2) {
          try { price = ethers.formatEther(await contract.cost()); } catch (e3) {}
        }
      }

      // Mint status
      let mintStatus = 'UNKNOWN';
      const statusChecks = ['mintActive', 'isPublicMintActive', 'publicSaleActive', 'saleIsActive'];
      
      for (const fn of statusChecks) {
        try {
          const result = await contract[fn]();
          mintStatus = result ? '🟢 ACTIVE' : '🔴 INACTIVE';
          break;
        } catch (e) { continue; }
      }

      // Paused check
      try {
        const paused = await contract.paused();
        if (mintStatus === 'UNKNOWN') {
          mintStatus = paused ? '🔴 PAUSED' : '🟡 NOT PAUSED';
        }
      } catch (e) {}

      // Block info
      const blockNumber = await provider.getBlockNumber();
      const feeData = await provider.getFeeData();
      const gasPrice = ethers.formatUnits(feeData.gasPrice || 0n, 'gwei');

      // Display
      console.clear();
      Logger.banner();
      Logger.info(`📊 STATUS MONITOR - Iteration #${iteration}`);
      Logger.divider();
      Logger.info(`Contract:    ${config.contractAddress}`);
      Logger.info(`Block:       ${blockNumber}`);
      Logger.info(`Gas Price:   ${parseFloat(gasPrice).toFixed(2)} Gwei`);
      Logger.divider();
      Logger.info(`Supply:      ${totalSupply} / ${maxSupply}`);
      Logger.info(`Mint Price:  ${price} ETH`);
      Logger.info(`Mint Status: ${mintStatus}`);
      Logger.divider();
      Logger.info(`Polling every ${config.pollInterval}ms... (Ctrl+C to stop)`);

      if (mintStatus.includes('ACTIVE')) {
        Logger.success('\n🚨 MINT IS LIVE! Jalankan: npm start');
        
        // Beep/alert
        process.stdout.write('\x07');
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
