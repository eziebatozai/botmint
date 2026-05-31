#!/usr/bin/env node

/**
 * Lobster NFT - FCFS Mint Monitor
 * Monitor contract status tanpa auto-mint
 */

const { ethers } = require('ethers');
const { config } = require('./config');
const { NFT_READ_ABI, MINT_FUNCTIONS_ABI } = require('./abi');
const Logger = require('./utils/logger');

async function monitor() {
  Logger.banner();
  Logger.info('MODE: MONITOR ONLY (no auto-mint)');
  Logger.info(`Contract: ${config.contractAddress}`);
  Logger.info(`Collection: ${config.collectionName}`);
  Logger.divider();

  if (!config.contractAddress) {
    Logger.error('CONTRACT_ADDRESS not set! Edit .env first.');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  const nftContract = new ethers.Contract(
    config.contractAddress,
    [...NFT_READ_ABI, ...MINT_FUNCTIONS_ABI],
    provider
  );

  // Get wallet info if available
  let walletAddress = null;
  if (process.env.PRIVATE_KEY) {
    try {
      const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
      walletAddress = wallet.address;
    } catch (e) {}
  }

  let iteration = 0;

  while (true) {
    iteration++;

    try {
      // Basic contract info
      let name = '?', totalSupply = '?', maxSupply = '?';
      try { name = await nftContract.name(); } catch (e) {}
      try { totalSupply = (await nftContract.totalSupply()).toString(); } catch (e) {}
      try { maxSupply = (await nftContract.maxSupply()).toString(); } catch (e) {}
      if (maxSupply === '?') {
        try { maxSupply = (await nftContract.MAX_SUPPLY()).toString(); } catch (e) {}
      }

      // Block & gas info
      const blockNumber = await provider.getBlockNumber();
      const feeData = await provider.getFeeData();
      const gasPrice = ethers.formatUnits(feeData.gasPrice || 0n, 'gwei');

      // Check mint status
      let mintStatus = 'UNKNOWN';
      let isActive = false;

      const statusChecks = [
        'mintActive', 'isMintActive', 'saleActive',
        'publicSaleActive', 'isPublicSaleActive', 'saleIsActive',
        'mintEnabled', 'publicMintOpen',
      ];

      for (const fn of statusChecks) {
        try {
          const result = await nftContract[fn]();
          mintStatus = `${fn}() = ${result}`;
          isActive = result === true;
          break;
        } catch (e) { continue; }
      }

      // Check paused (inverted)
      if (mintStatus === 'UNKNOWN') {
        try {
          const paused = await nftContract.paused();
          mintStatus = `paused() = ${paused}`;
          isActive = !paused;
        } catch (e) {}
      }

      // On-chain price
      let onchainPrice = null;
      const priceFns = ['mintPrice', 'price', 'PRICE', 'cost', 'getPrice', 'publicPrice'];
      for (const fn of priceFns) {
        try {
          onchainPrice = await nftContract[fn]();
          break;
        } catch (e) { continue; }
      }

      // Wallet balance
      let walletBalance = '?';
      let walletMinted = '?';
      if (walletAddress) {
        try {
          const bal = await provider.getBalance(walletAddress);
          walletBalance = ethers.formatEther(bal).slice(0, 8);
        } catch (e) {}
        try {
          walletMinted = (await nftContract.numberMinted(walletAddress)).toString();
        } catch (e) {
          try {
            walletMinted = (await nftContract.balanceOf(walletAddress)).toString();
          } catch (e) {}
        }
      }

      // Display
      console.clear();
      Logger.banner();
      Logger.info(`LOBSTER NFT MONITOR - #${iteration}`);
      Logger.divider();
      Logger.info(`Contract:  ${config.contractAddress}`);
      Logger.info(`Name:      ${name}`);
      Logger.info(`Block:     ${blockNumber}`);
      Logger.info(`Gas:       ${parseFloat(gasPrice).toFixed(2)} Gwei`);
      Logger.divider();
      Logger.info(`Supply:    ${totalSupply} / ${maxSupply}`);
      if (onchainPrice) {
        Logger.info(`Price:     ${ethers.formatEther(onchainPrice)} ETH`);
      }
      Logger.divider();

      if (walletAddress) {
        Logger.info(`Wallet:    ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);
        Logger.info(`Balance:   ${walletBalance} ETH`);
        Logger.info(`Minted:    ${walletMinted}`);
        Logger.divider();
      }

      if (isActive) {
        Logger.success(`STATUS: MINT IS LIVE!`);
        Logger.success(`Run "npm start" to mint!`);
        process.stdout.write('\x07'); // Beep
      } else {
        Logger.warn(`STATUS: ${mintStatus}`);
      }

      Logger.divider();
      Logger.info(`Polling every ${config.pollInterval}ms... (Ctrl+C to stop)`);

    } catch (error) {
      Logger.error(`Error: ${error.message}`);
    }

    await new Promise(r => setTimeout(r, config.pollInterval));
  }
}

process.on('SIGINT', () => {
  Logger.warn('\nMonitor stopped.');
  process.exit(0);
});

monitor();
