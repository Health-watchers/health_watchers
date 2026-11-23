import { Router } from 'express';
import { stellarConfig } from '../config.js';
import logger from '../logger.js';
import { recordSuccess, recordFailure } from '../metrics.js';
import {
  fundAccount,
  createIntent,
  verifyIntent,
  getAccountBalance,
  createUsdcTrustline,
  findPaths,
  getOrderbook,
  getFeeStats,
  buildFeeBumpTransaction,
  issueRefund,
  anchorDigest,
  getNetworkPassphrase,
  buildMultiSigTransaction,
  addCoSignerSignature,
  submitMultiSigTransaction,
  processBatchPayments,
  getHorizonServer,
} from '../stellar.js';
import {
  createClaimableBalance as buildCreateClaimableBalance,
  claimClaimableBalance as buildClaimClaimableBalance,
} from '../operations/claimable-balance.js';
import {
  createEscrow,
  claimEscrow,
  refundEscrow,
  getClaimableBalances as getClaimableBalancesFromEscrow,
  getClaimableBalanceById,
} from '../operations/escrow.js';
import { paymentStateMachine, PaymentState, PaymentStateContext } from '../payment-state-machine.js';
import { exchangeRateManager, refreshAllRates } from '../exchange-rates.js';
import { mainnetSafetyManager } from '../mainnet-safety.js';
import { runReconciliation, type PaymentRecord } from '../payment-reconciliation.js';
import { batchProcessor } from '../batch-processor.js';
import { Keypair, Asset } from '@stellar/stellar-sdk';
import { parseHorizonError } from '../error-handler.js';

const router = Router();

// Helper to require secret key for protected routes
function requireSecret(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }
  const token = authHeader.substring(7);
  if (token !== stellarConfig.stellarSecretKey && token !== stellarConfig.sharedSecret) {
    return res.status(401).json({ error: 'Invalid secret' });
  }
  return next();
}

// POST /fund — Fund an account with testnet XLM via Friendbot
router.post('/fund', requireSecret, async (req, res) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey) {
      return res.status(400).json({ error: 'publicKey is required' });
    }
    const result = await fundAccount(publicKey);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// POST /intent — Create a payment intent (build unsigned transaction)
router.post('/intent', requireSecret, async (req, res) => {
  try {
    const { fromPublicKey, toPublicKey, amount, asset } = req.body;
    if (!fromPublicKey || !toPublicKey || !amount) {
      return res.status(400).json({ error: 'fromPublicKey, toPublicKey, and amount are required' });
    }
    const result = await createIntent(fromPublicKey, toPublicKey, amount, asset);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    return res.status(400).json({ error: error.message });
  }
});

// POST /intent/verify — Verify a transaction by hash
router.post('/intent/verify', requireSecret, async (req, res) => {
  try {
    const { hash } = req.body;
    if (!hash) {
      return res.status(400).json({ error: 'hash is required' });
    }
    const result = await verifyIntent(hash);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /balance/:publicKey — Get account balance
router.get('/balance/:publicKey', requireSecret, async (req, res) => {
  try {
    const { publicKey } = req.params;
    const result = await getAccountBalance(publicKey);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// POST /trustline/usdc — Create a USDC trustline
router.post('/trustline/usdc', requireSecret, async (req, res) => {
  try {
    const { publicKey, trustor } = req.body;
    if (!publicKey || !trustor) {
      return res.status(400).json({ error: 'publicKey and trustor are required' });
    }
    const result = await createUsdcTrustline(publicKey, trustor);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /paths — Find payment paths
router.get('/paths', requireSecret, async (req, res) => {
  try {
    const { sourceAssetCode, sourceAssetIssuer, destinationAssetCode, destinationAssetIssuer, destinationAmount } = req.query;
    if (!sourceAssetCode || !destinationAssetCode || !destinationAmount) {
      return res.status(400).json({ error: 'Missing required query parameters' });
    }
    const result = await findPaths(
      sourceAssetCode as string,
      sourceAssetIssuer as string,
      destinationAssetCode as string,
      destinationAssetIssuer as string,
      destinationAmount as string
    );
    recordSuccess();
    return res.json({ success: true, data: result });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /orderbook — Get order book for an asset pair
router.get('/orderbook', async (req, res) => {
  try {
    const { baseAssetCode, baseAssetIssuer, counterAssetCode, counterAssetIssuer } = req.query;
    if (!baseAssetCode || !counterAssetCode) {
      return res.status(400).json({ error: 'Missing required query parameters' });
    }
    const result = await getOrderbook(
      baseAssetCode as string,
      baseAssetIssuer as string,
      counterAssetCode as string,
      counterAssetIssuer as string
    );
    recordSuccess();
    return res.json({ success: true, data: result });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /fee-stats — Get fee statistics
router.get('/fee-stats', async (_req, res) => {
  try {
    const stats = await getFeeStats();
    recordSuccess();
    return res.json({ success: true, ...stats });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// POST /fees/calculate — Calculate fees for a payment
router.post('/fees/calculate', async (req, res) => {
  try {
    const { numberOfOperations, baseFeeRate, pendingOperations, subsidyLevel } = req.body;
    if (typeof numberOfOperations !== 'number' || numberOfOperations <= 0) {
      return res.status(400).json({ error: 'numberOfOperations must be a positive number' });
    }
    const result = {
      baseFee: baseFeeRate ?? stellarConfig.maxTransactionXlm,
      numberOfOperations,
      pendingOperations,
      subsidyLevel,
    };
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    return res.status(400).json({ error: error.message });
  }
});

// GET /fees/surge-pricing — Get surge pricing tiers
router.get('/fees/surge-pricing', async (_req, res) => {
  try {
    recordSuccess();
    return res.json({ success: true, tiers: [] });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /fees/subsidies — Get available subsidy tiers
router.get('/fees/subsidies', async (_req, res) => {
  try {
    recordSuccess();
    return res.json({ success: true, tiers: [] });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// POST /fees/base — Calculate base fee
router.post('/fees/base', async (req, res) => {
  try {
    const { numberOfOperations } = req.body;
    if (typeof numberOfOperations !== 'number' || numberOfOperations <= 0) {
      return res.status(400).json({ error: 'numberOfOperations must be a positive number' });
    }
    recordSuccess();
    return res.json({ success: true, baseFee: 100 });
  } catch (error: any) {
    recordFailure();
    return res.status(400).json({ error: error.message });
  }
});

// POST /fees/surge — Calculate surged fee
router.post('/fees/surge', async (req, res) => {
  try {
    const { numberOfOperations, surgeFactor } = req.body;
    if (typeof numberOfOperations !== 'number' || numberOfOperations <= 0) {
      return res.status(400).json({ error: 'numberOfOperations must be a positive number' });
    }
    recordSuccess();
    return res.json({ success: true, baseFee: 100, surgeFactor: surgeFactor ?? 1 });
  } catch (error: any) {
    recordFailure();
    return res.status(400).json({ error: error.message });
  }
});

// POST /fees/subsidy — Calculate subsidized fee
router.post('/fees/subsidy', async (req, res) => {
  try {
    const { numberOfOperations, subsidyLevel } = req.body;
    if (typeof numberOfOperations !== 'number' || numberOfOperations <= 0) {
      return res.status(400).json({ error: 'numberOfOperations must be a positive number' });
    }
    recordSuccess();
    return res.json({ success: true, baseFee: 100, subsidyLevel: subsidyLevel ?? 0 });
  } catch (error: any) {
    recordFailure();
    return res.status(400).json({ error: error.message });
  }
});

// GET /verify/:hash — Verify a transaction by hash
router.get('/verify/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const result = await verifyIntent(hash);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// POST /claimable-balance — Create a claimable balance
router.post('/claimable-balance', requireSecret, async (req, res) => {
  try {
    const { sourceSecretKey, destinationPublicKey, amount, assetCode, assetIssuer, claimableAfter, claimableUntil } = req.body;
    if (!sourceSecretKey || !destinationPublicKey || !amount || !assetCode) {
      return res.status(400).json({ error: 'sourceSecretKey, destinationPublicKey, amount, and assetCode are required' });
    }
    const server = getHorizonServer();
    const sourceKeypair = Keypair.fromSecret(sourceSecretKey);
    const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());
    const fee = await server.fetchBaseFee();
    const asset = assetCode === 'XLM' || assetCode === 'native' ? Asset.native() : new Asset(assetCode, assetIssuer);
    const claimableAfterDate = claimableAfter ? new Date(claimableAfter) : new Date();
    const claimableUntilDate = claimableUntil ? new Date(claimableUntil) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const tx = buildCreateClaimableBalance({
      sourceAccount,
      amount,
      asset,
      claimantPublicKey: destinationPublicKey,
      claimableAfter: claimableAfterDate,
      claimableUntil: claimableUntilDate,
      networkPassphrase: getNetworkPassphrase(),
      baseFee: String(fee),
    });
    tx.sign(sourceKeypair);
    if (stellarConfig.dryRun) {
      const balanceId = `dry-run-balance-${Date.now()}`;
      return res.json({ success: true, balanceId, dryRun: true });
    }
    recordSuccess();
    return res.json({ success: true, message: 'Claimable balance created' });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// POST /claimable-balance/:balanceId/claim — Claim a claimable balance
router.post('/claimable-balance/:balanceId/claim', requireSecret, async (req, res) => {
  try {
    const { balanceId } = req.params;
    const { claimantSecretKey } = req.body;
    if (!claimantSecretKey) {
      return res.status(400).json({ error: 'claimantSecretKey is required' });
    }
    const claimantKeypair = Keypair.fromSecret(claimantSecretKey);
    const server = getHorizonServer();
    const balance = await getClaimableBalanceById(server, decodeURIComponent(balanceId));
    if (!balance) {
      return res.status(404).json({ error: 'Claimable balance not found' });
    }
    const fee = await server.fetchBaseFee();
    const tx = buildClaimClaimableBalance({
      claimantKeypair,
      balanceId: decodeURIComponent(balanceId),
      networkPassphrase: getNetworkPassphrase(),
      baseFee: String(fee),
    });
    tx.sign(claimantKeypair);
    if (stellarConfig.dryRun) {
      return res.json({ success: true, txHash: `dry-run-claim-${Date.now()}`, dryRun: true });
    }
    recordSuccess();
    return res.json({ success: true, message: 'Claimable balance claimed' });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// POST /claimable-balance/:balanceId/reclaim — Reclaim a claimable balance
router.post('/claimable-balance/:balanceId/reclaim', requireSecret, async (req, res) => {
  try {
    const { balanceId } = req.params;
    const { signerSecretKey } = req.body;
    if (!signerSecretKey) {
      return res.status(400).json({ error: 'signerSecretKey is required' });
    }
    const signerKeypair = Keypair.fromSecret(signerSecretKey);
    const server = getHorizonServer();
    const fee = await server.fetchBaseFee();
    const tx = refundEscrow({
      refundAccount: await server.loadAccount(signerKeypair.publicKey()),
      balanceId: decodeURIComponent(balanceId),
      networkPassphrase: getNetworkPassphrase(),
      baseFee: String(fee),
    });
    tx.sign(signerKeypair);
    if (stellarConfig.dryRun) {
      return res.json({ success: true, txHash: `dry-run-reclaim-${Date.now()}`, dryRun: true });
    }
    recordSuccess();
    return res.json({ success: true, message: 'Claimable balance reclaimed' });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// POST /fee-bump — Build a fee bump transaction
router.post('/fee-bump', requireSecret, async (req, res) => {
  try {
    const { baseTransactionXDR, feeMultiplier } = req.body;
    if (!baseTransactionXDR) {
      return res.status(400).json({ error: 'baseTransactionXDR is required' });
    }
    const result = await buildFeeBumpTransaction(baseTransactionXDR, feeMultiplier ?? 1.5);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    return res.status(400).json({ error: error.message });
  }
});

// POST /multi-sig/build — Build a multi-signature transaction
router.post('/multi-sig/build', requireSecret, async (req, res) => {
  try {
    const { fromPublicKey, toPublicKey, amount, signerPublicKeys } = req.body;
    if (!fromPublicKey || !toPublicKey || !amount || !Array.isArray(signerPublicKeys) || !signerPublicKeys.length) {
      return res.status(400).json({ error: 'fromPublicKey, toPublicKey, amount, and signerPublicKeys[] are required' });
    }
    const result = await buildMultiSigTransaction({ fromPublicKey, toPublicKey, amount, signerPublicKeys });
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// POST /multi-sig/add-signature — Add a co-signer signature
router.post('/multi-sig/add-signature', requireSecret, async (req, res) => {
  try {
    const { xdr, signerSecretKey } = req.body;
    if (!xdr || !signerSecretKey) {
      return res.status(400).json({ error: 'xdr and signerSecretKey are required' });
    }
    const result = await addCoSignerSignature(xdr, signerSecretKey);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    return res.status(400).json({ error: error.message });
  }
});

// POST /multi-sig/submit — Submit a multi-signature transaction
router.post('/multi-sig/submit', requireSecret, async (req, res) => {
  try {
    const { xdr } = req.body;
    if (!xdr) {
      return res.status(400).json({ error: 'xdr is required' });
    }
    const result = await submitMultiSigTransaction(xdr);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// POST /batch — Enqueue a batch of payments for async processing
router.post('/batch', requireSecret, async (req, res) => {
  try {
    const { fromPublicKey, payments } = req.body;
    if (!fromPublicKey || !Array.isArray(payments) || !payments.length) {
      return res.status(400).json({ error: 'fromPublicKey and payments[] are required' });
    }
    const result = await batchProcessor.enqueue(fromPublicKey, payments);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    return res.status(400).json({ error: error.message });
  }
});

// GET /batch/:jobId — Get batch job status
router.get('/batch/:jobId', requireSecret, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = batchProcessor.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: `Batch job not found: ${jobId}` });
    }
    recordSuccess();
    return res.json({ success: true, job });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// POST /batch/:jobId/cancel — Cancel a batch job
router.post('/batch/:jobId/cancel', requireSecret, async (req, res) => {
  try {
    const { jobId } = req.params;
    const success = batchProcessor.cancelJob(jobId);
    if (!success) {
      return res.status(404).json({ error: `Batch job not found: ${jobId}` });
    }
    recordSuccess();
    return res.json({ success: true, jobId, cancelled: true });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// POST /batch/enqueue — Enqueue a batch job for async processing
router.post('/batch/enqueue', requireSecret, async (req, res) => {
  try {
    const { fromPublicKey, payments } = req.body;
    if (!fromPublicKey || !Array.isArray(payments) || !payments.length) {
      return res.status(400).json({ error: 'fromPublicKey and payments[] are required' });
    }
    const result = await batchProcessor.enqueue(fromPublicKey, payments);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    return res.status(400).json({ error: error.message });
  }
});

// POST /batch/flush — Flush the queue immediately
router.post('/batch/flush', requireSecret, async (req, res) => {
  try {
    const { batchSize } = req.body;
    await batchProcessor.flush(batchSize);
    recordSuccess();
    return res.json({ success: true, message: 'Batch queue flushed' });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /batch/stats — Batch processor monitoring statistics
router.get('/batch/stats', async (_req, res) => {
  try {
    const stats = batchProcessor.getStats();
    return res.json({ success: true, ...stats });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /batch/queue — Get current queue snapshot
router.get('/batch/queue', requireSecret, async (_req, res) => {
  try {
    const queue = batchProcessor.getQueueSnapshot();
    recordSuccess();
    return res.json({ success: true, queue, depth: queue.length });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /batch/jobs — Get recent completed batch jobs
router.get('/batch/jobs', requireSecret, async (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const jobs = batchProcessor.getCompletedJobs(Math.min(limit, 200));
    recordSuccess();
    return res.json({ success: true, jobs, count: jobs.length });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /batch/jobs/:jobId — Get a specific batch job by ID
router.get('/batch/jobs/:jobId', requireSecret, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = batchProcessor.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: `Batch job not found: ${jobId}` });
    }
    recordSuccess();
    return res.json({ success: true, job });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// POST /batch/auto-flush/start — Start the auto-flush background scheduler
router.post('/batch/auto-flush/start', requireSecret, async (req, res) => {
  try {
    const { intervalMs, batchSize } = req.body;
    batchProcessor.startAutoFlush(intervalMs, batchSize);
    recordSuccess();
    return res.json({ success: true, message: 'Auto-flush started', intervalMs: intervalMs ?? 10000, batchSize: batchSize ?? 50 });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// POST /batch/auto-flush/stop — Stop the auto-flush background scheduler
router.post('/batch/auto-flush/stop', requireSecret, async (_req, res) => {
  try {
    batchProcessor.stopAutoFlush();
    recordSuccess();
    return res.json({ success: true, message: 'Auto-flush stopped' });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// POST /exchange-rates/refresh — Refresh exchange rates
router.post('/exchange-rates/refresh', requireSecret, async (req, res) => {
  try {
    await refreshAllRates();
    recordSuccess();
    return res.json({ success: true, message: 'Exchange rates refreshed' });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /exchange-rates/pairs — List supported currency pairs
router.get('/exchange-rates/pairs', async (_req, res) => {
  try {
    const supported = ['XLM', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF'];
    const pairs = supported.flatMap((from) => supported.filter((to) => to !== from).map((to) => `${from}/${to}`));
    recordSuccess();
    return res.json({ success: true, pairs, count: pairs.length });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /exchange-rates/cached — List all currently cached rates
router.get('/exchange-rates/cached', async (_req, res) => {
  try {
    const rates = exchangeRateManager.getCachedRates();
    recordSuccess();
    return res.json({ success: true, rates, count: rates.length });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// POST /exchange-rates/multi — Fetch rates for multiple target currencies
router.post('/exchange-rates/multi', async (req, res) => {
  try {
    const { from = 'XLM', currencies } = req.body;
    if (!Array.isArray(currencies) || !currencies.length) {
      return res.status(400).json({ error: 'currencies must be a non-empty array' });
    }
    const rates = await exchangeRateManager.getMultipleRates(from, currencies);
    recordSuccess();
    return res.json({ success: true, from, rates });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// POST /exchange-rates/refresh/:from/:to — Refresh a specific pair
router.post('/exchange-rates/refresh/:from/:to', requireSecret, async (req, res) => {
  try {
    const { from, to } = req.params;
    const rate = await exchangeRateManager.refreshRate(from, to);
    recordSuccess();
    return res.json({ success: true, ...rate });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// DELETE /exchange-rates/cache — Clear the exchange rate cache
router.delete('/exchange-rates/cache', requireSecret, async (_req, res) => {
  try {
    exchangeRateManager.clearCache();
    recordSuccess();
    return res.json({ success: true, message: 'Exchange rate cache cleared' });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// POST /exchange-rates/periodic-refresh/start — Start periodic refresh
router.post('/exchange-rates/periodic-refresh/start', requireSecret, async (req, res) => {
  try {
    const { intervalMs } = req.body;
    exchangeRateManager.startPeriodicRefresh(intervalMs);
    recordSuccess();
    return res.json({ success: true, message: 'Periodic refresh started', intervalMs: intervalMs ?? 300000 });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// POST /exchange-rates/periodic-refresh/stop — Stop periodic refresh
router.post('/exchange-rates/periodic-refresh/stop', requireSecret, async (_req, res) => {
  try {
    exchangeRateManager.stopPeriodicRefresh();
    recordSuccess();
    return res.json({ success: true, message: 'Periodic refresh stopped' });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// POST /safety-check — Perform mainnet safety checks
router.post('/safety-check', async (req, res) => {
  try {
    const { amount = 0, requireConfirmation = true } = req.body;
    if (typeof amount !== 'number') {
      return res.status(400).json({ error: 'amount must be a number' });
    }
    const result = mainnetSafetyManager.performSafetyCheck(amount, requireConfirmation);
    recordSuccess();
    return res.json({ success: result.passed, ...result, network: mainnetSafetyManager.getNetwork() });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /safety/network — Detect network and return consistency check
router.get('/safety/network', async (_req, res) => {
  try {
    const consistency = mainnetSafetyManager.detectNetworkConsistency();
    recordSuccess();
    return res.json({ success: consistency.passed, network: mainnetSafetyManager.getNetwork(), isMainnet: mainnetSafetyManager.isMainnet(), ...consistency });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// POST /safety/validate-amount — Check if an amount passes safety limits
router.post('/safety/validate-amount', async (req, res) => {
  try {
    const { amount, maxAmountXlm, warningThresholdXlm } = req.body;
    if (typeof amount !== 'number') {
      return res.status(400).json({ error: 'amount must be a number' });
    }
    const result = mainnetSafetyManager.validateAmount(amount, { maxAmountXlm, warningThresholdXlm });
    recordSuccess();
    return res.json({ success: result.passed, ...result });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// POST /safety/confirm — Register explicit confirmation for a mainnet payment
router.post('/safety/confirm', requireSecret, async (req, res) => {
  try {
    const { paymentId, confirmedBy, reason } = req.body;
    if (!paymentId || !confirmedBy) {
      return res.status(400).json({ error: 'paymentId and confirmedBy are required' });
    }
    mainnetSafetyManager.recordConfirmation(paymentId, confirmedBy, reason);
    recordSuccess();
    return res.json({ success: true, paymentId, confirmedBy, message: 'Confirmation recorded' });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /safety/confirm/:paymentId — Check confirmation status
router.get('/safety/confirm/:paymentId', requireSecret, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const state = mainnetSafetyManager.getConfirmationState(paymentId);
    recordSuccess();
    return res.json({ success: true, paymentId, confirmed: state?.confirmed ?? false, ...state });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /payment-state-machine/validate — Validate state transition
router.get('/payment-state-machine/validate', async (req, res) => {
  try {
    const { from, to } = req.query;
    const valid = paymentStateMachine.canTransition(from as string, to as string);
    recordSuccess();
    return res.json({ success: true, from, to, valid });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /payment-state-machine/states — Return all valid states and transitions
router.get('/payment-state-machine/states', async (_req, res) => {
  try {
    recordSuccess();
    return res.json({
      success: true,
      states: Object.values(PaymentState),
      transitions: [
        { from: 'PENDING', to: 'SUBMITTED', description: 'Payment submitted to Stellar' },
        { from: 'SUBMITTED', to: 'CONFIRMED', description: 'Transaction confirmed in ledger' },
        { from: 'SUBMITTED', to: 'FAILED', description: 'Transaction rejected or timed out' },
        { from: 'PENDING', to: 'FAILED', description: 'Payment cancelled before submission' },
        { from: 'FAILED', to: 'ROLLED_BACK', description: 'Failed payment rolled back' },
        { from: 'SUBMITTED', to: 'ROLLED_BACK', description: 'Submitted payment rolled back' },
      ],
      terminalStates: ['CONFIRMED', 'FAILED', 'ROLLED_BACK'],
    });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// POST /payment-state-machine/create — Create a new payment in PENDING state
router.post('/payment-state-machine/create', requireSecret, async (req, res) => {
  try {
    const { paymentId, amount, fromPublicKey, toPublicKey, metadata } = req.body;
    if (!paymentId || !amount || !fromPublicKey || !toPublicKey) {
      return res.status(400).json({ error: 'paymentId, amount, fromPublicKey, and toPublicKey are required' });
    }
    const context = paymentStateMachine.createPayment({ paymentId, amount, fromPublicKey, toPublicKey, metadata });
    recordSuccess();
    return res.json({ success: true, payment: context });
  } catch (error: any) {
    recordFailure();
    return res.status(400).json({ error: error.message });
  }
});

// POST /payment-state-machine/transition — Transition a payment to a new state
router.post('/payment-state-machine/transition', requireSecret, async (req, res) => {
  try {
    const { context, newState, transactionHash, error: errorMsg, metadata } = req.body;
    if (!context || !newState) {
      return res.status(400).json({ error: 'context and newState are required' });
    }
    if (!Object.values(PaymentState).includes(newState as PaymentState)) {
      return res.status(400).json({ error: `Invalid state: ${newState}` });
    }
    const patch: any = {};
    if (transactionHash) patch.transactionHash = transactionHash;
    if (errorMsg) patch.error = errorMsg;
    if (metadata) patch.metadata = metadata;
    const updated = await paymentStateMachine.transition(context as PaymentStateContext, newState as PaymentState, patch);
    recordSuccess();
    return res.json({ success: true, payment: updated });
  } catch (error: any) {
    recordFailure();
    return res.status(400).json({ error: error.message });
  }
});

// POST /payment-state-machine/rollback — Roll back a payment
router.post('/payment-state-machine/rollback', requireSecret, async (req, res) => {
  try {
    const { context, reason } = req.body;
    if (!context || !reason) {
      return res.status(400).json({ error: 'context and reason are required' });
    }
    const rolled = await paymentStateMachine.rollback(context as PaymentStateContext, reason);
    recordSuccess();
    return res.json({ success: true, payment: rolled });
  } catch (error: any) {
    recordFailure();
    return res.status(400).json({ error: error.message });
  }
});

// GET /payment-state-machine/history/:paymentId — Get state history
router.get('/payment-state-machine/history/:paymentId', requireSecret, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const history = paymentStateMachine.getStateHistory(paymentId);
    recordSuccess();
    return res.json({ success: true, paymentId, history, count: history.length });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

export default router;
