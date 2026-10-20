/**
 * Unit tests for backup-metrics.service.ts
 */
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import fs from 'fs';
import os from 'os';
import path from 'path';
import { register } from 'prom-client';
import {
  loadBackupMetricsFromFile,
  initializeBackupMetrics,
  recordVerificationAttempt,
  recordVerificationSuccess,
  recordVerificationFailure,
  recordDownloadDuration,
  recordRestoreDuration,
  updateCollectionCounts,
  updateOrphanedRecords,
} from './backup-metrics.service';

async function gaugeValue(name: string): Promise<number | undefined> {
  const metric = register.getSingleMetric(name);
  if (!metric) return undefined;
  const value = await metric.get();
  return value.values[0]?.value;
}

function setGauge(name: string, value: number) {
  (register.getSingleMetric(name) as unknown as { set: (v: number) => void }).set(value);
}

function writeTempFile(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-metrics-'));
  const file = path.join(dir, 'metrics.txt');
  fs.writeFileSync(file, contents);
  return file;
}

describe('verification lifecycle metrics', () => {
  it('increments the attempts counter', async () => {
    recordVerificationAttempt();
    expect(await gaugeValue('backup_verification_attempts_total')).toBe(1);
  });

  it('records success: sets status=1 and a last-verified timestamp', async () => {
    recordVerificationSuccess(12.5);
    expect(await gaugeValue('backup_verification_successes_total')).toBe(1);
    expect(await gaugeValue('backup_verification_status')).toBe(1);
    expect(await gaugeValue('backup_last_verified_timestamp')).toEqual(expect.any(Number));
    expect(register.getSingleMetric('backup_verification_duration_seconds')).toBeTruthy();
  });

  it('records failure: sets status=0', async () => {
    recordVerificationFailure(4.2);
    expect(await gaugeValue('backup_verification_failures_total')).toBe(1);
    expect(await gaugeValue('backup_verification_status')).toBe(0);
  });

  it('records download and restore durations', async () => {
    recordDownloadDuration(3);
    recordRestoreDuration(20);
    expect(register.getSingleMetric('backup_download_duration_seconds')).toBeTruthy();
    expect(register.getSingleMetric('backup_restore_duration_seconds')).toBeTruthy();
  });

  it('updates collection and orphaned record gauges', async () => {
    updateCollectionCounts({ patients: 100, encounters: 250 });
    updateOrphanedRecords('patients', 3);

    const collection = await register.getSingleMetric('backup_collection_document_count')!.get();
    expect(
      collection.values.some((x) => x.labels.collection === 'patients' && x.value === 100)
    ).toBe(true);

    const orphan = await register.getSingleMetric('backup_orphaned_records')!.get();
    expect(orphan.values.some((x) => x.labels.collection === 'patients' && x.value === 3)).toBe(
      true
    );
  });
});

describe('loadBackupMetricsFromFile', () => {
  it('parses metric lines and sets the gauges', async () => {
    const file = writeTempFile(
      'backup_last_verified_timestamp 1700000000\n' +
        'backup_verification_status 1\n' +
        'backup_size_bytes 123456\n' +
        'backup_extracted_size_bytes 100000\n' +
        '\n' +
        '# comment line\n'
    );
    await loadBackupMetricsFromFile(file);
    expect(await gaugeValue('backup_last_verified_timestamp')).toBe(1700000000);
    expect(await gaugeValue('backup_verification_status')).toBe(1);
    expect(await gaugeValue('backup_size_bytes')).toBe(123456);
    expect(await gaugeValue('backup_extracted_size_bytes')).toBe(100000);
  });

  it('ignores missing files gracefully', async () => {
    await expect(
      loadBackupMetricsFromFile('/tmp/definitely-not-present-metrics.txt')
    ).resolves.toBeUndefined();
  });

  it('skips non-numeric values', async () => {
    const file = writeTempFile('backup_size_bytes not-a-number\n');
    await expect(loadBackupMetricsFromFile(file)).resolves.toBeUndefined();
  });

  it('log and swallow file read errors', async () => {
    // Reading a directory path raises EISDIR, which is caught and logged.
    await expect(loadBackupMetricsFromFile(os.tmpdir())).resolves.toBeUndefined();
  });
});

describe('initializeBackupMetrics', () => {
  it('loads from the configured BACKUP_METRICS_FILE', async () => {
    const file = writeTempFile('backup_verification_status 1\n');
    const prev = process.env.BACKUP_METRICS_FILE;
    process.env.BACKUP_METRICS_FILE = file;
    await initializeBackupMetrics();
    expect(await gaugeValue('backup_verification_status')).toBe(1);
    if (prev === undefined) delete process.env.BACKUP_METRICS_FILE;
    else process.env.BACKUP_METRICS_FILE = prev;
  });

  it('defaults to the /tmp path when the env var is unset', async () => {
    delete process.env.BACKUP_METRICS_FILE;
    await expect(initializeBackupMetrics()).resolves.toBeUndefined();
  });
});

describe('staleness & status helpers', () => {
  it('returns true when never verified', async () => {
    const { isBackupVerificationStale } = await import('./backup-metrics.service');
    setGauge('backup_last_verified_timestamp', 0);
    expect(isBackupVerificationStale()).toBe(true);
  });

  it('returns false when verified recently', async () => {
    const { isBackupVerificationStale } = await import('./backup-metrics.service');
    setGauge('backup_last_verified_timestamp', Math.floor(Date.now() / 1000));
    expect(isBackupVerificationStale()).toBe(false);
  });

  it('returns true when verification is older than the threshold', async () => {
    const { isBackupVerificationStale } = await import('./backup-metrics.service');
    const old = Math.floor(Date.now() / 1000) - 9 * 24 * 60 * 60;
    setGauge('backup_last_verified_timestamp', old);
    expect(isBackupVerificationStale()).toBe(true);
  });

  it('returns a structured status reflecting gauge state', () => {
    const { getBackupVerificationStatus } = require('./backup-metrics.service');
    const status = getBackupVerificationStatus();
    expect(status.lastVerified).toBeDefined();
    expect(['success', 'failure', 'unknown']).toContain(status.status);
    expect(typeof status.isStale).toBe('boolean');
  });
});
