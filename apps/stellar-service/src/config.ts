import dotenv from 'dotenv';
import path from 'path';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
}

export const stellarConfig = {
  network: process.env.STELLAR_NETWORK || 'testnet',
  mainnetConfirmed: process.env.MAINNET_CONFIRMED === 'true',
  dryRun: process.env.STELLAR_DRY_RUN === 'true',
  maxTransactionXlm: parseFloat(process.env.STELLAR_MAX_TRANSACTION_XLM || '1000'),
  // Prefer STELLAR_PORT, keep STELLAR_SERVICE_PORT for backward compatibility.
  port: process.env.STELLAR_PORT || process.env.STELLAR_SERVICE_PORT || '3002',
  platformPublicKey: process.env.STELLAR_PLATFORM_PUBLIC_KEY || '',
  // Server-side signing key — never exposed to clients
  stellarSecretKey: process.env.STELLAR_SECRET_KEY || '',
  // API base URL for posting payment confirmations back to the API
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  // Shared secret used to authenticate internal callbacks to the API
  sharedSecret: process.env.STELLAR_SERVICE_SECRET || '',
  horizonUrl:
    process.env.STELLAR_NETWORK === 'mainnet'
      ? 'https://horizon.stellar.org'
      : 'https://horizon-testnet.stellar.org',
  // Multiple Horizon endpoints for failover
  horizonUrls: getHorizonUrls(),
  // HTTP request timeout for Horizon calls (ms)
  horizonTimeoutMs: parseInt(process.env.STELLAR_HORIZON_TIMEOUT_MS || '30000', 10),
  // Retry configuration for Horizon requests
  maxRetries: parseInt(process.env.STELLAR_MAX_RETRIES || '3', 10),
  retryDelayMs: parseInt(process.env.STELLAR_RETRY_DELAY_MS || '1000', 10),
  // Batch size for processing transactions/payments
  batchSize: parseInt(process.env.STELLAR_BATCH_SIZE || '50', 10),
  // Soroban escrow contract IDs per network
  escrowContractIdTestnet: process.env.ESCROW_CONTRACT_ID_TESTNET || '',
  escrowContractIdMainnet: process.env.ESCROW_CONTRACT_ID_MAINNET || '',
  // Resolved escrow contract ID for the active network (see resolveEscrowContractId)
  escrowContractId: resolveEscrowContractId(),
  // How often the escrow event poller queries Soroban RPC getEvents (ms)
  escrowEventPollIntervalMs: parseInt(process.env.ESCROW_EVENT_POLL_INTERVAL_MS || '5000', 10),
  // Ledger to start indexing escrow events from (0 = let the poller bootstrap)
  escrowEventStartLedger: parseInt(process.env.ESCROW_EVENT_START_LEDGER || '0', 10),
};

function resolveEscrowContractId(): string {
  const isMainnet = process.env.STELLAR_NETWORK === 'mainnet';

  if (isMainnet) {
    // Never hand out a mainnet contract ID unless mainnet use is explicitly confirmed.
    if (process.env.MAINNET_CONFIRMED !== 'true') {
      return '';
    }
    return process.env.ESCROW_CONTRACT_ID_MAINNET || '';
  }

  return process.env.ESCROW_CONTRACT_ID_TESTNET || '';
}

function getHorizonUrls(): string[] {
  const isMainnet = process.env.STELLAR_NETWORK === 'mainnet';
  const customUrls =
    process.env.STELLAR_HORIZON_URLS?.split(',')
      .map((u) => u.trim())
      .filter(Boolean) || [];

  if (customUrls.length > 0) {
    return customUrls;
  }

  if (isMainnet) {
    return ['https://horizon.stellar.org', 'https://horizon.stellar.lobstr.co'];
  }

  return ['https://horizon-testnet.stellar.org', 'https://horizon.stellar.lobstr.co/testnet'];
}
