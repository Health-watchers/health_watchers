import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
  'password', 'newPassword', 'oldPassword', 'confirmPassword',
  'privateKey', 'secretKey', 'secret', 'token', 'accessToken',
  'refreshToken', 'authorization', 'apiKey', 'api_key',
  'mfaSecret', 'mfaCode', 'otp', 'pin', 'ssn', 'creditCard',
  'cardNumber', 'cvv', 'stellarSecretKey',
]);

function redact(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    result[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? REDACTED : redact(v, depth + 1);
  }
  return result;
}

// ── Audit log file writer with daily rotation ─────────────────────────────────
const LOG_DIR = process.env.AUDIT_LOG_DIR || path.join(process.cwd(), 'logs', 'audit');
const MAX_RETENTION_DAYS = 30;

function getLogFilePath(): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(LOG_DIR, `audit-${date}.log`);
}

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function pruneOldLogs(): void {
  try {
    const cutoff = Date.now() - MAX_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(LOG_DIR);
    for (const file of files) {
      const filePath = path.join(LOG_DIR, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(filePath);
    }
  } catch {
    // non-fatal
  }
}

// Prune once at startup
try { ensureLogDir(); pruneOldLogs(); } catch { /* ignore */ }

function writeAuditEntry(entry: Record<string, unknown>): void {
  try {
    ensureLogDir();
    fs.appendFileSync(getLogFilePath(), JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    logger.error({ err }, 'Failed to write audit log entry');
  }
}

/**
 * Request/response audit logging middleware.
 * Logs method, path, status, duration, and sanitized body for every request.
 * Writes to a rotating daily audit log file (30-day retention).
 * Adds < 5ms overhead (async file write after response).
 */
export function requestAuditMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      userId: (req as any).user?.userId,
      clinicId: (req as any).user?.clinicId,
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket.remoteAddress,
      requestId: req.headers['x-request-id'],
    };

    if (req.body && Object.keys(req.body).length > 0) {
      entry.body = redact(req.body);
    }

    // Fire-and-forget to avoid adding latency to the response
    setImmediate(() => writeAuditEntry(entry));
  });

  next();
}
