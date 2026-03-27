import { randomUUID } from 'crypto';
import express, { Request, Response } from 'express';
import pino from 'pino';

const CORRELATION_HEADER = 'x-request-id';
const PORT = process.env.STELLAR_SERVICE_PORT ?? 3002;

const baseLogger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

const app = express();
app.use(express.json());

// ── Correlation middleware ────────────────────────────────────────────────────
app.use((req: Request, res: Response, next) => {
  const id = (req.headers[CORRELATION_HEADER] as string | undefined) ?? randomUUID();
  (req as any).requestId = id;
  res.setHeader(CORRELATION_HEADER, id);
  // Attach a child logger so every log line in this request carries requestId
  (req as any).log = baseLogger.child({ requestId: id });
  next();
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req: Request, res: Response) => {
  (req as any).log.info('health check');
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  baseLogger.info(`stellar-service running on port ${PORT}`);
});
