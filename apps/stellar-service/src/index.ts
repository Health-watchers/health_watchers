// apps/stellar-service/src/index.ts

import './tracing'; // must be first — initialises OpenTelemetry SDK
import crypto from 'crypto';
import express from 'express';
import { Server } from 'http';
import pinoHttp from 'pino-http';
import {
  fundAccount,
  createIntent,
  verifyIntent,
  getAccountBalance,
  createUsdcTrustline,
  findPaths,
  getOrderbook,
  checkHorizon,
  getFeeStats,
  buildFeeBumpTransaction,
  issueRefund,
  streamAccountTransactions,
  getNetworkStatus,
  getHorizonServer,
  getNetworkPassphrase,
  buildMultiSigTransaction,
  addCoSignerSignature,
  submitMultiSigTransaction,
  processBatchPayments,
} from './stellar.js';
import {
  createClaimableBalance as buildCreateClaimableBalance,
  claimClaimableBalance as buildClaimClaimableBalance,
} from './operations/claimable-balance.js';
import {
  createEscrow,
  claimEscrow,
  refundEscrow,
  getClaimableBalances as getClaimableBalancesFromEscrow,
  getClaimableBalanceById,
} from './operations/escrow.js';
import { paymentStateMachine, PaymentState, PaymentStateContext } from './payment-state-machine.js';
import { mainnetSafetyManager } from './mainnet-safety.js';
import { exchangeRateManager } from './exchange-rates.js';
import { Keypair, Asset } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
import logger from './logger.js';
import { stellarConfig } from './config.js';
import { assertMainnetSafety } from './guards.js';
import {
  parseHorizonError,
  retryWithBackoff,
  checkCircuitBreaker,
  recordSuccess,
  recordFailure,
  getCircuitBreakerState,
} from './error-handler.js';
import { metricsMiddleware, metricsHandler } from './metrics.js';
import { startPaymentStream, registerPaymentConfirmationListener, notifyApiOfPayment } from './payment-stream.js';

dotenv.config();

// Run startup validation
assertMainnetSafety();

const app = express();
const PORT = process.env.STELLAR_PORT || 3002;
const SHARED_SECRET = process.env.STELLAR_SERVICE_SECRET;

if (!SHARED_SECRET) {
  logger.error('STELLAR_SERVICE_SECRET required');
  process.exit(1);
}

// Middleware: Validate Shared Secret (ONLY for mutating endpoints)
const requireSecret = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = authHeader.substring(7); // Remove "Bearer "

  if (token !== SHARED_SECRET) {
    return res.status(401).json({ error: 'Invalid secret' });
  }

  return next();
};

// Middleware: Check circuit breaker
const checkCircuitBreakerMiddleware = (
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  if (!checkCircuitBreaker()) {
    return res.status(503).json({
      error: 'Stellar network unavailable',
      message: 'Circuit breaker is open due to repeated failures',
      retryable: true,
      suggestedAction: 'Retry after 30 seconds',
    });
  }
  return next();
};

app.use(express.json());
// Ensure requestId is available in AsyncLocalStorage for correlation
import { enterRequestContext } from './request-context.js';

app.use((req, _res, next) => {
  const incoming = (req.headers['x-request-id'] as string) ?? crypto.randomUUID();
  // set header so pino-http and downstream services see it
  req.headers['x-request-id'] = incoming;
  enterRequestContext(String(incoming));
  next();
});

app.use(
  pinoHttp({
    logger,
    genReqId: (req: any) => (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
    redact: ['req.headers.authorization'],
  })
);
app.use(metricsMiddleware);

// ✅ PUBLIC: GET /metrics — Prometheus metrics
app.get('/metrics', metricsHandler);

// ✅ PUBLIC: GET /network - Network status endpoint
app.get('/network', (_req, res) => {
  return res.json({
    network: stellarConfig.network,
    platformPublicKey: stellarConfig.platformPublicKey,
    mainnetMode: stellarConfig.network === 'mainnet',
    dryRun: stellarConfig.dryRun,
  });
});

// ✅ PUBLIC: GET /network-status - Detailed network status with failover info
app.get('/network-status', async (_req, res) => {
  try {
    const status = await getNetworkStatus();
    return res.json({ success: true, ...status });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PUBLIC: GET /health - Health check endpoint
app.get('/health', async (_req, res) => {
  const horizon = await checkHorizon();
  const status = horizon.status === 'healthy' ? 'ok' : 'degraded';
  const cbState = getCircuitBreakerState();

  return res.json({
    status,
    network: stellarConfig.network,
    horizonUrl: stellarConfig.horizonUrl,
    horizonStatus: horizon.status,
    horizonLatency: horizon.latency,
    circuitBreaker: cbState,
    timestamp: new Date().toISOString(),
  });
});

// ✅ PUBLIC: GET /monitor/status - Comprehensive network status with monitoring
app.get('/monitor/status', checkCircuitBreakerMiddleware, async (_req, res) => {
  try {
    const status = await getMonitoredNetworkStatus();
    recordSuccess();
    return res.json({ success: true, ...status });
  } catch (error: any) {
    recordFailure();
    logger.error({ error: error.message }, 'Failed to get monitored network status');
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PUBLIC: GET /monitor/ledger - Get ledger status only
app.get('/monitor/ledger', checkCircuitBreakerMiddleware, async (_req, res) => {
  try {
    const ledger = await getLedgerStatus();
    recordSuccess();
    return res.json({ success: true, ledger });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PUBLIC: GET /monitor/backlog - Get transaction backlog info
app.get('/monitor/backlog', checkCircuitBreakerMiddleware, async (_req, res) => {
  try {
    const backlog = await getTransactionBacklog();
    recordSuccess();
    return res.json({ success: true, backlog });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PUBLIC: GET /monitor/alerts - Get current network alerts
app.get('/monitor/alerts', checkCircuitBreakerMiddleware, async (_req, res) => {
  try {
    const alerts = await checkNetworkAlerts();
    recordSuccess();
    return res.json({ success: true, alerts, timestamp: new Date().toISOString() });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PUBLIC: GET /monitor/alerts/history - Get alert history
app.get('/monitor/alerts/history', (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const history = getAlertHistory(Math.min(limit, 100));
    recordSuccess();
    return res.json({ success: true, alerts: history, count: history.length });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: DELETE /monitor/alerts/history - Clear alert history
app.delete('/monitor/alerts/history', requireSecret, (req, res) => {
  try {
    clearAlertHistory();
    recordSuccess();
    return res.json({ success: true, message: 'Alert history cleared' });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PUBLIC: GET /monitor/ledger-growth - Get ledger growth rate
app.get('/monitor/ledger-growth', checkCircuitBreakerMiddleware, async (_req, res) => {
  try {
    const growth = await trackLedgerGrowth();
    recordSuccess();
    return res.json({ success: true, ...growth });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: POST /reconcile — Run payment reconciliation
app.post('/reconcile', requireSecret, checkCircuitBreakerMiddleware, async (req, res) => {
  try {
    const { expectedPayments, accountAddress, tolerance } = req.body;

    if (!expectedPayments || !Array.isArray(expectedPayments) || !accountAddress) {
      return res
        .status(400)
        .json({ error: 'expectedPayments array and accountAddress are required' });
    }

    const report = await runReconciliation(expectedPayments as PaymentRecord[], accountAddress, {
      tolerance,
    });
    recordSuccess();
    return res.json({ success: true, ...report });
  } catch (error: any) {
    recordFailure();
    logger.error({ error: error.message }, 'Reconciliation failed');
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: GET /reconcile/history — Get reconciliation history
app.get('/reconcile/history', requireSecret, (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || '20', 10);
    const history = getReconciliationHistory(Math.min(limit, 100));
    recordSuccess();
    return res.json({ success: true, reports: history, count: history.length });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: GET /reconcile/statistics — Get reconciliation statistics
app.get('/reconcile/statistics', requireSecret, (req, res) => {
  try {
    const stats = getReconciliationStatistics();
    recordSuccess();
    return res.json({ success: true, ...stats });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: POST /reconcile/resolution — Record a discrepancy resolution
app.post('/reconcile/resolution', requireSecret, (req, res) => {
  try {
    const { discrepancyId, action, notes } = req.body;

    if (!discrepancyId || !action) {
      return res.status(400).json({ error: 'discrepancyId and action are required' });
    }

    const validActions = ['mark_resolved', 'investigate', 'manual_review'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: `action must be one of: ${validActions.join(', ')}` });
    }

    const resolution = recordResolution({ discrepancyId, action, notes: notes || '' });
    recordSuccess();
    return res.json({ success: true, ...resolution });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: GET /reconcile/resolutions — Get resolution history
app.get('/reconcile/resolutions', requireSecret, (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || '100', 10);
    const history = getResolutionHistory(Math.min(limit, 500));
    recordSuccess();
    return res.json({ success: true, resolutions: history, count: history.length });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: DELETE /reconcile/history — Clear reconciliation history
app.delete('/reconcile/history', requireSecret, (req, res) => {
  try {
    clearReconciliationHistory();
    recordSuccess();
    return res.json({ success: true, message: 'Reconciliation history cleared' });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: POST /cold-wallet/keys — Store an encrypted keypair
app.post('/cold-wallet/keys', requireSecret, (req, res) => {
  try {
    const { keypair, encryptionPassword, metadata } = req.body;

    if (!keypair || !encryptionPassword) {
      return res.status(400).json({ error: 'keypair and encryptionPassword are required' });
    }

    // Create keypair from provided secret
    const kp = Keypair.fromSecret(keypair.secret || keypair);
    const store = storeKeyPair(kp, encryptionPassword, metadata);

    recordSuccess();
    return res.json({
      success: true,
      keyId: store.keyId,
      publicKey: store.publicKey,
      createdAt: store.createdAt,
    });
  } catch (error: any) {
    recordFailure();
    logger.error({ error: error.message }, 'Failed to store keypair');
    return res.status(400).json({ error: error.message });
  }
});

// ✅ PROTECTED: POST /cold-wallet/sign — Sign a transaction with a stored key
app.post('/cold-wallet/sign', requireSecret, (req, res) => {
  try {
    const { keyId, transactionXdr, requester } = req.body;

    if (!keyId || !transactionXdr || !requester) {
      return res.status(400).json({
        error: 'keyId, transactionXdr, and requester are required',
      });
    }

    const request: Omit<SigningRequest, 'requestId' | 'timestamp'> = {
      keyId,
      transactionXdr,
      requester,
      signatureRequired: true,
    };

    const response = signTransaction(request);
    recordSuccess();
    return res.json(response);
  } catch (error: any) {
    recordFailure();
    return res.status(400).json({ error: error.message });
  }
});

// ✅ PROTECTED: POST /cold-wallet/rotate — Rotate a key
app.post('/cold-wallet/rotate', requireSecret, (req, res) => {
  try {
    const { oldKeyId, encryptionPassword, reason, actor } = req.body;

    if (!oldKeyId || !encryptionPassword || !actor) {
      return res.status(400).json({
        error: 'oldKeyId, encryptionPassword, and actor are required',
      });
    }

    const { newKey, rotationEvent } = rotateKey(
      oldKeyId,
      encryptionPassword,
      reason || 'Scheduled rotation',
      actor
    );
    recordSuccess();

    return res.json({
      success: true,
      oldKeyId,
      newKeyId: newKey.keyId,
      publicKey: newKey.publicKey,
      rotationEvent,
    });
  } catch (error: any) {
    recordFailure();
    return res.status(400).json({ error: error.message });
  }
});

// ✅ PROTECTED: GET /cold-wallet/keys — List stored key IDs
app.get('/cold-wallet/keys', requireSecret, (req, res) => {
  try {
    const keyIds = getStoredKeyIds();
    const keysMetadata = keyIds.map((id) => getKeyMetadata(id)).filter(Boolean);

    recordSuccess();
    return res.json({ success: true, keys: keysMetadata, count: keysMetadata.length });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: GET /cold-wallet/keys/:keyId — Get key metadata
app.get('/cold-wallet/keys/:keyId', requireSecret, (req, res) => {
  try {
    const { keyId } = req.params;
    const metadata = getKeyMetadata(keyId);

    if (!metadata) {
      return res.status(404).json({ error: 'Key not found' });
    }

    recordSuccess();
    return res.json({ success: true, ...metadata });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: POST /cold-wallet/keys/:keyId/deactivate — Deactivate a key
app.post('/cold-wallet/keys/:keyId/deactivate', requireSecret, (req, res) => {
  try {
    const { keyId } = req.params;
    const { actor } = req.body;

    if (!actor) {
      return res.status(400).json({ error: 'actor is required' });
    }

    const success = deactivateKey(keyId, actor);

    if (!success) {
      return res.status(404).json({ error: 'Key not found' });
    }

    recordSuccess();
    return res.json({ success: true, message: 'Key deactivated' });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: GET /cold-wallet/audit-logs — Get audit logs
app.get('/cold-wallet/audit-logs', requireSecret, (req, res) => {
  try {
    const filter = {
      keyId: req.query.keyId as string,
      eventType: req.query.eventType as string,
      actor: req.query.actor as string,
      limit: parseInt((req.query.limit as string) || '100', 10),
    };

    const logs = getAuditLogs(filter);
    recordSuccess();
    return res.json({ success: true, logs, count: logs.length });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: GET /cold-wallet/rotations — Get key rotation history
app.get('/cold-wallet/rotations', requireSecret, (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const rotations = getRotationHistory(Math.min(limit, 200));

    recordSuccess();
    return res.json({ success: true, rotations, count: rotations.length });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: GET /cold-wallet/statistics — Get cold wallet statistics
app.get('/cold-wallet/statistics', requireSecret, (req, res) => {
  try {
    const stats = getColdWalletStatistics();
    recordSuccess();
    return res.json({ success: true, ...stats });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: POST /fund (requires secret, testnet only)
app.post('/fund', requireSecret, checkCircuitBreakerMiddleware, async (req, res) => {
  // Return 403 on mainnet - Friendbot is testnet-only
  if (stellarConfig.network === 'mainnet') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Friendbot funding is not available on mainnet',
    });
  }

  try {
    const { publicKey, amount } = req.body;
    const result = await retryWithBackoff(() => fundAccount(publicKey, amount), 3, 1000);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// ✅ PROTECTED: POST /intent (requires secret)
app.post('/intent', requireSecret, checkCircuitBreakerMiddleware, async (req, res) => {
  try {
    const { fromPublicKey, toPublicKey, amount } = req.body;
    const result = await retryWithBackoff(
      () => createIntent(fromPublicKey, toPublicKey, amount),
      3,
      1000
    );
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// ✅ PROTECTED: POST /refund (requires secret)
app.post('/refund', requireSecret, checkCircuitBreakerMiddleware, async (req, res) => {
  try {
    const { toPublicKey, amount, memo } = req.body;
    if (!toPublicKey || !amount) {
      return res.status(400).json({ error: 'toPublicKey and amount are required' });
    }
    const result = await retryWithBackoff(
      () => issueRefund(toPublicKey, amount, memo || 'refund'),
      3,
      1000
    );
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// ✅ PUBLIC: GET /fee-stats (no auth needed)
app.get('/fee-stats', checkCircuitBreakerMiddleware, async (_req, res) => {
  try {
    const stats = await retryWithBackoff(() => getFeeStats(), 3, 1000);
    recordSuccess();
    res.json({ success: true, ...stats });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    res.status(horizonError.statusCode).json(horizonError);
  }
});

// ✅ PUBLIC: POST /fees/calculate — Calculate transaction fees with surge pricing and subsidies
app.post('/fees/calculate', checkCircuitBreakerMiddleware, async (req, res) => {
  try {
    const {
      numberOfOperations = 1,
      baseFeeRate,
      pendingOperations = 0,
      subsidyLevel = 'NONE',
    } = req.body;

    const result = calculateCompleteFeatures({
      numberOfOperations,
      baseFeeRate,
      pendingOperations,
      subsidyLevel,
    });

    const formatted = {
      ...result,
      display: formatFeeForDisplay(result.totalFee),
    };

    recordSuccess();
    return res.json({ success: true, ...formatted });
  } catch (error: any) {
    recordFailure();
    logger.error({ error: error.message }, 'Fee calculation failed');
    return res.status(400).json({ error: error.message });
  }
});

// ✅ PUBLIC: GET /fees/surge-pricing — Get surge pricing tiers
app.get('/fees/surge-pricing', (_req, res) => {
  try {
    const tiers = getSurgePricingTiers();
    recordSuccess();
    return res.json({ success: true, tiers });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PUBLIC: GET /fees/subsidies — Get available subsidy tiers
app.get('/fees/subsidies', (_req, res) => {
  try {
    const tiers = getAvailableSubsidyTiers();
    recordSuccess();
    return res.json({ success: true, tiers });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PUBLIC: POST /fees/base — Calculate base fee only
app.post('/fees/base', (req, res) => {
  try {
    const { numberOfOperations = 1, baseFeeRate } = req.body;
    const baseFee = calculateBaseFee(numberOfOperations, baseFeeRate);
    const formatted = formatFeeForDisplay(baseFee);
    recordSuccess();
    return res.json({ success: true, ...formatted });
  } catch (error: any) {
    recordFailure();
    return res.status(400).json({ error: error.message });
  }
});

// ✅ PUBLIC: POST /fees/surge — Calculate surge-priced fee
app.post('/fees/surge', (req, res) => {
  try {
    const { baseFee, pendingOperations = 0 } = req.body;
    if (!baseFee) {
      return res.status(400).json({ error: 'baseFee is required' });
    }
    const surgedFee = calculateSurgedFee(baseFee, pendingOperations);
    const formatted = formatFeeForDisplay(surgedFee);
    recordSuccess();
    return res.json({ success: true, ...formatted });
  } catch (error: any) {
    recordFailure();
    return res.status(400).json({ error: error.message });
  }
});

// ✅ PUBLIC: POST /fees/subsidy — Calculate subsidized fee
app.post('/fees/subsidy', (req, res) => {
  try {
    const { baseFee, subsidyLevel = 'NONE' } = req.body;
    if (!baseFee) {
      return res.status(400).json({ error: 'baseFee is required' });
    }
    const result = calculateSubsidizedFee(baseFee, subsidyLevel);
    const formatted = formatFeeForDisplay(result.subsidizedFee);
    recordSuccess();
    return res.json({ success: true, ...result, display: formatted });
  } catch (error: any) {
    recordFailure();
    return res.status(400).json({ error: error.message });
  }
});

// ✅ PUBLIC: GET /verify/:hash (no auth needed)
app.get('/verify/:hash', checkCircuitBreakerMiddleware, async (req, res) => {
  try {
    const { hash } = req.params;
    const result = await retryWithBackoff(() => verifyIntent(hash), 3, 1000);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// ✅ PROTECTED: GET /balance/:publicKey (requires secret)
app.get('/balance/:publicKey', requireSecret, checkCircuitBreakerMiddleware, async (req, res) => {
  try {
    const { publicKey } = req.params;
    const result = await retryWithBackoff(() => getAccountBalance(publicKey), 3, 1000);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// ✅ PROTECTED: POST /trustline/usdc (requires secret)
app.post('/trustline/usdc', requireSecret, async (req, res) => {
  try {
    const { publicKey, usdcIssuer } = req.body;
    if (!publicKey || !usdcIssuer) {
      return res.status(400).json({ error: 'publicKey and usdcIssuer are required' });
    }
    const result = await createUsdcTrustline(publicKey, usdcIssuer);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: GET /paths (requires secret)
app.get('/paths', requireSecret, async (req, res) => {
  try {
    const {
      sourceAssetCode,
      sourceAssetIssuer,
      destinationAssetCode,
      destinationAssetIssuer,
      destinationAmount,
    } = req.query;

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
    return res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PUBLIC: GET /orderbook (no auth needed)
app.get('/orderbook', async (req, res) => {
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
    return res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: POST /claimable-balance — create escrow claimable balance for insurance pre-auth
app.post('/claimable-balance', requireSecret, checkCircuitBreakerMiddleware, async (req, res) => {
  try {
    const { fromPublicKey, amount, claimantPublicKey, claimableUntil } = req.body;
    if (!fromPublicKey || !amount || !claimantPublicKey || !claimableUntil) {
      return res
        .status(400)
        .json({ error: 'fromPublicKey, amount, claimantPublicKey, claimableUntil are required' });
    }

    const server = getHorizonServer();
    const platformKeypair = Keypair.fromSecret(stellarConfig.stellarSecretKey);
    const sourceAccount = await server.loadAccount(fromPublicKey);
    const fee = await server.fetchBaseFee();

    const claimableAfter = new Date(); // claimable immediately
    const claimableUntilDate = new Date(claimableUntil);

    const tx = buildCreateClaimableBalance({
      sourceAccount,
      amount,
      asset: Asset.native(),
      claimantPublicKey,
      claimableAfter,
      claimableUntil: claimableUntilDate,
      networkPassphrase: getNetworkPassphrase(),
      baseFee: String(fee),
    });

    tx.sign(platformKeypair);

    if (stellarConfig.dryRun) {
      const balanceId = `dry-run-balance-${Date.now()}`;
      return res.json({ success: true, balanceId, dryRun: true });
    }

    const result = await server.submitTransaction(tx);
    // Extract balance ID from the transaction result
    const balanceId = (result as any).id ?? `balance-${result.hash}`;
    recordSuccess();
    return res.json({ success: true, balanceId, txHash: result.hash });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// ✅ PROTECTED: POST /claimable-balance/:balanceId/claim — clinic claims the escrowed funds
app.post(
  '/claimable-balance/:balanceId/claim',
  requireSecret,
  checkCircuitBreakerMiddleware,
  async (req, res) => {
    try {
      const { balanceId } = req.params;
      const server = getHorizonServer();
      const platformKeypair = Keypair.fromSecret(stellarConfig.stellarSecretKey);
      const claimerAccount = await server.loadAccount(platformKeypair.publicKey());
      const fee = await server.fetchBaseFee();

      const tx = buildClaimClaimableBalance({
        claimerAccount,
        balanceId: decodeURIComponent(balanceId),
        networkPassphrase: getNetworkPassphrase(),
        baseFee: String(fee),
      });

      tx.sign(platformKeypair);

      if (stellarConfig.dryRun) {
        return res.json({ success: true, txHash: `dry-run-claim-${Date.now()}`, dryRun: true });
      }

      const result = await server.submitTransaction(tx);
      recordSuccess();
      return res.json({ success: true, txHash: result.hash });
    } catch (error: any) {
      recordFailure();
      const horizonError = parseHorizonError(error);
      return res.status(horizonError.statusCode).json(horizonError);
    }
  }
);

// ✅ PROTECTED: POST /claimable-balance/:balanceId/reclaim — patient reclaims after denial
app.post(
  '/claimable-balance/:balanceId/reclaim',
  requireSecret,
  checkCircuitBreakerMiddleware,
  async (req, res) => {
    try {
      const { balanceId } = req.params;
      const server = getHorizonServer();
      const platformKeypair = Keypair.fromSecret(stellarConfig.stellarSecretKey);
      const claimerAccount = await server.loadAccount(platformKeypair.publicKey());
      const fee = await server.fetchBaseFee();

      // Reclaim uses the same ClaimClaimableBalance operation but signed by the platform
      // acting on behalf of the patient (or the patient's key if available)
      const tx = buildClaimClaimableBalance({
        claimerAccount,
        balanceId: decodeURIComponent(balanceId),
        networkPassphrase: getNetworkPassphrase(),
        baseFee: String(fee),
      });

      tx.sign(platformKeypair);

      if (stellarConfig.dryRun) {
        return res.json({ success: true, txHash: `dry-run-reclaim-${Date.now()}`, dryRun: true });
      }

      const result = await server.submitTransaction(tx);
      recordSuccess();
      return res.json({ success: true, txHash: result.hash });
    } catch (error: any) {
      recordFailure();
      const horizonError = parseHorizonError(error);
      return res.status(horizonError.statusCode).json(horizonError);
    }
  }
);

// ✅ PROTECTED: POST /fee-bump — wrap inner XDR in a platform-sponsored fee bump tx
app.post('/fee-bump', requireSecret, async (req, res) => {
  try {
    const { innerXdr } = req.body;
    if (!innerXdr) {
      return res.status(400).json({ error: 'innerXdr is required' });
    }
    const result = await buildFeeBumpTransaction(innerXdr);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: POST /multi-sig/build — build a multi-sig payment transaction XDR
app.post('/multi-sig/build', requireSecret, checkCircuitBreakerMiddleware, async (req, res) => {
  try {
    const { fromPublicKey, toPublicKey, amount, signerPublicKeys } = req.body;
    if (!fromPublicKey || !toPublicKey || !amount || !Array.isArray(signerPublicKeys) || !signerPublicKeys.length) {
      return res.status(400).json({ error: 'fromPublicKey, toPublicKey, amount, and signerPublicKeys[] are required' });
    }
    const result = await retryWithBackoff(
      () => buildMultiSigTransaction({ fromPublicKey, toPublicKey, amount, signerPublicKeys }),
      3,
      1000
    );
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// ✅ PROTECTED: POST /multi-sig/add-signature — co-signer adds their signature to an XDR
app.post('/multi-sig/add-signature', requireSecret, async (req, res) => {
  try {
    const { xdr, signerSecret } = req.body;
    if (!xdr || !signerSecret) {
      return res.status(400).json({ error: 'xdr and signerSecret are required' });
    }
    const result = addCoSignerSignature(xdr, signerSecret);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

// ✅ PROTECTED: POST /multi-sig/submit — submit a fully-signed multi-sig transaction
app.post('/multi-sig/submit', requireSecret, checkCircuitBreakerMiddleware, async (req, res) => {
  try {
    const { xdr } = req.body;
    if (!xdr) {
      return res.status(400).json({ error: 'xdr is required' });
    }
    const result = await retryWithBackoff(() => submitMultiSigTransaction(xdr), 3, 1000);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// ✅ PROTECTED: POST /batch — submit a batch of payments in a single transaction
app.post('/batch', requireSecret, checkCircuitBreakerMiddleware, async (req, res) => {
  try {
    const { fromPublicKey, payments } = req.body;
    if (!fromPublicKey || !Array.isArray(payments) || !payments.length) {
      return res.status(400).json({ error: 'fromPublicKey and payments[] are required' });
    }
    if (payments.length > 100) {
      return res.status(400).json({ error: 'Batch size cannot exceed 100 payments' });
    }
    const result = await retryWithBackoff(
      () => processBatchPayments(fromPublicKey, payments),
      3,
      1000
    );
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// ✅ PROTECTED: GET /monitor/stream?publicKey=G... — SSE stream of account transactions
app.get('/monitor/stream', requireSecret, (req, res): any => {
  const { publicKey } = req.query;

  if (!publicKey || typeof publicKey !== 'string') {
    return res.status(400).json({ error: 'publicKey query parameter is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const close = streamAccountTransactions(
    publicKey,
    (tx) => {
      res.write(`data: ${JSON.stringify(tx)}\n\n`);
    },
    (err) => {
      res.write(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`);
    }
  );

  req.on('close', () => {
    close();
    logger.info({ publicKey }, 'SSE client disconnected, stream closed');
  });
});

// ✅ PUBLIC: GET /exchange-rates — Get current exchange rates
app.get('/exchange-rates', async (req, res) => {
  try {
    const { from = 'XLM', to = 'USD' } = req.query;

    if (typeof from !== 'string' || typeof to !== 'string') {
      return res.status(400).json({ error: 'from and to must be strings' });
    }

    const rate = await exchangeRateManager.getExchangeRate(from, to);
    recordSuccess();
    return res.json({ success: true, ...rate });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PUBLIC: POST /convert-currency — Convert amount between currencies
app.post('/convert-currency', async (req, res) => {
  try {
    const { amount, from = 'XLM', to = 'USD' } = req.body;

    if (!amount || typeof amount !== 'number') {
      return res.status(400).json({ error: 'amount is required and must be a number' });
    }

    const converted = await exchangeRateManager.convertCurrency(amount, from, to);
    recordSuccess();
    return res.json({ success: true, amount, from, to, converted });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PUBLIC: GET /exchange-rates/cache-stats — Get cache statistics
app.get('/exchange-rates/cache-stats', (_req, res) => {
  const stats = exchangeRateManager.getCacheStats();
  return res.json({ success: true, ...stats });
});

// ✅ PROTECTED: POST /exchange-rates/refresh — Manually refresh rates
app.post('/exchange-rates/refresh', requireSecret, async (req, res) => {
  try {
    await exchangeRateManager.refreshAllRates();
    recordSuccess();
    return res.json({ success: true, message: 'Exchange rates refreshed' });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PUBLIC: POST /safety-check — Perform mainnet safety checks
app.post('/safety-check', (req, res) => {
  try {
    const { amount = 0, requireConfirmation = true } = req.body;

    if (typeof amount !== 'number') {
      return res.status(400).json({ error: 'amount must be a number' });
    }

    const result = mainnetSafetyManager.performSafetyCheck(amount, requireConfirmation);

    return res.json({
      success: result.passed,
      ...result,
      network: mainnetSafetyManager.getNetwork(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PUBLIC: GET /payment-state-machine/validate — Validate state transition
app.get('/payment-state-machine/validate', (req, res) => {
  try {
    const { from, to } = req.query;

    if (typeof from !== 'string' || typeof to !== 'string') {
      return res.status(400).json({ error: 'from and to query parameters are required' });
    }

    const isValid = paymentStateMachine.isValidTransition(from as PaymentState, to as PaymentState);

    return res.json({
      success: true,
      from,
      to,
      isValid,
      validTransitions: [
        'PENDING->SUBMITTED',
        'SUBMITTED->CONFIRMED',
        'SUBMITTED->FAILED',
        'PENDING->FAILED',
        'FAILED->ROLLED_BACK',
        'SUBMITTED->ROLLED_BACK',
      ],
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: POST /escrow/create — Create escrow with refund capability
app.post('/escrow/create', requireSecret, checkCircuitBreakerMiddleware, async (req, res) => {
  try {
    const {
      fromPublicKey,
      claimantPublicKey,
      refundPublicKey,
      amount,
      claimableAfter,
      claimableUntil,
    } = req.body;

    if (!fromPublicKey || !claimantPublicKey || !refundPublicKey || !amount || !claimableUntil) {
      return res.status(400).json({
        error:
          'fromPublicKey, claimantPublicKey, refundPublicKey, amount, and claimableUntil are required',
      });
    }

    const server = getHorizonServer();
    const platformKeypair = Keypair.fromSecret(stellarConfig.stellarSecretKey);
    const sourceAccount = await server.loadAccount(fromPublicKey);
    const fee = await server.fetchBaseFee();

    const claimableAfterDate = claimableAfter ? new Date(claimableAfter) : new Date();
    const claimableUntilDate = new Date(claimableUntil);

    const tx = createEscrow({
      sourceAccount,
      amount,
      asset: Asset.native(),
      claimantPublicKey,
      refundPublicKey,
      claimableAfter: claimableAfterDate,
      claimableUntil: claimableUntilDate,
      networkPassphrase: getNetworkPassphrase(),
      baseFee: String(fee),
    });

    tx.sign(platformKeypair);

    if (stellarConfig.dryRun) {
      const balanceId = `dry-run-escrow-${Date.now()}`;
      return res.json({ success: true, balanceId, dryRun: true });
    }

    const result = await server.submitTransaction(tx);
    const balanceId = (result as any).id ?? `escrow-${result.hash}`;
    recordSuccess();
    return res.json({ success: true, balanceId, txHash: result.hash });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// ✅ PROTECTED: POST /escrow/:balanceId/claim — Claim escrow funds
app.post(
  '/escrow/:balanceId/claim',
  requireSecret,
  checkCircuitBreakerMiddleware,
  async (req, res) => {
    try {
      const { balanceId } = req.params;
      const { claimerPublicKey } = req.body;

      if (!claimerPublicKey) {
        return res.status(400).json({ error: 'claimerPublicKey is required' });
      }

      const server = getHorizonServer();
      const claimerKeypair = Keypair.fromPublicKey(claimerPublicKey);
      const claimerAccount = await server.loadAccount(claimerPublicKey);
      const fee = await server.fetchBaseFee();

      const tx = claimEscrow({
        claimerAccount,
        balanceId: decodeURIComponent(balanceId),
        networkPassphrase: getNetworkPassphrase(),
        baseFee: String(fee),
      });

      if (stellarConfig.stellarSecretKey) {
        const platformKeypair = Keypair.fromSecret(stellarConfig.stellarSecretKey);
        tx.sign(platformKeypair);
      }

      if (stellarConfig.dryRun) {
        return res.json({
          success: true,
          txHash: `dry-run-claim-escrow-${Date.now()}`,
          dryRun: true,
        });
      }

      const result = await server.submitTransaction(tx);
      recordSuccess();
      return res.json({ success: true, txHash: result.hash });
    } catch (error: any) {
      recordFailure();
      const horizonError = parseHorizonError(error);
      return res.status(horizonError.statusCode).json(horizonError);
    }
  }
);

// ✅ PROTECTED: POST /escrow/:balanceId/refund — Refund escrow after expiration
app.post(
  '/escrow/:balanceId/refund',
  requireSecret,
  checkCircuitBreakerMiddleware,
  async (req, res) => {
    try {
      const { balanceId } = req.params;
      const { refunderPublicKey } = req.body;

      if (!refunderPublicKey) {
        return res.status(400).json({ error: 'refunderPublicKey is required' });
      }

      const server = getHorizonServer();
      const refunderAccount = await server.loadAccount(refunderPublicKey);
      const fee = await server.fetchBaseFee();

      const tx = refundEscrow({
        refunderAccount,
        balanceId: decodeURIComponent(balanceId),
        networkPassphrase: getNetworkPassphrase(),
        baseFee: String(fee),
      });

      if (stellarConfig.stellarSecretKey) {
        const platformKeypair = Keypair.fromSecret(stellarConfig.stellarSecretKey);
        tx.sign(platformKeypair);
      }

      if (stellarConfig.dryRun) {
        return res.json({
          success: true,
          txHash: `dry-run-refund-escrow-${Date.now()}`,
          dryRun: true,
        });
      }

      const result = await server.submitTransaction(tx);
      recordSuccess();
      return res.json({ success: true, txHash: result.hash });
    } catch (error: any) {
      recordFailure();
      const horizonError = parseHorizonError(error);
      return res.status(horizonError.statusCode).json(horizonError);
    }
  }
);

// ✅ PUBLIC: GET /escrow/:balanceId — Get escrow balance details
app.get('/escrow/:balanceId', async (req, res) => {
  try {
    const { balanceId } = req.params;
    const server = getHorizonServer();
    const balance = await getClaimableBalanceById(server, decodeURIComponent(balanceId));

    if (!balance) {
      return res.status(404).json({ error: 'Escrow balance not found' });
    }

    recordSuccess();
    return res.json({ success: true, ...balance });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

const closePaymentStream = startPaymentStream((payment) => {
  logger.info({ memo: payment.memo, txHash: payment.txHash }, 'Stellar payment confirmed');
});

// Automatically notify the API whenever a matching payment is detected
registerPaymentConfirmationListener(notifyApiOfPayment);

const server: Server = app.listen(PORT, () => {
  logger.info(
    {
      port: PORT,
      network: stellarConfig.network,
      mainnetMode: stellarConfig.network === 'mainnet',
      secret: SHARED_SECRET ? 'SET' : 'MISSING',
    },
    'Stellar Service running'
  );
});

// Graceful shutdown handler
const shutdown = async (signal: string) => {
  logger.info(`${signal} received, starting graceful shutdown`);

  // Stop accepting new connections
  closePaymentStream();
  server.close(() => {
    logger.info('HTTP server closed');
    logger.info('Graceful shutdown completed');
    process.exit(0);
  });

  // Force exit after 30 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Graceful shutdown timeout (30s), forcing exit');
    process.exit(1);
  }, 30000);
};

// Handle termination signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err: unknown) => {
  logger.error({ err }, 'Uncaught exception');
  shutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown) => {
  logger.error({ reason }, 'Unhandled rejection');
  // Log but don't exit - let the process continue
});

export default server;
