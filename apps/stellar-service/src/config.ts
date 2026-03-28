import dotenv from 'dotenv';
import path from 'path';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
}

export const stellarConfig = {
  network:            process.env.STELLAR_NETWORK || "testnet",
  mainnetConfirmed:   process.env.STELLAR_MAINNET_CONFIRMED === "true",
  dryRun:             process.env.STELLAR_DRY_RUN === "true",
  maxTransactionXlm:  parseFloat(process.env.STELLAR_MAX_TRANSACTION_XLM || "1000"),
  port:               process.env.STELLAR_SERVICE_PORT || "3002",
  platformPublicKey:  process.env.STELLAR_PLATFORM_PUBLIC_KEY || "",
  network: process.env.STELLAR_NETWORK || 'testnet',
  mainnetConfirmed: process.env.STELLAR_MAINNET_CONFIRMED === 'true',
  dryRun: process.env.STELLAR_DRY_RUN === 'true',
  maxTransactionXlm: parseFloat(process.env.STELLAR_MAX_TRANSACTION_XLM || '1000'),
  // Prefer STELLAR_PORT, keep STELLAR_SERVICE_PORT for backward compatibility.
  port: process.env.STELLAR_PORT || process.env.STELLAR_SERVICE_PORT || '3002',
};
