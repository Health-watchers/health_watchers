import { Router } from 'express';
import logger from '../logger.js';
import { recordSuccess, recordFailure } from '../metrics.js';
import {
  getTransactionBacklog,
  checkNetworkAlerts,
  getAlertHistory,
  trackLedgerGrowth,
} from '../network-monitor.js';

const router = Router();

// GET /monitor/backlog — Get transaction backlog info
router.get('/backlog', async (_req, res) => {
  try {
    const backlog = await getTransactionBacklog();
    recordSuccess();
    return res.json({ success: true, backlog });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /monitor/alerts — Get current network alerts
router.get('/alerts', async (_req, res) => {
  try {
    const alerts = await checkNetworkAlerts();
    recordSuccess();
    return res.json({ success: true, alerts, timestamp: new Date().toISOString() });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /monitor/alerts/history — Get alert history
router.get('/alerts/history', async (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const history = getAlertHistory(limit);
    recordSuccess();
    return res.json({ success: true, history, count: history.length });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

// GET /monitor/ledger-growth — Track ledger growth over time
router.get('/ledger-growth', async (_req, res) => {
  try {
    const growth = await trackLedgerGrowth();
    recordSuccess();
    return res.json({ success: true, ...growth });
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

export default router;
