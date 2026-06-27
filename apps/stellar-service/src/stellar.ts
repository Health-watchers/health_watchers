import {
  Keypair,
  Horizon,
  TransactionBuilder,
  BASE_FEE,
  Networks,
  Operation,
  Asset,
} from '@stellar/stellar-sdk';
import { stellarConfig } from './config.js';
import { assertTransactionLimit } from './guards.js';
import logger from './logger.js';
import ResilientHorizonClient from './horizon-client.js';

// Initialize resilient Horizon client
const horizonClient = new ResilientHorizonClient(stellarConfig.horizonUrls);
horizonClient.startHealthChecks();

/**
 * Normalise a thrown value into a fully-detailed error context for logging.
 * Captures the message, stack, name, and any Horizon-specific result codes —
 * which are essential for debugging failed (and irreversible) transactions.
 */
export function toErrorContext(error: unknown): Record<string, unknown> {
  const err = error as any;
  return {
    message: err?.message ?? String(error),
    name: err?.name,
    stack: err?.stack,
    status: err?.response?.status,
    horizonResultCodes: err?.response?.data?.extras?.result_codes,
    horizonDetail: err?.response?.data?.detail ?? err?.response?.data?.title,
  };
}

/**
 * Instrument a single Horizon API call: logs the request and the response
 * (with timing + outcome) at debug level, and any failure with full context.
 * Returns the wrapped call's result so callers keep their existing behaviour.
 */
export async function withHorizonCall<T>(
  horizonOp: string,
  meta: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  logger.debug({ horizonOp, ...meta, phase: 'request' }, `Horizon request: ${horizonOp}`);
  try {
    const result = await fn();
    logger.debug(
      { horizonOp, ...meta, phase: 'response', outcome: 'success', durationMs: Date.now() - start },
      `Horizon response: ${horizonOp}`
    );
    return result;
  } catch (error) {
    logger.error(
      {
        horizonOp,
        ...meta,
        phase: 'response',
        outcome: 'failure',
        durationMs: Date.now() - start,
        error: toErrorContext(error),
      },
      `Horizon call failed: ${horizonOp}`
    );
    throw error;
  }
}

/**
 * Get the appropriate network passphrase using SDK constants
 */
export function getNetworkPassphrase(): string {
  return stellarConfig.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

/**
 * Get Horizon server instance
 */
export function getHorizonServer(): Horizon.Server {
  return horizonClient.getServer();
}

/**
 * Get network status
 */
export async function getNetworkStatus() {
  return horizonClient.getNetworkStatus();
}

/**
 * Fund an account using Friendbot (testnet only)
 * Returns 403 on mainnet as Friendbot is testnet-only
 */
export async function fundAccount(publicKey: string, amount?: number) {
  // Friendbot is testnet-only
  if (stellarConfig.network === 'mainnet') {
    throw new Error('Friendbot funding is not available on mainnet. Use real XLM instead.');
  }

  const start = Date.now();
  logger.info({ operation: 'fundAccount', publicKey, amount }, 'Funding account via Friendbot');

  try {
    const response = await fetch(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { detail?: string };
      throw new Error(body.detail ?? `Friendbot request failed: ${response.statusText}`);
    }

    const json = (await response.json()) as { hash: string; ledger: number };
    const durationMs = Date.now() - start;
    logger.info(
      {
        operation: 'fundAccount',
        publicKey,
        asset: 'XLM',
        hash: json.hash,
        ledger: json.ledger,
        outcome: 'success',
        durationMs,
      },
      'Account funded successfully'
    );

    return {
      funded: true,
      hash: json.hash,
      ledger: json.ledger,
      durationMs,
    };
  } catch (error) {
    logger.error(
      {
        operation: 'fundAccount',
        publicKey,
        asset: 'XLM',
        outcome: 'failure',
        durationMs: Date.now() - start,
        error: toErrorContext(error),
      },
      'Failed to fund account'
    );
    throw error;
  }
}

/**
 * Get account balance and recent transactions
 */
export async function getAccountBalance(publicKey: string) {
  const server = getHorizonServer();
  try {
    const start = Date.now();
    logger.info({ operation: 'getAccountBalance', publicKey }, 'Loading account from Horizon');
    const account = await withHorizonCall('loadAccount', { publicKey }, () =>
      server.loadAccount(publicKey)
    );
    const xlmBalance = account.balances.find((b: any) => b.asset_type === 'native');
    const usdcBalance = account.balances.find(
      (b: any) => b.asset_code === 'USDC' && b.asset_type !== 'native'
    );

    const payments = await withHorizonCall('payments', { publicKey }, () =>
      server.payments().forAccount(publicKey).limit(10).order('desc').call()
    );
    const transactions = payments.records
      .filter((r: any) => r.type === 'payment' || r.type === 'create_account')
      .map((r: any) => ({
        id: r.id,
        type: r.type,
        amount: r.amount ?? r.starting_balance ?? '0',
        asset: r.asset_type === 'native' ? 'XLM' : `${r.asset_code}:${r.asset_issuer}`,
        from: r.from ?? r.funder,
        to: r.to ?? r.account,
        hash: r.transaction_hash,
        createdAt: r.created_at,
      }));

    const durationMs = Date.now() - start;
    logger.info(
      { operation: 'getAccountBalance', publicKey, outcome: 'success', durationMs },
      'Fetched account balance and recent transactions'
    );
    return {
      balance: xlmBalance ? xlmBalance.balance : '0',
      usdcBalance: usdcBalance ? usdcBalance.balance : null,
      transactions,
      durationMs,
    };
  } catch (error: any) {
    logger.error(
      {
        operation: 'getAccountBalance',
        publicKey,
        outcome: 'failure',
        error: toErrorContext(error),
      },
      'Failed to get account balance'
    );
    throw error;
  }
}

/**
 * Create a USDC trustline for an account
 */
export async function createUsdcTrustline(publicKey: string, usdcIssuer: string) {
  const start = Date.now();
  logger.info(
    { operation: 'createUsdcTrustline', publicKey, asset: 'USDC', usdcIssuer },
    'Creating USDC trustline'
  );

  try {
    const server = getHorizonServer();
    const sourceAccount = await withHorizonCall('loadAccount', { publicKey }, () =>
      server.loadAccount(publicKey)
    );

    // Check if trustline already exists
    const existing = sourceAccount.balances.find(
      (b: any) => b.asset_code === 'USDC' && b.asset_issuer === usdcIssuer
    );
    if (existing) {
      logger.info(
        {
          operation: 'createUsdcTrustline',
          publicKey,
          asset: 'USDC',
          outcome: 'success',
          alreadyExists: true,
        },
        'USDC trustline already exists'
      );
      return { alreadyExists: true, trustline: 'USDC' };
    }

    const fee = await withHorizonCall('fetchBaseFee', { publicKey }, () => server.fetchBaseFee());
    const transaction = new TransactionBuilder(sourceAccount, {
      fee: String(fee),
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(
        Operation.changeTrust({
          asset: new Asset('USDC', usdcIssuer),
        })
      )
      .setTimeout(30)
      .build();

    if (stellarConfig.stellarSecretKey) {
      const keypair = Keypair.fromSecret(stellarConfig.stellarSecretKey);
      transaction.sign(keypair);
      if (!stellarConfig.dryRun) {
        const result = await withHorizonCall(
          'submitTransaction',
          { publicKey, asset: 'USDC' },
          () => server.submitTransaction(transaction)
        );
        const durationMs = Date.now() - start;
        logger.info(
          {
            operation: 'createUsdcTrustline',
            publicKey,
            asset: 'USDC',
            usdcIssuer,
            hash: result.hash,
            outcome: 'success',
            durationMs,
          },
          'USDC trustline created'
        );
        return { created: true, hash: result.hash, durationMs };
      }
    }

    logger.info(
      {
        operation: 'createUsdcTrustline',
        publicKey,
        asset: 'USDC',
        outcome: 'success',
        dryRun: true,
        durationMs: Date.now() - start,
      },
      'USDC trustline transaction built (dry run)'
    );
    return { envelope: transaction.toEnvelope().toXDR('base64'), dryRun: true };
  } catch (error) {
    logger.error(
      {
        operation: 'createUsdcTrustline',
        publicKey,
        asset: 'USDC',
        usdcIssuer,
        outcome: 'failure',
        durationMs: Date.now() - start,
        error: toErrorContext(error),
      },
      'Failed to create USDC trustline'
    );
    throw error;
  }
}

/**
 * Create a payment intent (transaction envelope)
 */
export async function createIntent(fromPublicKey: string, toPublicKey: string, amount: string) {
  const amountNum = parseFloat(amount);
  assertTransactionLimit(amountNum);
  const start = Date.now();
  logger.info(
    { operation: 'createIntent', from: fromPublicKey, to: toPublicKey, amount },
    'Creating payment intent'
  );

  const server = getHorizonServer();
  const sourceKeypair = Keypair.fromSecret(stellarConfig.stellarSecretKey);

  try {
    const account = await withHorizonCall('loadAccount', { publicKey: fromPublicKey }, () =>
      server.loadAccount(fromPublicKey)
    );

    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(
        Operation.payment({
          destination: toPublicKey,
          asset: Asset.native(),
          amount: amount,
        })
      )
      .setTimeout(300)
      .build();

    transaction.sign(sourceKeypair);

    const xdr = transaction.toXDR();
    const hash = transaction.hash().toString('hex');
    const durationMs = Date.now() - start;

    logger.info(
      {
        operation: 'createIntent',
        from: fromPublicKey,
        to: toPublicKey,
        amount,
        asset: 'XLM',
        hash,
        outcome: 'success',
        durationMs,
      },
      'Payment intent created'
    );

    return {
      xdr,
      hash,
      networkPassphrase: getNetworkPassphrase(),
      envelope: transaction.toEnvelope().toXDR('base64'),
      durationMs,
    };
  } catch (error) {
    logger.error(
      {
        operation: 'createIntent',
        from: fromPublicKey,
        to: toPublicKey,
        amount,
        asset: 'XLM',
        outcome: 'failure',
        durationMs: Date.now() - start,
        error: toErrorContext(error),
      },
      'Failed to create intent'
    );
    throw error;
  }
}

/**
 * Verify a transaction by hash
 */
export async function verifyIntent(hash: string) {
  const start = Date.now();
  logger.info({ operation: 'verifyIntent', hash }, 'Verifying transaction');

  const server = getHorizonServer();

  try {
    const transaction = await withHorizonCall('transactions', { hash }, () =>
      server.transactions().transaction(hash).call()
    );
    const durationMs = Date.now() - start;
    logger.info(
      {
        operation: 'verifyIntent',
        hash,
        successful: transaction.successful,
        outcome: 'success',
        durationMs,
      },
      'Transaction verified'
    );

    return {
      found: true,
      hash: transaction.hash,
      successful: transaction.successful,
      ledger: transaction.ledger_attr,
      createdAt: transaction.created_at,
      durationMs,
    };
  } catch (error: any) {
    if (error.response?.status === 404) {
      logger.info(
        { operation: 'verifyIntent', hash, outcome: 'not_found' },
        'Transaction not found on Horizon'
      );
      return { found: false, error: 'Transaction not found' };
    }
    logger.error(
      { operation: 'verifyIntent', hash, outcome: 'failure', error: toErrorContext(error) },
      'Failed to verify transaction'
    );
    throw error;
  }
}

/**
 * Discover payment paths using strict-receive
 */
export async function findPaths(
  sourceAssetCode: string,
  sourceAssetIssuer: string | undefined,
  destinationAssetCode: string,
  destinationAssetIssuer: string | undefined,
  destinationAmount: string
) {
  const server = getHorizonServer();

  const destAsset =
    destinationAssetCode === 'XLM'
      ? Asset.native()
      : new Asset(destinationAssetCode, destinationAssetIssuer!);

  const sourceAssets =
    sourceAssetCode === 'XLM' ? [Asset.native()] : [new Asset(sourceAssetCode, sourceAssetIssuer!)];

  try {
    const start = Date.now();
    const paths = await withHorizonCall(
      'strictReceivePaths',
      { sourceAssetCode, destinationAssetCode, destinationAmount },
      () => server.strictReceivePaths(sourceAssets, destAsset, destinationAmount).call()
    );

    const durationMs = Date.now() - start;
    logger.info(
      {
        operation: 'findPaths',
        sourceAssetCode,
        destinationAssetCode,
        destinationAmount,
        outcome: 'success',
        durationMs,
        count: paths.records.length,
      },
      'Found payment paths'
    );

    return paths.records.map((p: Horizon.ServerApi.PaymentPathRecord) => ({
      sourceAssetCode: p.source_asset_type === 'native' ? 'XLM' : p.source_asset_code,
      sourceAssetIssuer: p.source_asset_issuer,
      sourceAmount: p.source_amount,
      destinationAssetCode:
        p.destination_asset_type === 'native' ? 'XLM' : p.destination_asset_code,
      destinationAssetIssuer: p.destination_asset_issuer,
      destinationAmount: p.destination_amount,
      path: p.path.map((a: any) => (a.asset_type === 'native' ? 'XLM' : a.asset_code)),
    }));
  } catch (error: any) {
    logger.error(
      {
        operation: 'findPaths',
        sourceAssetCode,
        destinationAssetCode,
        outcome: 'failure',
        error: toErrorContext(error),
      },
      'Failed to find paths'
    );
    throw error;
  }
}

/**
 * Get order book for an asset pair
 */
export async function getOrderbook(
  baseAssetCode: string,
  baseAssetIssuer: string | undefined,
  counterAssetCode: string,
  counterAssetIssuer: string | undefined
) {
  const server = getHorizonServer();

  const base =
    baseAssetCode === 'XLM' ? Asset.native() : new Asset(baseAssetCode, baseAssetIssuer!);
  const counter =
    counterAssetCode === 'XLM' ? Asset.native() : new Asset(counterAssetCode, counterAssetIssuer!);

  try {
    const start = Date.now();
    const orderbook = await withHorizonCall('orderbook', { baseAssetCode, counterAssetCode }, () =>
      server.orderbook(base, counter).call()
    );
    const durationMs = Date.now() - start;
    logger.info(
      {
        operation: 'getOrderbook',
        baseAssetCode,
        counterAssetCode,
        outcome: 'success',
        durationMs,
      },
      'Fetched orderbook'
    );
    return {
      base: baseAssetCode,
      counter: counterAssetCode,
      bids: orderbook.bids.slice(0, 10),
      asks: orderbook.asks.slice(0, 10),
      durationMs,
    };
  } catch (error: any) {
    logger.error(
      {
        operation: 'getOrderbook',
        baseAssetCode,
        counterAssetCode,
        outcome: 'failure',
        error: toErrorContext(error),
      },
      'Failed to get orderbook'
    );
    throw error;
  }
}

const STROOPS_PER_XLM = 10_000_000;

/**
 * Issue a refund by sending XLM from the platform account to a destination
 */
export async function issueRefund(toPublicKey: string, amount: string, memo: string) {
  assertTransactionLimit(parseFloat(amount));

  const start = Date.now();
  logger.info(
    { operation: 'issueRefund', to: toPublicKey, amount, asset: 'XLM' },
    'Issuing refund'
  );

  try {
    const server = getHorizonServer();
    const sourceKeypair = Keypair.fromSecret(stellarConfig.stellarSecretKey);
    const account = await withHorizonCall(
      'loadAccount',
      { publicKey: sourceKeypair.publicKey() },
      () => server.loadAccount(sourceKeypair.publicKey())
    );
    const fee = await withHorizonCall('fetchBaseFee', {}, () => server.fetchBaseFee());

    const transaction = new TransactionBuilder(account, {
      fee: String(fee),
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(
        Operation.payment({
          destination: toPublicKey,
          asset: Asset.native(),
          amount,
        })
      )
      .addMemo({ type: 'text', value: memo.slice(0, 28) } as any)
      .setTimeout(300)
      .build();

    transaction.sign(sourceKeypair);

    if (stellarConfig.dryRun) {
      const hash = 'dry-run-' + transaction.hash().toString('hex');
      logger.info(
        {
          operation: 'issueRefund',
          to: toPublicKey,
          amount,
          asset: 'XLM',
          hash,
          outcome: 'success',
          dryRun: true,
          durationMs: Date.now() - start,
        },
        'Refund transaction built (dry run)'
      );
      return { transactionHash: hash, dryRun: true };
    }

    const result = await withHorizonCall(
      'submitTransaction',
      { to: toPublicKey, amount, asset: 'XLM' },
      () => server.submitTransaction(transaction)
    );
    const durationMs = Date.now() - start;
    logger.info(
      {
        operation: 'issueRefund',
        hash: result.hash,
        to: toPublicKey,
        amount,
        asset: 'XLM',
        outcome: 'success',
        durationMs,
      },
      'Refund issued'
    );
    return { transactionHash: result.hash, durationMs };
  } catch (error) {
    logger.error(
      {
        operation: 'issueRefund',
        to: toPublicKey,
        amount,
        asset: 'XLM',
        outcome: 'failure',
        durationMs: Date.now() - start,
        error: toErrorContext(error),
      },
      'Failed to issue refund'
    );
    throw error;
  }
}

function stroopsToXlm(stroops: string): string {
  return (parseInt(stroops, 10) / STROOPS_PER_XLM).toFixed(7);
}

/** Fetch fee statistics from Horizon */
export async function getFeeStats() {
  const start = Date.now();
  const server = getHorizonServer();
  const stats = await withHorizonCall('feeStats', { operation: 'getFeeStats' }, () =>
    server.feeStats()
  );
  const { fee_charged } = stats;
  logger.info(
    { operation: 'getFeeStats', outcome: 'success', durationMs: Date.now() - start },
    'Fetched fee statistics'
  );
  return {
    slow: {
      stroops: fee_charged.p10,
      xlm: stroopsToXlm(fee_charged.p10),
      confirmationTime: '~60s',
    },
    standard: {
      stroops: fee_charged.p50,
      xlm: stroopsToXlm(fee_charged.p50),
      confirmationTime: '~30s',
    },
    fast: {
      stroops: fee_charged.p90,
      xlm: stroopsToXlm(fee_charged.p90),
      confirmationTime: '~10s',
    },
    raw: {
      min: fee_charged.min,
      mode: fee_charged.mode,
      max: fee_charged.max,
      p10: fee_charged.p10,
      p50: fee_charged.p50,
      p90: fee_charged.p90,
      p99: fee_charged.p99,
    },
  };
}

/**
 * Wrap an inner transaction XDR in a fee bump transaction signed by the platform keypair.
 * The platform pays the fee; the inner transaction signer pays nothing.
 */
export async function buildFeeBumpTransaction(innerXdr: string): Promise<{
  xdr: string;
  hash: string;
  feeStroops: number;
}> {
  if (!stellarConfig.stellarSecretKey) {
    throw new Error('Platform secret key not configured for fee sponsorship');
  }

  const start = Date.now();
  logger.info({ operation: 'buildFeeBumpTransaction' }, 'Building fee bump transaction');

  try {
    const platformKeypair = Keypair.fromSecret(stellarConfig.stellarSecretKey);
    const { Transaction } = await import('@stellar/stellar-sdk');

    // Deserialise the inner transaction
    const innerTx = new Transaction(innerXdr, getNetworkPassphrase());

    const feeStroops = parseInt(BASE_FEE, 10) * 10; // 10× base fee for priority

    const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
      platformKeypair,
      String(feeStroops),
      innerTx,
      getNetworkPassphrase()
    );

    feeBumpTx.sign(platformKeypair);

    const xdr = feeBumpTx.toXDR();
    const hash = feeBumpTx.hash().toString('hex');

    if (!stellarConfig.dryRun) {
      const server = getHorizonServer();
      await withHorizonCall(
        'submitTransaction',
        { operation: 'buildFeeBumpTransaction', hash, feeStroops },
        () => server.submitTransaction(feeBumpTx)
      );
    }

    logger.info(
      {
        operation: 'buildFeeBumpTransaction',
        hash,
        feeStroops,
        outcome: 'success',
        durationMs: Date.now() - start,
      },
      'Fee bump transaction built'
    );

    return { xdr, hash, feeStroops };
  } catch (error) {
    logger.error(
      {
        operation: 'buildFeeBumpTransaction',
        outcome: 'failure',
        durationMs: Date.now() - start,
        error: toErrorContext(error),
      },
      'Failed to build fee bump transaction'
    );
    throw error;
  }
}

/** Check Horizon connectivity and latency */
export async function checkHorizon(): Promise<{
  status: 'healthy' | 'unhealthy';
  latency?: number;
}> {
  const server = getHorizonServer();
  const start = Date.now();
  try {
    await server.feeStats();
    const latency = Date.now() - start;
    logger.debug({ operation: 'checkHorizon', outcome: 'success', latency }, 'Horizon healthy');
    return { status: 'healthy', latency };
  } catch (error) {
    const latency = Date.now() - start;
    logger.warn(
      { operation: 'checkHorizon', outcome: 'failure', latency, error: toErrorContext(error) },
      'Horizon health check failed'
    );
    return { status: 'unhealthy', latency };
  }
}

export interface StreamedTransaction {
  hash: string;
  amount: string;
  asset: string;
  from: string;
  to: string;
  type: string;
  createdAt: string;
}

/**
 * Stream real-time transactions for an account via Horizon SSE.
 * Calls onTransaction for each new payment/create_account record.
 * Returns a close() function to stop the stream.
 */
export function streamAccountTransactions(
  publicKey: string,
  onTransaction: (tx: StreamedTransaction) => void,
  onError?: (err: unknown) => void
): () => void {
  const server = getHorizonServer();

  logger.info(
    { operation: 'streamAccountTransactions', publicKey },
    'Starting account transaction stream'
  );

  const close = server
    .payments()
    .forAccount(publicKey)
    .cursor('now')
    .stream({
      onmessage: (record: any) => {
        if (record.type !== 'payment' && record.type !== 'create_account') return;
        onTransaction({
          hash: record.transaction_hash,
          amount: record.amount ?? record.starting_balance ?? '0',
          asset:
            record.asset_type === 'native' ? 'XLM' : `${record.asset_code}:${record.asset_issuer}`,
          from: record.from ?? record.funder ?? '',
          to: record.to ?? record.account ?? '',
          type: record.type,
          createdAt: record.created_at,
        });
      },
      onerror: (err: unknown) => {
        logger.error(
          {
            operation: 'streamAccountTransactions',
            publicKey,
            outcome: 'failure',
            error: toErrorContext(err),
          },
          'Account transaction stream error'
        );
        onError?.(err);
      },
    });

  return close as () => void;
}
