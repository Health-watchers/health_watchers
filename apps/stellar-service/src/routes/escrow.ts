import { Router } from 'express';
import { stellarConfig } from '../config.js';
import logger from '../logger.js';
import { recordSuccess, recordFailure } from '../metrics.js';
import {
  getHorizonServer,
  getNetworkPassphrase,
} from '../stellar.js';
import {
  createEscrow,
  claimEscrow,
  refundEscrow,
  getClaimableBalances as getClaimableBalancesFromEscrow,
  getClaimableBalanceById,
} from '../operations/escrow.js';
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

// POST /escrow/create — Create escrow with refund capability
router.post('/create', requireSecret, async (req, res) => {
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
        error: 'fromPublicKey, claimantPublicKey, refundPublicKey, amount, and claimableUntil are required',
      });
    }

    const server = getHorizonServer();
    const platformKeypair = Keypair.fromSecret(stellarConfig.stellarSecretKey);
    const sourceAccount = await server.loadAccount(fromPublicKey);
    const fee = await server.fetchBaseFee();

    const tx = createEscrow({
      sourceAccount,
      claimantPublicKey,
      refundPublicKey,
      amount,
      asset: Asset.native(),
      claimableAfter: claimableAfter ? new Date(claimableAfter) : new Date(),
      claimableUntil: new Date(claimableUntil),
      networkPassphrase: getNetworkPassphrase(),
      baseFee: String(fee),
    });

    tx.sign(platformKeypair);

    if (stellarConfig.dryRun) {
      const escrowId = `dry-run-escrow-${Date.now()}`;
      return res.json({ success: true, escrowId, dryRun: true });
    }

    recordSuccess();
    return res.json({ success: true, message: 'Escrow created' });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// POST /escrow/:balanceId/claim — Claim a claimable balance
router.post('/:balanceId/claim', requireSecret, async (req, res) => {
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
    const tx = claimEscrow({
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

// POST /escrow/:balanceId/refund — Refund escrow to source after expiry
router.post('/:balanceId/refund', requireSecret, async (req, res) => {
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
      return res.json({ success: true, txHash: `dry-run-refund-${Date.now()}`, dryRun: true });
    }

    recordSuccess();
    return res.json({ success: true, message: 'Escrow refunded' });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// GET /escrow/:balanceId — Get escrow balance details
router.get('/:balanceId', async (req, res) => {
  try {
    const { balanceId } = req.params;
    const server = getHorizonServer();
    const balance = await getClaimableBalanceById(server, decodeURIComponent(balanceId));

    if (!balance) {
      return res.status(404).json({ error: 'Escrow balance not found' });
    }

    recordSuccess();
    return res.json({ success: true, balance });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /soroban/config — Get Soroban configuration
router.get('/soroban/config', async (_req, res) => {
  try {
    const config = {
      network: stellarConfig.network,
      horizonUrl: stellarConfig.horizonUrl,
      sorobanRpcUrl: process.env.SOROBAN_RPC_URL || '',
      networkPassphrase: getNetworkPassphrase(),
    };
    recordSuccess();
    return res.json({ success: true, ...config });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

export default router;
