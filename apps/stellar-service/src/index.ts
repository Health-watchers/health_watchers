import express, { Request, Response } from 'express';
import {
  Keypair,
  Networks,
  TransactionBuilder,
  Operation,
  Asset,
  Memo,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { stellarConfig } from './config';
import { assertMainnetSafety, assertTransactionLimit, TransactionLimitError } from './guards';

// Safety check — exits with code 1 if mainnet is not explicitly confirmed
assertMainnetSafety();

const app = express();
app.use(express.json());

const SHUTDOWN_TIMEOUT_MS = 10_000;

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    network: stellarConfig.network,
    dryRun: stellarConfig.dryRun,
  });
});

// ── Friendbot / Fund ──────────────────────────────────────────────────────────
// Disabled on mainnet — friendbot only exists on testnet
app.post('/fund', (_req: Request, res: Response) => {
  if (stellarConfig.network === 'mainnet') {
    return res.status(403).json({
      error: 'FundbotDisabled',
      message: 'The /fund endpoint is disabled on mainnet.',
    });
  }

  // Testnet: proxy to friendbot
  return res.json({ status: 'ok', message: 'Friendbot request would be sent (testnet).' });
});

// ── Send Payment ──────────────────────────────────────────────────────────────
app.post('/send', async (req: Request, res: Response) => {
  const { destination, amount } = req.body as { destination?: string; amount?: number };

  if (!destination || amount == null) {
    return res
      .status(400)
      .json({ error: 'BadRequest', message: 'destination and amount are required' });
  }

  const amountXlm = Number(amount);
  if (isNaN(amountXlm) || amountXlm <= 0) {
    return res
      .status(400)
      .json({ error: 'BadRequest', message: 'amount must be a positive number' });
  }

  try {
    assertTransactionLimit(amountXlm);
  } catch (err) {
    if (err instanceof TransactionLimitError) {
      return res.status(400).json({
        error: 'TransactionLimitExceeded',
        message: err.message,
        limit: stellarConfig.maxTransactionXlm,
      });
    }
    throw err;
  }

  if (stellarConfig.dryRun) {
    console.log(`[DRY RUN] Would send ${amountXlm} XLM to ${destination}`);
    return res.json({ status: 'dry-run', destination, amount: amountXlm });
  }

  // Real submission would happen here
  return res.json({ status: 'ok', destination, amount: amountXlm });
});

// ── Payment Intent ────────────────────────────────────────────────────────────
// Signs a payment transaction using the server-side keypair from config.
// The caller MUST NOT supply a private key — fromSecret is never accepted.
app.post('/intent', async (req: Request, res: Response) => {
  // Reject any attempt to supply a private key in the request
  if ('fromSecret' in req.body) {
    return res.status(400).json({
      error: 'BadRequest',
      message:
        'fromSecret must not be supplied — the server signs transactions using its own keypair.',
    });
  }

  if (!stellarConfig.stellarSecretKey) {
    console.error('STELLAR_SECRET_KEY is not set — cannot sign transactions');
    return res.status(500).json({
      error: 'ConfigurationError',
      message: 'Server is not configured for transaction signing.',
    });
  }

  const { toPublic, amount, assetCode, memo } = req.body as {
    toPublic?: string;
    amount?: string;
    assetCode?: string;
    memo?: string;
  };

  if (!toPublic || !amount) {
    return res
      .status(400)
      .json({ error: 'BadRequest', message: 'toPublic and amount are required' });
  }

  const amountNum = Number(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return res
      .status(400)
      .json({ error: 'BadRequest', message: 'amount must be a positive number' });
  }

  try {
    assertTransactionLimit(amountNum);
  } catch (err) {
    if (err instanceof TransactionLimitError) {
      return res.status(400).json({
        error: 'TransactionLimitExceeded',
        message: err.message,
        limit: stellarConfig.maxTransactionXlm,
      });
    }
    throw err;
  }

  const serverKeypair = Keypair.fromSecret(stellarConfig.stellarSecretKey);
  const networkPassphrase =
    stellarConfig.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

  const asset =
    assetCode && assetCode !== 'XLM'
      ? new Asset(assetCode, serverKeypair.publicKey())
      : Asset.native();

  if (stellarConfig.dryRun) {
    console.log(`[DRY RUN] Would build intent: ${amountNum} ${assetCode ?? 'XLM'} → ${toPublic}`);
    return res.json({
      status: 'dry-run',
      from: serverKeypair.publicKey(),
      toPublic,
      amount: amountNum,
      assetCode: assetCode ?? 'XLM',
      memo: memo ?? null,
    });
  }

  // Build and sign the transaction envelope
  const { Horizon } = await import('@stellar/stellar-sdk');
  const server = new Horizon.Server(
    stellarConfig.network === 'mainnet'
      ? 'https://horizon.stellar.org'
      : 'https://horizon-testnet.stellar.org',
  );

  const sourceAccount = await server.loadAccount(serverKeypair.publicKey());

  const txBuilder = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  }).addOperation(Operation.payment({ destination: toPublic, asset, amount: String(amountNum) }));

  if (memo) {
    txBuilder.addMemo(Memo.text(memo));
  }

  const tx = txBuilder.setTimeout(30).build();
  tx.sign(serverKeypair);

  return res.json({
    status: 'ok',
    envelope: tx.toEnvelope().toXDR('base64'),
    from: serverKeypair.publicKey(),
    toPublic,
    amount: amountNum,
    assetCode: assetCode ?? 'XLM',
    memo: memo ?? null,
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const server = app.listen(stellarConfig.port, () => {
  console.log(`stellar-service running on port ${stellarConfig.port} [${stellarConfig.network}]`);
  if (stellarConfig.dryRun) {
    console.warn('  ⚠️  Dry-run mode active — no transactions will be submitted');
  }
});

function shutdown(signal: string) {
  console.info(`Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    console.info('HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Shutdown timeout exceeded — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
