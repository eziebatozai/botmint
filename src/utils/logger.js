const chalk = require('chalk');

class Logger {
  static info(msg) {
    console.log(`${chalk.blue('[INFO]')} ${chalk.gray(new Date().toLocaleTimeString())} ${msg}`);
  }

  static success(msg) {
    console.log(`${chalk.green('[OK]')} ${chalk.gray(new Date().toLocaleTimeString())} ${msg}`);
  }

  static warn(msg) {
    console.log(`${chalk.yellow('[WARN]')} ${chalk.gray(new Date().toLocaleTimeString())} ${msg}`);
  }

  static error(msg) {
    console.log(`${chalk.red('[ERR]')} ${chalk.gray(new Date().toLocaleTimeString())} ${msg}`);
  }

  static mint(msg) {
    console.log(`${chalk.magenta('[MINT]')} ${chalk.gray(new Date().toLocaleTimeString())} ${msg}`);
  }

  static gas(msg) {
    console.log(`${chalk.cyan('[GAS]')} ${chalk.gray(new Date().toLocaleTimeString())} ${msg}`);
  }

  static banner() {
    console.log(chalk.red(`
    ╔═══════════════════════════════════════════════╗
    ║     LOBSTER NFT - FCFS MINT BOT              ║
    ║     lobsternft.lol/mint                      ║
    ║     Speed-optimized for First Come First Serve║
    ╚═══════════════════════════════════════════════╝
    `));
  }

  static divider() {
    console.log(chalk.gray('─'.repeat(55)));
  }
}

module.exports = Logger;
