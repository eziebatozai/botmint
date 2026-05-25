const { ethers } = require('ethers');
const Logger = require('./logger');

class WalletManager {
  constructor(provider) {
    this.provider = provider;
    this.wallets = [];
  }

  loadWallets() {
    // Single wallet
    if (process.env.PRIVATE_KEY) {
      const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
      this.wallets.push(wallet);
    }

    // Multi wallet
    if (process.env.PRIVATE_KEYS) {
      const keys = process.env.PRIVATE_KEYS.split(',').map(k => k.trim());
      for (const key of keys) {
        if (key && !this.wallets.find(w => w.privateKey === key)) {
          const wallet = new ethers.Wallet(key, this.provider);
          this.wallets.push(wallet);
        }
      }
    }

    if (this.wallets.length === 0) {
      throw new Error('Tidak ada wallet yang dikonfigurasi! Set PRIVATE_KEY atau PRIVATE_KEYS di .env');
    }

    Logger.info(`Loaded ${this.wallets.length} wallet(s)`);
    return this.wallets;
  }

  async checkBalances() {
    Logger.divider();
    Logger.info('Checking wallet balances...');
    
    for (const wallet of this.wallets) {
      const balance = await this.provider.getBalance(wallet.address);
      const balanceEth = ethers.formatEther(balance);
      
      const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
      
      if (balance === 0n) {
        Logger.warn(`Wallet ${shortAddr}: ${balanceEth} ETH (KOSONG!)`);
      } else {
        Logger.info(`Wallet ${shortAddr}: ${balanceEth} ETH`);
      }
    }
    Logger.divider();
  }

  getWallets() {
    return this.wallets;
  }

  getPrimaryWallet() {
    return this.wallets[0];
  }
}

module.exports = WalletManager;
