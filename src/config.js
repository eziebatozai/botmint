require('dotenv').config();

const config = {
  // RPC Configuration
  rpcUrl: process.env.RPC_URL || 'https://eth.llamarpc.com',
  rpcBackups: process.env.RPC_URLS_BACKUP ? process.env.RPC_URLS_BACKUP.split(',').map(u => u.trim()) : [
    'https://rpc.ankr.com/eth',
    'https://ethereum.publicnode.com',
    'https://1rpc.io/eth'
  ],

  // Contract - Lobster NFT (lobsternft.lol)
  contractAddress: process.env.CONTRACT_ADDRESS || '',
  mintPrice: process.env.MINT_PRICE || '0',
  mintAmount: parseInt(process.env.MINT_AMOUNT || '1'),
  maxPerWallet: parseInt(process.env.MAX_PER_WALLET || '1'),

  // Mint function configuration
  // Supported: 'mint', 'publicMint', 'mintPublic', 'claim', 'purchase', 'custom'
  mintFunction: process.env.MINT_FUNCTION || 'mint',
  // Custom function signature (jika MINT_FUNCTION=custom)
  // Contoh: "mint(uint256)" atau "publicMint(uint256,bytes32[])"
  customMintSig: process.env.CUSTOM_MINT_SIG || '',

  // Collection info
  collectionName: process.env.COLLECTION_NAME || 'Lobster NFT',
  collectionUrl: process.env.COLLECTION_URL || 'https://lobsternft.lol/mint',

  // Gas Configuration (agresif untuk FCFS)
  maxGasPriceGwei: parseFloat(process.env.MAX_GAS_PRICE_GWEI || '100'),
  priorityFeeGwei: parseFloat(process.env.PRIORITY_FEE_GWEI || '5'),
  gasLimit: parseInt(process.env.GAS_LIMIT || '300000'),
  gasMultiplier: parseFloat(process.env.GAS_MULTIPLIER || '1.5'),

  // FCFS Speed Settings
  // "turbo" = submit tx sebelum block confirm (aggressive nonce)
  // "normal" = standard execution
  speedMode: process.env.SPEED_MODE || 'turbo',
  // Jumlah TX paralel per wallet (untuk meningkatkan chance)
  parallelTx: parseInt(process.env.PARALLEL_TX || '1'),
  // Pre-sign transactions sebelum mint aktif
  preSign: process.env.PRE_SIGN !== 'false',

  // Bot Mode
  // "monitor" = polling sampai mint aktif, lalu auto-mint
  // "instant" = langsung mint sekarang
  // "snipe" = monitor pending tx di mempool, lalu front-run
  // "countdown" = mint pada waktu tertentu
  botMode: process.env.BOT_MODE || 'monitor',
  
  // Countdown mode - waktu mint target (Unix timestamp atau ISO string)
  mintStartTime: process.env.MINT_START_TIME || '',
  // Offset sebelum start time (ms) - kirim tx lebih awal
  countdownOffsetMs: parseInt(process.env.COUNTDOWN_OFFSET_MS || '2000'),

  // Polling & Retry
  pollInterval: parseInt(process.env.POLL_INTERVAL_MS || '1000'),
  maxRetries: parseInt(process.env.MAX_RETRIES || '5'),
  retryDelay: parseInt(process.env.RETRY_DELAY_MS || '500'),

  // Chain
  chainId: parseInt(process.env.CHAIN_ID || '1'),

  // Notifications
  enableNotifications: process.env.ENABLE_NOTIFICATIONS !== 'false',

  // Advanced: Flashbots (MEV protection)
  useFlashbots: process.env.USE_FLASHBOTS === 'true',
  flashbotsRpc: process.env.FLASHBOTS_RPC || 'https://rpc.flashbots.net',
};

// Validasi
function validateConfig() {
  const errors = [];

  if (!config.contractAddress || config.contractAddress === '') {
    errors.push('CONTRACT_ADDRESS belum diset! Cek contract di lobsternft.lol/mint');
  }

  if (!process.env.PRIVATE_KEY && !process.env.PRIVATE_KEYS) {
    errors.push('PRIVATE_KEY atau PRIVATE_KEYS belum diset!');
  }

  if (!config.rpcUrl || config.rpcUrl.includes('YOUR_API_KEY')) {
    errors.push('RPC_URL belum dikonfigurasi! Gunakan Alchemy/Infura/QuickNode untuk speed terbaik');
  }

  if (config.mintFunction === 'custom' && !config.customMintSig) {
    errors.push('CUSTOM_MINT_SIG harus diset jika MINT_FUNCTION=custom');
  }

  if (config.botMode === 'countdown' && !config.mintStartTime) {
    errors.push('MINT_START_TIME harus diset untuk mode countdown!');
  }

  if (errors.length > 0) {
    console.error('\n\u274C KONFIGURASI ERROR:');
    errors.forEach(e => console.error(`   - ${e}`));
    console.error('\n\uD83D\uDCDD Copy .env.example ke .env dan isi dengan nilai yang benar.\n');
    process.exit(1);
  }
}

module.exports = { config, validateConfig };
