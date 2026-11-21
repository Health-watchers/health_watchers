import express from 'express';
import pinoHttp from 'pino-http';
import dotenv from 'dotenv';
import path from 'path';
import { stellarConfig } from './config.js';
import metricsRouter from './routes/metrics.js';
import monitorRouter from './routes/monitor.js';
import reconcileRouter from './routes/reconcile.js';
import coldWalletRouter from './routes/cold-wallet.js';
import paymentsRouter from './routes/payments.js';
import escrowRouter from './routes/escrow.js';

dotenv.config();

const app = express();
app.use(express.json());
app.use(pinoHttp());

// Mount routers
app.use('/metrics', metricsRouter);
app.use('/monitor', monitorRouter);
app.use('/reconcile', reconcileRouter);
app.use('/cold-wallet', coldWalletRouter);
app.use('/payments', paymentsRouter);
app.use('/escrow', escrowRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', network: stellarConfig.network });
});

export default app;
