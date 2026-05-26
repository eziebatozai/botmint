#!/usr/bin/env node

/**
 * Monitor-only mode - Cek status FCFS (SIGNED_PRESALE) stage di OpenSea
 * Berguna untuk memantau kapan stage FCFS dibuka sebelum menjalankan bot utama
 */

const { ethers } = require('ethers');
const { config } = require('./config');
const { NFT_CONTRACT_ABI, SEADROP_ABI, SEADROP_ADDRESSES } = require('./abi');
const Logger = require('./utils/logger');

// ============================================
// OPENSEA DROP INFO FETCHER (for monitor)
// ============================================

async function fetchDropInfo(walletAddress) {
  const apiUrl = 'https://opensea.io/__api/graphql';

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
    slug: config.collectionSlug,
    address: walletAddress || undefined,
  };

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Origin': 'https://opensea.io',
    'Referer': 'https://opensea.io/',
  };

  if (config.opensea_api_key) {
    headers['X-API-KEY'] = config.opensea_api_key;
  }

  const response = await fetch(apiUrl, {
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

/**
 * Coba fetch signature untuk cek apakah mint sudah bisa dieksekusi
 */
async function testSignatureAvailability(walletAddress) {
  const apiUrl = 'https://opensea.io/__api/graphql';

  const query = `
    mutation GenerateSignedMintFulfillmentDataMutation($input: GenerateSignedMintFulfillmentDataInput!) {
      drops {
        generateSignedMintFulfillmentData(input: $input) {
          ... on GenerateSignedMintFulfillmentDataSuccess {
            fulfillmentData {
              salt
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
      collectionSlug: config.collectionSlug,
      minterAddress: walletAddress,
      quantity: config.mintAmount,
      stageIndex: config.stageIndex,
    },
  };

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Origin': 'https://opensea.io',
    'Referer': 'https://opensea.io/',
    'X-Signed-Query': 'true',
  };

  if (config.opensea_api_key) {
    headers['X-API-KEY'] = config.opensea_api_key;
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    return { available: false, reason: `HTTP ${response.status}` };
  }

  const data = await response.json();
  const result = data?.data?.drops?.generateSignedMintFulfillmentData;

  if (result?.fulfillmentData?.salt) {
    return { available: true };
  }

  if (result?.message) {
    return { available: false, reason: result.message };
  }

  return { available: false, reason: 'Unknown' };
}

// ============================================
// MONITOR MAIN
// ============================================

async function monitor() {
  Logger.banner();
  Logger.info('🔍 MODE: Lacertians Mint Monitor');
  Logger.info('📋 Protocol: OpenSea SeaDrop - mintSigned (Ethereum)');
  Logger.divider();

  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  const nftContract = new ethers.Contract(config.contractAddress, NFT_CONTRACT_ABI, provider);
  
  const seaDropAddress = SEADROP_ADDRESSES[config.chainId] || SEADROP_ADDRESSES[1];

  // Get wallet address for eligibility check
  let walletAddress = null;
  if (process.env.PRIVATE_KEY) {
    try {
      const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
      walletAddress = wallet.address;
    } catch (e) {}
  }

  Logger.info(`NFT Contract: ${config.contractAddress}`);
  Logger.info(`SeaDrop: ${seaDropAddress}`);
  Logger.info(`Collection: ${config.collectionSlug}`);
  Logger.info(`Target Stage: ${config.stageIndex} (SIGNED_PRESALE / FCFS)`);
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

      // Fetch FCFS stage info from OpenSea
      let stageInfo = null;
      let allStages = [];
      let mintStatus = 'UNKNOWN';
      let mintPrice = '?';
      let maxPerWallet = '?';
      let isEligible = false;
      let alreadyMinted = null;
      let sigAvailable = false;
      let sigReason = '';

      try {
        const dropInfo = await fetchDropInfo(walletAddress);
        
        if (dropInfo && dropInfo.stages) {
          allStages = dropInfo.stages;
          stageInfo = dropInfo.stages.find(s => s.stageIndex === config.stageIndex);
          alreadyMinted = dropInfo.minterQuantityMinted;
        }

        if (stageInfo) {
          mintPrice = `${stageInfo.eligiblePrice?.token?.unit || 0} ETH`;
          maxPerWallet = stageInfo.maxTotalMintableByWallet?.toString() || '?';
          isEligible = stageInfo.isEligible;

          if (isEligible) {
            // Cek apakah signature available (= mint aktif)
            if (walletAddress) {
              const sigCheck = await testSignatureAvailability(walletAddress);
              sigAvailable = sigCheck.available;
              sigReason = sigCheck.reason || '';
            }

            if (sigAvailable) {
              mintStatus = '🟢 FCFS ACTIVE! SIGNATURE READY!';
            } else {
              mintStatus = `🟡 ELIGIBLE - Waiting for stage to open (${sigReason})`;
            }
          } else {
            mintStatus = '🔴 NOT ELIGIBLE for this stage';
          }
        } else {
          mintStatus = `⚪ Stage ${config.stageIndex} not found in drop`;
        }
      } catch (e) {
        mintStatus = `❓ OpenSea Error: ${e.message.slice(0, 60)}`;
      }

      // Display
      console.clear();
      Logger.banner();
      Logger.info(`📊 LACERTIANS MINT MONITOR - Iteration #${iteration}`);
      Logger.divider();
      Logger.info(`NFT Contract: ${config.contractAddress}`);
      Logger.info(`SeaDrop:      ${seaDropAddress}`);
      Logger.info(`Collection:   ${config.collectionSlug}`);
      Logger.info(`Block:        ${blockNumber}`);
      Logger.info(`Gas Price:    ${parseFloat(gasPrice).toFixed(4)} Gwei`);
      Logger.divider();
      Logger.info(`Supply:       ${totalSupply} / ${maxSupply}`);
      Logger.info(`Target Stage: ${config.stageIndex} (SIGNED_PRESALE)`);
      Logger.info(`Mint Price:   ${mintPrice}`);
      Logger.info(`Max/Wallet:   ${maxPerWallet}`);
      Logger.info(`Eligible:     ${isEligible ? '✅ YES' : '❌ NO'}`);
      if (alreadyMinted !== null && alreadyMinted !== undefined) {
        Logger.info(`Already Mint: ${alreadyMinted}`);
      }
      Logger.divider();

      // Show all stages
      if (allStages.length > 0) {
        Logger.info('📋 ALL STAGES:');
        for (const stage of allStages) {
          const arrow = stage.stageIndex === config.stageIndex ? ' 👉' : '   ';
          const elig = stage.isEligible ? '✅' : '❌';
          const price = stage.eligiblePrice?.token?.unit || 0;
          Logger.info(`${arrow} [${stage.stageIndex}] ${stage.stageType} | ${elig} | ${price} ETH | max: ${stage.maxTotalMintableByWallet}`);
        }
        Logger.divider();
      }

      Logger.info(`FCFS Status:  ${mintStatus}`);
      Logger.divider();
      Logger.info(`Polling every ${config.pollInterval}ms... (Ctrl+C to stop)`);

      if (sigAvailable) {
        Logger.success('\n🚨 FCFS MINT IS LIVE! Jalankan: npm start');
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
