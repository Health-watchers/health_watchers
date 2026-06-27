import { stellarConfig } from './config';
import logger from './logger';
import { mainnetSafetyManager } from './mainnet-safety.js';

/**
 * Run at startup. Validates network configuration and exits with code 1 if:
 * - Mainnet is configured without the explicit confirmation flag
 * - Network and Horizon URL are inconsistent
 */
export function assertMainnetSafety(): void {
  const { network, mainnetConfirmed, dryRun } = stellarConfig;

  // Use the mainnet safety manager to check network consistency
  const networkCheck = mainnetSafetyManager.detectNetworkConsistency();
  if (!networkCheck.passed) {
    networkCheck.errors.forEach((error) => {
      logger.error('FATAL: ' + error);
    });
    process.exit(1);
  }

  if (network === 'mainnet') {
    logger.warn('⚠️  STELLAR_NETWORK=mainnet — REAL XLM WILL BE USED ⚠️');

    if (!mainnetConfirmed) {
      logger.error(
        "MAINNET_CONFIRMED is not set to 'true'. " +
          'Set MAINNET_CONFIRMED=true to acknowledge mainnet operation. ' +
          'Exiting to prevent accidental real-funds usage.'
      );
      process.exit(1);
    }

    if (dryRun) {
      logger.warn('STELLAR_DRY_RUN=true — transactions will be simulated, not submitted.');
    }

    logger.warn('🚨 MAINNET MODE ACTIVE - All transactions will use real XLM 🚨');
  } else {
    logger.info(`Stellar network: ${network} (testnet mode)`);
  }
}

/**
 * Throws if the given XLM amount exceeds the configured per-transaction limit.
 */
export function assertTransactionLimit(amountXlm: number): void {
  const { maxTransactionXlm } = stellarConfig;
  if (amountXlm > maxTransactionXlm) {
    throw new TransactionLimitError(amountXlm, maxTransactionXlm);
  }
}

export class TransactionLimitError extends Error {
  constructor(requested: number, limit: number) {
    super(`Transaction amount ${requested} XLM exceeds limit of ${limit} XLM`);
    this.name = 'TransactionLimitError';
  }
}
