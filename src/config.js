require('dotenv').config();

const config = {
  // RPC
  rpcUrl: process.env.RPC_URL || 'https://mainnet.base.org',
  rpcBackups: process.env.RPC_URLS_BACKUP ? process.env.RPC_URLS_BACKUP.split(',').map(u => u.trim()) : ['https://base.meowrpc.com', 'https://base.drpc.org'],

  // Contract
  contractAddress: process.env.CONTRACT_ADDRESS || '',
  mintPrice: process.env.MINT_PRICE || '0',
  mintAmount: parseInt(process.env.MINT_AMOUNT || '1'),
  maxPerWallet: parseInt(process.env.MAX_PER_WALLET || '1'),

  // FCFS / Signed Presale
  collectionSlug: process.env.COLLECTION_SLUG || '',
  stageIndex: parseInt(process.env.STAGE_INDEX || '2'),
  opensea_api_key: process.env.OPENSEA_API_KEY || '',

  // Gas
  maxGasPriceGwei: parseFloat(process.env.MAX_GAS_PRICE_GWEI || '1'),
  priorityFeeGwei: parseFloat(process.env.PRIORITY_FEE_GWEI || '0.1'),
  gasLimit: parseInt(process.env.GAS_LIMIT || '0'),
  gasMultiplier: parseFloat(process.env.GAS_MULTIPLIER || '1.2'),

  // Bot
  botMode: process.env.BOT_MODE || 'monitor',
  pollInterval: parseInt(process.env.POLL_INTERVAL_MS || '1000'),
  maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
  retryDelay: parseInt(process.env.RETRY_DELAY_MS || '500'),
  enableNotifications: process.env.ENABLE_NOTIFICATIONS !== 'false',
  chainId: parseInt(process.env.CHAIN_ID || '8453'),
};

// Validasi
function validateConfig() {
  const errors = [];

  if (!config.contractAddress) {
    errors.push('CONTRACT_ADDRESS belum diset!');
  }

  if (!config.collectionSlug) {
    errors.push('COLLECTION_SLUG belum diset! (slug koleksi di OpenSea, contoh: "the-bamboo-order")');
  }

  if (!process.env.PRIVATE_KEY && !process.env.PRIVATE_KEYS) {
    errors.push('PRIVATE_KEY atau PRIVATE_KEYS belum diset!');
  }

  if (!config.rpcUrl || config.rpcUrl.includes('YOUR_API_KEY')) {
    errors.push('RPC_URL belum dikonfigurasi!');
  }

  if (errors.length > 0) {
    console.error('\n❌ KONFIGURASI ERROR:');
    errors.forEach(e => console.error(`   - ${e}`));
    console.error('\n📝 Copy .env.example ke .env dan isi dengan nilai yang benar.\n');
    process.exit(1);
  }
}

module.exports = { config, validateConfig };
