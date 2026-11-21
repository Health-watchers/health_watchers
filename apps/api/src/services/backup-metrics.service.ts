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

export const backupJobLastSuccessTimestamp = new Gauge({
  name: 'backup_job_last_success_timestamp',
  help: 'Timestamp of last successful daily backup job (Unix epoch seconds)',
  registers: [register],
});

export const backupJobStatus = new Gauge({
  name: 'backup_job_status',
  help: 'Status of last daily backup job (1=success, 0=failure)',
  registers: [register],
});

export const backupJobLastRunTimestamp = new Gauge({
  name: 'backup_job_last_run_timestamp',
  help: 'Timestamp of last daily backup job run, success or failure (Unix epoch seconds)',
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
        case 'backup_job_last_success_timestamp':
          backupJobLastSuccessTimestamp.set(numValue);
          break;
        case 'backup_job_status':
          backupJobStatus.set(numValue);
          break;
        case 'backup_job_last_run_timestamp':
          backupJobLastRunTimestamp.set(numValue);
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
 * Record the outcome of a daily backup job run.
 * Updates the last-run timestamp unconditionally and, on success, the
 * last-success timestamp. The status gauge reflects the latest outcome so
 * Prometheus can alert when the daily backup job fails.
 */
export function recordBackupJobResult(success: boolean, runTimestamp?: number): void {
  const nowSeconds = runTimestamp ?? Math.floor(Date.now() / 1000);
  backupJobLastRunTimestamp.set(nowSeconds);
  backupJobStatus.set(success ? 1 : 0);
  if (success) {
    backupJobLastSuccessTimestamp.set(nowSeconds);
  }
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
 * Synchronously read an unlabeled gauge's current value.
 * prom-client's public get() is async, so we use the internal _getValue().
 */
function gaugeValue(metric: Gauge<string>): number {
  return (metric as unknown as { _getValue(labels: Record<string, string>): number })._getValue({});
}

/**
 * Check if backup verification is stale (hasn't run in 8 days)
 */
export function isBackupVerificationStale(thresholdDays: number = 8): boolean {
  const lastVerified = gaugeValue(backupLastVerifiedTimestamp);
  if (!lastVerified) {
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
  // prom-client's get() returns { value } for gauges, not a bare number
  const lastVerifiedValue = gaugeValue(backupLastVerifiedTimestamp);
  const statusValue = gaugeValue(backupVerificationStatus);

  if (!lastVerifiedValue) {
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
 * Check if the daily backup job is stale (no successful run within threshold).
 * Defaults to 26 hours so a single missed daily run triggers an alert.
 */
export function isBackupJobStale(thresholdHours: number = 26): boolean {
  const lastSuccess = gaugeValue(backupJobLastSuccessTimestamp);
  if (!lastSuccess) {
    return true; // Never succeeded
  }

  const hoursSinceSuccess = (Date.now() / 1000 - lastSuccess) / (60 * 60);
  return hoursSinceSuccess > thresholdHours;
}

/**
 * Get daily backup job status summary
 */
export function getBackupJobStatus(): {
  lastSuccess: Date | null;
  lastRun: Date | null;
  status: 'success' | 'failure' | 'unknown';
  isStale: boolean;
  hoursSinceSuccess: number | null;
} {
  const lastSuccessValue = gaugeValue(backupJobLastSuccessTimestamp);
  const lastRunValue = gaugeValue(backupJobLastRunTimestamp);
  const statusValue = gaugeValue(backupJobStatus);

  if (!lastRunValue) {
    return {
      lastSuccess: null,
      lastRun: null,
      status: 'unknown',
      isStale: true,
      hoursSinceSuccess: null,
    };
  }

  const lastSuccess = lastSuccessValue ? new Date(lastSuccessValue * 1000) : null;
  const lastRun = new Date(lastRunValue * 1000);
  const hoursSinceSuccess = lastSuccessValue
    ? (Date.now() / 1000 - lastSuccessValue) / (60 * 60)
    : null;

  return {
    lastSuccess,
    lastRun,
    status: statusValue === 1 ? 'success' : 'failure',
    isStale: hoursSinceSuccess === null || hoursSinceSuccess > 26,
    hoursSinceSuccess,
  };
}

/**
 * Initialize backup metrics from file on startup
 */
export async function initializeBackupMetrics(): Promise<void> {
  const metricsFile = process.env.BACKUP_METRICS_FILE || '/tmp/backup_verify_metrics.txt';
  await loadBackupMetricsFromFile(metricsFile);
}
