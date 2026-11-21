import { Router } from 'express';
import logger from '../logger.js';
import { recordSuccess, recordFailure } from '../metrics.js';
import {
  runReconciliation,
  getReconciliationHistory,
  getReconciliationStatistics,
  clearReconciliationHistory,
  type PaymentRecord,
} from '../payment-reconciliation.js';

const router = Router();

// POST /reconcile — Run payment reconciliation
router.post('/', async (req, res) => {
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

// GET /reconcile/history — Get reconciliation history
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const history = getReconciliationHistory(limit);
    recordSuccess();
    return res.json({ success: true, history, count: history.length });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /reconcile/stats — Get reconciliation statistics
router.get('/stats', async (_req, res) => {
  try {
    const stats = getReconciliationStatistics();
    recordSuccess();
    return res.json({ success: true, ...stats });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /reconcile/:id — Get a specific reconciliation result
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const record = getReconciliationHistory(1).find((r) => r.id === id);
    if (!record) {
      return res.status(404).json({ error: `Reconciliation record not found: ${id}` });
    }
    recordSuccess();
    return res.json({ success: true, ...record });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

export default router;
