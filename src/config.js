require('dotenv').config();

const config = {
  // RPC (Ethereum Mainnet)
  rpcUrl: process.env.RPC_URL || 'https://eth.llamarpc.com',
  rpcBackups: process.env.RPC_URLS_BACKUP ? process.env.RPC_URLS_BACKUP.split(',').map(u => u.trim()) : ['https://rpc.ankr.com/eth', 'https://ethereum.publicnode.com'],

  // Contract (Lacertians - Ethereum)
  contractAddress: process.env.CONTRACT_ADDRESS || '0x35f39c6bc77ae5fec20c29b5212a77509fdbaf03',
  mintPrice: process.env.MINT_PRICE || '0.006',
  mintAmount: parseInt(process.env.MINT_AMOUNT || '1'),
  maxPerWallet: parseInt(process.env.MAX_PER_WALLET || '5'),

  // Collection info
  collectionSlug: process.env.COLLECTION_SLUG || 'lacertians',

  // Gas (Ethereum Mainnet)
  maxGasPriceGwei: parseFloat(process.env.MAX_GAS_PRICE_GWEI || '50'),
  priorityFeeGwei: parseFloat(process.env.PRIORITY_FEE_GWEI || '2'),
  gasLimit: parseInt(process.env.GAS_LIMIT || '0'),
  gasMultiplier: parseFloat(process.env.GAS_MULTIPLIER || '1.3'),

  // Bot
  botMode: process.env.BOT_MODE || 'monitor',
  pollInterval: parseInt(process.env.POLL_INTERVAL_MS || '2000'),
  maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
  retryDelay: parseInt(process.env.RETRY_DELAY_MS || '1000'),
  enableNotifications: process.env.ENABLE_NOTIFICATIONS !== 'false',
  chainId: parseInt(process.env.CHAIN_ID || '1'),
};

// Validasi
function validateConfig() {
  const errors = [];

  if (!config.contractAddress) {
    errors.push('CONTRACT_ADDRESS belum diset!');
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
