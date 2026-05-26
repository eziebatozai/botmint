const chalk = require('chalk');

class Logger {
  static info(msg) {
    console.log(`${chalk.blue('[INFO]')} ${chalk.gray(new Date().toLocaleTimeString())} ${msg}`);
  }

  static success(msg) {
    console.log(`${chalk.green('[SUCCESS]')} ${chalk.gray(new Date().toLocaleTimeString())} ${msg}`);
  }

  static warn(msg) {
    console.log(`${chalk.yellow('[WARN]')} ${chalk.gray(new Date().toLocaleTimeString())} ${msg}`);
  }

  static error(msg) {
    console.log(`${chalk.red('[ERROR]')} ${chalk.gray(new Date().toLocaleTimeString())} ${msg}`);
  }

  static mint(msg) {
    console.log(`${chalk.magenta('[MINT]')} ${chalk.gray(new Date().toLocaleTimeString())} ${msg}`);
  }

  static gas(msg) {
    console.log(`${chalk.cyan('[GAS]')} ${chalk.gray(new Date().toLocaleTimeString())} ${msg}`);
  }

  static banner() {
    console.log(chalk.green(`
    ╔══════════════════════════════════════════╗
    ║  🦎 BOTMINT - Lacertians Public Mint 🦎  ║
    ║    SeaDrop.mintPublic() - ETHEREUM       ║
    ╚══════════════════════════════════════════╝
    `));
  }

  static divider() {
    console.log(chalk.gray('─'.repeat(50)));
  }
}

module.exports = Logger;
