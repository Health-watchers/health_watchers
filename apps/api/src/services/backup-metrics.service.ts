import { Counter, Gauge, Histogram, register } from 'prom-client';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

/**
 * Prometheus metrics for backup verification monitoring
 * Tracks backup verification status, timing, and data integrity
 */

// ── Gauges ────────────────────────────────────────────────────────────────────

export const backupLastVerifiedTimestamp = new Gauge({
  name: 'backup_last_verified_timestamp',
  help: 'Timestamp of last successful backup verification (Unix epoch seconds)',
  registers: [register],
});

export const backupVerificationStatus = new Gauge({
  name: 'backup_verification_status',
  help: 'Status of last backup verification (1=success, 0=failure)',
  registers: [register],
});

export const backupSizeBytes = new Gauge({
  name: 'backup_size_bytes',
  help: 'Size of encrypted backup in bytes',
  registers: [register],
});

export const backupExtractedSizeBytes = new Gauge({
  name: 'backup_extracted_size_bytes',
  help: 'Size of extracted backup in bytes',
  registers: [register],
});

export const backupCollectionDocumentCount = new Gauge({
  name: 'backup_collection_document_count',
  help: 'Number of documents in a collection after restore',
  labelNames: ['collection'],
  registers: [register],
});

export const backupOrphanedRecords = new Gauge({
  name: 'backup_orphaned_records',
  help: 'Number of orphaned records detected during verification',
  labelNames: ['collection'],
  registers: [register],
});

// ── Counters ──────────────────────────────────────────────────────────────────

export const backupVerificationAttempts = new Counter({
  name: 'backup_verification_attempts_total',
  help: 'Total number of backup verification attempts',
  registers: [register],
});

export const backupVerificationSuccesses = new Counter({
  name: 'backup_verification_successes_total',
  help: 'Total number of successful backup verifications',
  registers: [register],
});

export const backupVerificationFailures = new Counter({
  name: 'backup_verification_failures_total',
  help: 'Total number of failed backup verifications',
  registers: [register],
});

// ── Histograms ────────────────────────────────────────────────────────────────

export const backupVerificationDurationSeconds = new Histogram({
  name: 'backup_verification_duration_seconds',
  help: 'Duration of backup verification in seconds',
  buckets: [10, 30, 60, 120, 300, 600, 1200, 1800, 3600],
  registers: [register],
});

export const backupDownloadDurationSeconds = new Histogram({
  name: 'backup_download_duration_seconds',
  help: 'Duration of backup download from S3 in seconds',
  buckets: [5, 10, 30, 60, 120, 300],
  registers: [register],
});

export const backupRestoreDurationSeconds = new Histogram({
  name: 'backup_restore_duration_seconds',
  help: 'Duration of backup restore to temporary MongoDB in seconds',
  buckets: [10, 30, 60, 120, 300, 600],
  registers: [register],
});

// ── Metric update functions ───────────────────────────────────────────────────

/**
 * Load metrics from the backup verification script output file
 * Called periodically to sync metrics from CI/CD workflow
 */
export async function loadBackupMetricsFromFile(filePath: string): Promise<void> {
  try {
    if (!fs.existsSync(filePath)) {
      logger.debug({ filePath }, 'Backup metrics file not found');
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => !line.startsWith('#') && line.trim());

    for (const line of lines) {
      const [metricName, value] = line.split(/\s+/);
      const numValue = parseFloat(value);

      if (isNaN(numValue)) continue;

      switch (metricName) {
        case 'backup_last_verified_timestamp':
          backupLastVerifiedTimestamp.set(numValue);
          break;
        case 'backup_verification_status':
          backupVerificationStatus.set(numValue);
          break;
        case 'backup_size_bytes':
          backupSizeBytes.set(numValue);
          break;
        case 'backup_extracted_size_bytes':
          backupExtractedSizeBytes.set(numValue);
          break;
      }
    }

    logger.info({ filePath }, 'Backup metrics loaded from file');
  } catch (err) {
    logger.error({ err, filePath }, 'Failed to load backup metrics from file');
  }
}

/**
 * Record a backup verification attempt
 */
export function recordVerificationAttempt(): void {
  backupVerificationAttempts.inc();
}

/**
 * Record a successful backup verification
 */
export function recordVerificationSuccess(durationSeconds: number): void {
  backupVerificationSuccesses.inc();
  backupVerificationDurationSeconds.observe(durationSeconds);
  backupLastVerifiedTimestamp.set(Math.floor(Date.now() / 1000));
  backupVerificationStatus.set(1);
}

/**
 * Record a failed backup verification
 */
export function recordVerificationFailure(durationSeconds: number): void {
  backupVerificationFailures.inc();
  backupVerificationDurationSeconds.observe(durationSeconds);
  backupVerificationStatus.set(0);
}

/**
 * Record backup download duration
 */
export function recordDownloadDuration(durationSeconds: number): void {
  backupDownloadDurationSeconds.observe(durationSeconds);
}

/**
 * Record backup restore duration
 */
export function recordRestoreDuration(durationSeconds: number): void {
  backupRestoreDurationSeconds.observe(durationSeconds);
}

/**
 * Update collection document counts
 */
export function updateCollectionCounts(counts: Record<string, number>): void {
  for (const [collection, count] of Object.entries(counts)) {
    backupCollectionDocumentCount.set({ collection }, count);
  }
}

/**
 * Update orphaned records count
 */
export function updateOrphanedRecords(collection: string, count: number): void {
  backupOrphanedRecords.set({ collection }, count);
}

/**
 * Check if backup verification is stale (hasn't run in 8 days)
 */
export function isBackupVerificationStale(thresholdDays: number = 8): boolean {
  const lastVerified = backupLastVerifiedTimestamp.get();
  if (!lastVerified || typeof lastVerified !== 'number') {
    return true; // Never verified
  }

  const lastVerifiedDate = new Date(lastVerified * 1000);
  const now = new Date();
  const daysSinceVerification =
    (now.getTime() - lastVerifiedDate.getTime()) / (1000 * 60 * 60 * 24);

  return daysSinceVerification > thresholdDays;
}

/**
 * Get backup verification status summary
 */
export function getBackupVerificationStatus(): {
  lastVerified: Date | null;
  status: 'success' | 'failure' | 'unknown';
  isStale: boolean;
  daysSinceVerification: number | null;
} {
  const lastVerifiedValue = backupLastVerifiedTimestamp.get();
  const statusValue = backupVerificationStatus.get();

  if (!lastVerifiedValue || typeof lastVerifiedValue !== 'number') {
    return {
      lastVerified: null,
      status: 'unknown',
      isStale: true,
      daysSinceVerification: null,
    };
  }

  const lastVerified = new Date(lastVerifiedValue * 1000);
  const now = new Date();
  const daysSinceVerification = (now.getTime() - lastVerified.getTime()) / (1000 * 60 * 60 * 24);

  return {
    lastVerified,
    status: (statusValue as any) === 1 ? 'success' : 'failure',
    isStale: daysSinceVerification > 8,
    daysSinceVerification,
  };
}

/**
 * Initialize backup metrics from file on startup
 */
export async function initializeBackupMetrics(): Promise<void> {
  const metricsFile = process.env.BACKUP_METRICS_FILE || '/tmp/backup_verify_metrics.txt';
  await loadBackupMetricsFromFile(metricsFile);
}
