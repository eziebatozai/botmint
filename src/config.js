require('dotenv').config();

const config = {
  // RPC
  rpcUrl: process.env.RPC_URL || 'https://rpc.ankr.com/eth',
  rpcBackups: process.env.RPC_URLS_BACKUP ? process.env.RPC_URLS_BACKUP.split(',').map(u => u.trim()) : [],

  // Contract
  contractAddress: process.env.CONTRACT_ADDRESS || '',
  mintFunction: process.env.MINT_FUNCTION || 'mint',
  mintPrice: process.env.MINT_PRICE || '0',
  mintAmount: parseInt(process.env.MINT_AMOUNT || '1'),
  maxPerWallet: parseInt(process.env.MAX_PER_WALLET || '1'),

  // Gas
  maxGasPriceGwei: parseFloat(process.env.MAX_GAS_PRICE_GWEI || '100'),
  priorityFeeGwei: parseFloat(process.env.PRIORITY_FEE_GWEI || '2'),
  gasLimit: parseInt(process.env.GAS_LIMIT || '0'),
  gasMultiplier: parseFloat(process.env.GAS_MULTIPLIER || '1.2'),

  // Bot
  botMode: process.env.BOT_MODE || 'monitor',
  pollInterval: parseInt(process.env.POLL_INTERVAL_MS || '1000'),
  maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
  retryDelay: parseInt(process.env.RETRY_DELAY_MS || '500'),
  enableNotifications: process.env.ENABLE_NOTIFICATIONS !== 'false',
  chainId: parseInt(process.env.CHAIN_ID || '1'),
};

// Validasi
function validateConfig() {
  const errors = [];

  if (!config.contractAddress || config.contractAddress === '0xYOUR_CONTRACT_ADDRESS_HERE') {
    errors.push('CONTRACT_ADDRESS belum diset!');
  }

  if (!process.env.PRIVATE_KEY && !process.env.PRIVATE_KEYS) {
    errors.push('PRIVATE_KEY atau PRIVATE_KEYS belum diset!');
  }

  if (!config.rpcUrl || config.rpcUrl.includes('YOUR_API_KEY')) {
    errors.push('RPC_URL belum dikonfigurasi dengan benar!');
  }

  if (errors.length > 0) {
    console.error('\n❌ KONFIGURASI ERROR:');
    errors.forEach(e => console.error(`   - ${e}`));
    console.error('\n📝 Copy .env.example ke .env dan isi dengan nilai yang benar.\n');
    process.exit(1);
  }
}

module.exports = { config, validateConfig };
