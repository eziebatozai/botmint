#!/usr/bin/env node

/**
 * Lobster NFT - FCFS Mint Monitor
 * Monitor contract claim condition status tanpa auto-mint
 * Contract: 0x1de237c7063a9ee531e06a6c3fba4e3e704f2a74 (Thirdweb ERC721Drop)
 */

const { ethers } = require('ethers');
const { config } = require('./config');
const { THIRDWEB_DROP_ABI, NATIVE_TOKEN_ADDRESS } = require('./abi');
const Logger = require('./utils/logger');

async function monitor() {
  Logger.banner();
  Logger.info('MODE: MONITOR ONLY (no auto-claim)');
  Logger.info(`Contract: ${config.contractAddress}`);
  Logger.info(`Collection: ${config.collectionName}`);
  Logger.divider();

  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  const nftContract = new ethers.Contract(
    config.contractAddress,
    THIRDWEB_DROP_ABI,
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

      // Block & gas info
      const blockNumber = await provider.getBlockNumber();
      const feeData = await provider.getFeeData();
      const gasPrice = ethers.formatUnits(feeData.gasPrice || 0n, 'gwei');

      // Claim condition
      let claimStatus = 'UNKNOWN';
      let isActive = false;
      let conditionInfo = null;

      try {
        const conditionId = await nftContract.getActiveClaimConditionId();
        const condition = await nftContract.getClaimConditionById(conditionId);
        conditionInfo = condition;

        const startTime = Number(condition.startTimestamp);
        const now = Math.floor(Date.now() / 1000);
        const supplyClaimed = condition.supplyClaimed.toString();
        const maxClaimable = condition.maxClaimableSupply.toString();
        const pricePerToken = ethers.formatEther(condition.pricePerToken);
        const quantityLimit = condition.quantityLimitPerWallet.toString();

        if (startTime === 0) {
          claimStatus = 'NOT CONFIGURED (startTimestamp=0)';
        } else if (startTime > now) {
          const diff = startTime - now;
          const mins = Math.floor(diff / 60);
          const secs = diff % 60;
          claimStatus = `STARTS IN ${mins}m ${secs}s`;
        } else {
          if (maxClaimable !== '0' && BigInt(supplyClaimed) >= BigInt(maxClaimable)) {
            claimStatus = 'SOLD OUT';
          } else {
            claimStatus = 'LIVE!';
            isActive = true;
          }
        }

        // Display
        console.clear();
        Logger.banner();
        Logger.info(`LOBSTER NFT MONITOR - #${iteration}`);
        Logger.divider();
        Logger.info(`Contract:     ${config.contractAddress}`);
        Logger.info(`Name:         ${name}`);
        Logger.info(`Block:        ${blockNumber}`);
        Logger.info(`Gas:          ${parseFloat(gasPrice).toFixed(2)} Gwei`);
        Logger.divider();
        Logger.info(`Supply:       ${totalSupply} / ${maxSupply}`);
        Logger.info(`Claimed:      ${supplyClaimed} / ${maxClaimable}`);
        Logger.info(`Price:        ${pricePerToken} ETH`);
        Logger.info(`Limit/Wallet: ${quantityLimit}`);
        Logger.info(`Condition ID: ${conditionId.toString()}`);

        if (startTime > 0) {
          Logger.info(`Start Time:   ${new Date(startTime * 1000).toLocaleString()}`);
        }

        // Merkle root check
        const merkleRoot = condition.merkleRoot;
        const isPublic = merkleRoot === '0x0000000000000000000000000000000000000000000000000000000000000000';
        Logger.info(`Mint Type:    ${isPublic ? 'PUBLIC' : 'ALLOWLIST'}`);

      } catch (e) {
        // No active condition
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
        claimStatus = `NO ACTIVE CONDITION: ${e.message.slice(0, 50)}`;
      }

      Logger.divider();

      // Wallet info
      if (walletAddress) {
        let walletBalance = '?';
        let walletClaimed = '?';

        try {
          const bal = await provider.getBalance(walletAddress);
          walletBalance = ethers.formatEther(bal).slice(0, 10);
        } catch (e) {}

        if (conditionInfo) {
          try {
            const conditionId = await nftContract.getActiveClaimConditionId();
            const claimed = await nftContract.getSupplyClaimedByWallet(conditionId, walletAddress);
            walletClaimed = claimed.toString();
          } catch (e) {}
        }

        Logger.info(`Wallet:    ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);
        Logger.info(`Balance:   ${walletBalance} ETH`);
        Logger.info(`Claimed:   ${walletClaimed}`);
        Logger.divider();
      }

      if (isActive) {
        Logger.success(`STATUS: ${claimStatus}`);
        Logger.success(`Run "npm start" or "npm run instant" to claim!`);
        process.stdout.write('\x07'); // Beep
      } else {
        Logger.warn(`STATUS: ${claimStatus}`);
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
