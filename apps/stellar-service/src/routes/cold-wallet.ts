import { Router } from 'express';
import { stellarConfig } from '../config.js';
import logger from '../logger.js';
import { recordSuccess, recordFailure } from '../metrics.js';
import {
  storeKeyPair,
  signTransaction,
  rotateKey,
  getStoredKeyIds,
  getKeyMetadata,
  deactivateKey,
  getAuditLogs,
  getRotationHistory,
  getColdWalletStatistics,
  type SigningRequest,
} from '../cold-wallet.js';

const router = Router();

// POST /cold-wallet/keys — Store a new encrypted keypair
router.post('/keys', async (req, res) => {
  try {
    const { publicKey, secretKey, encryptionPassword, actor } = req.body;
    if (!publicKey || !secretKey || !encryptionPassword || !actor) {
      return res.status(400).json({
        error: 'publicKey, secretKey, encryptionPassword, and actor are required',
      });
    }
    const store = storeKeyPair(publicKey, secretKey, encryptionPassword, actor);
    recordSuccess();
    return res.json({ success: true, ...store });
  } catch (error: any) {
    recordFailure();
    return res.status(400).json({ error: error.message });
  }
});

// GET /cold-wallet/keys — List stored key IDs and metadata
router.get('/keys', async (_req, res) => {
  try {
    const keysMetadata = getStoredKeyIds();
    recordSuccess();
    return res.json({ success: true, keys: keysMetadata, count: keysMetadata.length });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /cold-wallet/keys/:keyId — Get key metadata
router.get('/keys/:keyId', async (req, res) => {
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

// POST /cold-wallet/keys/:keyId/deactivate — Deactivate a key
router.post('/keys/:keyId/deactivate', async (req, res) => {
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
    return res.json({ success: true, keyId });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// POST /cold-wallet/sign — Sign a transaction
router.post('/sign', async (req, res) => {
  try {
    const request = req.body as SigningRequest;
    if (!request?.keyId || !request?.xdr || !request?.encryptionPassword) {
      return res.status(400).json({
        error: 'keyId, xdr, and encryptionPassword are required',
      });
    }
    const result = signTransaction(request);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    return res.status(400).json({ error: error.message });
  }
});

// POST /cold-wallet/rotate — Rotate a key
router.post('/rotate', async (req, res) => {
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

// GET /cold-wallet/audit-logs — Get audit logs
router.get('/audit-logs', async (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || '100', 10);
    const logs = getAuditLogs(limit);
    recordSuccess();
    return res.json({ success: true, logs, count: logs.length });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /cold-wallet/rotations — Get key rotation history
router.get('/rotations', async (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const history = getRotationHistory(limit);
    recordSuccess();
    return res.json({ success: true, rotations: history, count: history.length });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /cold-wallet/statistics — Get cold wallet statistics
router.get('/statistics', async (_req, res) => {
  try {
    const stats = getColdWalletStatistics();
    recordSuccess();
    return res.json({ success: true, ...stats });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

export default router;
