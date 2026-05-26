const Logger = require('./logger');

class Notifier {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.notifier = null;
    
    if (enabled) {
      try {
        this.notifier = require('node-notifier');
      } catch (e) {
        Logger.warn('node-notifier tidak tersedia, notifikasi desktop dinonaktifkan');
        this.enabled = false;
      }
    }
  }

  notify(title, message) {
    if (!this.enabled || !this.notifier) return;

    try {
      this.notifier.notify({
        title: `🦎 Lacertians - ${title}`,
        message: message,
        sound: true,
      });
    } catch (e) {
      // Silent fail untuk notifikasi
    }
  }

  mintSuccess(txHash, wallet) {
    this.notify('MINT BERHASIL! ✅', `Wallet: ${wallet}\nTx: ${txHash}`);
  }

  mintFailed(error, wallet) {
    this.notify('MINT GAGAL ❌', `Wallet: ${wallet}\nError: ${error}`);
  }

  mintOpen() {
    this.notify('MINT DIBUKA! 🚀', 'Mint sudah aktif! Bot sedang eksekusi...');
  }
}

module.exports = Notifier;
