const { ethers } = require('ethers');
const Logger = require('./logger');

class GasEstimator {
  constructor(provider, config) {
    this.provider = provider;
    this.config = config;
  }

  async getOptimalGasSettings() {
    try {
      const feeData = await this.provider.getFeeData();
      
      const maxPriorityFeePerGas = ethers.parseUnits(
        this.config.priorityFeeGwei.toString(),
        'gwei'
      );

      let maxFeePerGas = feeData.maxFeePerGas;
      const maxGasLimit = ethers.parseUnits(
        this.config.maxGasPriceGwei.toString(),
        'gwei'
      );

      // Cap gas price jika melebihi limit
      if (maxFeePerGas > maxGasLimit) {
        Logger.warn(`Gas price ${ethers.formatUnits(maxFeePerGas, 'gwei')} Gwei melebihi limit ${this.config.maxGasPriceGwei} Gwei`);
        maxFeePerGas = maxGasLimit;
      }

      // Tambahkan priority fee
      maxFeePerGas = maxFeePerGas + maxPriorityFeePerGas;

      Logger.gas(`Max Fee: ${ethers.formatUnits(maxFeePerGas, 'gwei')} Gwei | Priority: ${ethers.formatUnits(maxPriorityFeePerGas, 'gwei')} Gwei`);

      return {
        maxFeePerGas,
        maxPriorityFeePerGas,
        type: 2, // EIP-1559
      };
    } catch (error) {
      Logger.error(`Gagal estimasi gas: ${error.message}`);
      // Fallback ke legacy gas pricing
      const gasPrice = ethers.parseUnits(
        this.config.maxGasPriceGwei.toString(),
        'gwei'
      );
      return { gasPrice };
    }
  }

  async estimateGasLimit(contract, functionName, args, value) {
    try {
      if (this.config.gasLimit > 0) {
        return BigInt(this.config.gasLimit);
      }

      const estimated = await contract[functionName].estimateGas(...args, { value });
      // Tambahkan buffer
      const withBuffer = (estimated * BigInt(Math.floor(this.config.gasMultiplier * 100))) / 100n;
      
      Logger.gas(`Estimated gas limit: ${estimated.toString()} (with buffer: ${withBuffer.toString()})`);
      return withBuffer;
    } catch (error) {
      Logger.warn(`Gas estimate gagal, menggunakan default 300000: ${error.message}`);
      return 300000n;
    }
  }
}

module.exports = GasEstimator;
