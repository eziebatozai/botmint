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

      // For FCFS: use aggressive priority fee
      const maxPriorityFeePerGas = ethers.parseUnits(
        this.config.priorityFeeGwei.toString(),
        'gwei'
      );

      let maxFeePerGas = feeData.maxFeePerGas || ethers.parseUnits('30', 'gwei');
      const maxGasLimit = ethers.parseUnits(
        this.config.maxGasPriceGwei.toString(),
        'gwei'
      );

      // In turbo mode, use max gas directly for speed
      if (this.config.speedMode === 'turbo') {
        maxFeePerGas = maxGasLimit;
      } else {
        // Cap gas price if exceeds limit
        if (maxFeePerGas > maxGasLimit) {
          Logger.warn(`Gas ${ethers.formatUnits(maxFeePerGas, 'gwei')} Gwei > limit ${this.config.maxGasPriceGwei} Gwei`);
          maxFeePerGas = maxGasLimit;
        }
      }

      // Add priority fee on top
      maxFeePerGas = maxFeePerGas + maxPriorityFeePerGas;

      Logger.gas(`MaxFee: ${ethers.formatUnits(maxFeePerGas, 'gwei')} Gwei | Priority: ${ethers.formatUnits(maxPriorityFeePerGas, 'gwei')} Gwei`);

      return {
        maxFeePerGas,
        maxPriorityFeePerGas,
        type: 2, // EIP-1559
      };
    } catch (error) {
      Logger.error(`Gas estimation failed: ${error.message}`);
      // Fallback to legacy gas pricing
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
      const withBuffer = (estimated * BigInt(Math.floor(this.config.gasMultiplier * 100))) / 100n;

      Logger.gas(`Estimated: ${estimated.toString()} (buffered: ${withBuffer.toString()})`);
      return withBuffer;
    } catch (error) {
      Logger.warn(`Gas estimate failed, using default ${this.config.gasLimit}: ${error.message}`);
      return BigInt(this.config.gasLimit || 300000);
    }
  }
}

module.exports = GasEstimator;
