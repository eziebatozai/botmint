const Logger = require('./logger');

class Notifier {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.notifier = null;

    if (enabled) {
      try {
        this.notifier = require('node-notifier');
      } catch (e) {
        Logger.warn('node-notifier not available, desktop notifications disabled');
        this.enabled = false;
      }
    }
  }

  notify(title, message) {
    if (!this.enabled || !this.notifier) return;

    try {
      this.notifier.notify({
        title: `Lobster NFT - ${title}`,
        message: message,
        sound: true,
      });
    } catch (e) {
      // Silent fail
    }
  }

  mintSuccess(txHash, wallet) {
    this.notify('MINT SUCCESS!', `Wallet: ${wallet}\nTx: ${txHash}`);
  }

  mintFailed(error, wallet) {
    this.notify('MINT FAILED', `Wallet: ${wallet}\nError: ${error}`);
  }

  mintOpen() {
    this.notify('MINT IS LIVE!', 'FCFS mint detected! Executing...');
  }
}

module.exports = Notifier;
