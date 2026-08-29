/**
 * Unit tests for batch-queue.ts — Issue #1072: Batch Processing Optimization
 *
 * Covers:
 *  - recordProgressCheckpoint and computeEta (sliding-window ETA)
 *  - cleanupJobCheckpoints
 *  - updateJobProgress with auto-ETA computation
 *  - getJobProgress
 *  - Queue stats (mocked BullMQ)
 */

// ── Environment stubs ────────────────────────────────────────────────────────
process.env.REDIS_URL = 'redis://localhost:6379';

// ── Logger mock ───────────────────────────────────────────────────────────────
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ── BullMQ + ioredis mocks ────────────────────────────────────────────────────
const mockJobId = 'job-test-123';

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: mockJobId }),
  getWaitingCount: jest.fn().mockResolvedValue(2),
  getActiveCount: jest.fn().mockResolvedValue(1),
  getCompletedCount: jest.fn().mockResolvedValue(10),
  getFailedCount: jest.fn().mockResolvedValue(0),
};

// bullmq is not installed in this workspace, so the mock must be virtual.
jest.mock(
  'bullmq',
  () => ({
    Queue: jest.fn().mockImplementation(() => mockQueue),
    Worker: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
    })),
    Job: jest.fn(),
  }),
  { virtual: true }
);

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  }))
);

// ── Import after mocks ────────────────────────────────────────────────────────
import {
  recordProgressCheckpoint,
  computeEta,
  cleanupJobCheckpoints,
  updateJobProgress,
  getJobProgress,
  getQueueStats,
  addExportJob,
} from '../batch-queue';

// ── Helpers ───────────────────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
});

// ── recordProgressCheckpoint & computeEta ─────────────────────────────────────
describe('ETA computation (sliding window)', () => {
  const jobId = 'eta-test-job';

  afterEach(() => cleanupJobCheckpoints(jobId));

  it('returns zero ETA when fewer than 2 checkpoints exist', () => {
    recordProgressCheckpoint(jobId, 100);
    const eta = computeEta(jobId, 100, 1000);
    expect(eta.estimatedTimeRemainingMs).toBe(0);
    expect(eta.throughputPerSecond).toBe(0);
  });

  it('returns zero ETA when total is 0', () => {
    recordProgressCheckpoint(jobId, 0);
    recordProgressCheckpoint(jobId, 100);
    const eta = computeEta(jobId, 100, 0);
    expect(eta.estimatedTimeRemainingMs).toBe(0);
    expect(eta.throughputPerSecond).toBe(0);
  });

  it('calculates a positive ETA from two checkpoints', () => {
    // Simulate processing 500 records over 1 second → throughput = 500 rec/s
    const now = Date.now();
    jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(now)
      .mockReturnValueOnce(now + 1000);

    recordProgressCheckpoint(jobId, 0);
    recordProgressCheckpoint(jobId, 500);

    const eta = computeEta(jobId, 500, 2000);
    // 1500 remaining at 500/s → 3 seconds = 3000 ms
    expect(eta.estimatedTimeRemainingMs).toBeGreaterThan(0);
    expect(eta.throughputPerSecond).toBeGreaterThan(0);

    jest.spyOn(Date, 'now').mockRestore();
  });

  it('keeps only the last MAX_CHECKPOINTS (10) entries', () => {
    for (let i = 0; i <= 15; i++) {
      recordProgressCheckpoint(jobId, i * 10);
    }
    // Should not throw and should still compute ETA
    const eta = computeEta(jobId, 150, 1000);
    expect(typeof eta.estimatedTimeRemainingMs).toBe('number');
  });

  it('returns zero ETA when no checkpoints registered for job', () => {
    const eta = computeEta('no-such-job', 0, 1000);
    expect(eta.estimatedTimeRemainingMs).toBe(0);
    expect(eta.throughputPerSecond).toBe(0);
  });
});

// ── cleanupJobCheckpoints ─────────────────────────────────────────────────────
describe('cleanupJobCheckpoints', () => {
  it('removes all checkpoints for a job', () => {
    const jobId = 'cleanup-test-job';
    recordProgressCheckpoint(jobId, 100);
    recordProgressCheckpoint(jobId, 200);
    cleanupJobCheckpoints(jobId);

    // After cleanup, ETA computation should return zeros
    const eta = computeEta(jobId, 200, 1000);
    expect(eta.estimatedTimeRemainingMs).toBe(0);
  });
});

// ── updateJobProgress ─────────────────────────────────────────────────────────
describe('updateJobProgress', () => {
  it('returns without error when jobId is not in progressMap', () => {
    expect(() => updateJobProgress('nonexistent', { processed: 100 })).not.toThrow();
  });

  it('merges partial progress update with existing state', async () => {
    const jobId = await addExportJob({
      type: 'patient',
      userId: 'user-1',
      clinicId: 'clinic-1',
      format: 'json',
    });

    updateJobProgress(jobId, { status: 'processing', total: 1000 });
    updateJobProgress(jobId, { processed: 200 });

    const progress = getJobProgress(jobId);
    expect(progress).toBeDefined();
    expect(progress!.status).toBe('processing');
    expect(progress!.total).toBe(1000);
    expect(progress!.processed).toBe(200);
  });

  it('auto-computes percentage when processed and total are set', async () => {
    const jobId = await addExportJob({
      type: 'clinic',
      userId: 'user-2',
      clinicId: 'clinic-2',
      format: 'csv',
    });

    updateJobProgress(jobId, { status: 'processing', total: 500 });
    updateJobProgress(jobId, { processed: 250 });

    const progress = getJobProgress(jobId);
    expect(progress!.percentage).toBe(50);
  });
});

// ── getJobProgress ────────────────────────────────────────────────────────────
describe('getJobProgress', () => {
  it('returns undefined for unknown job IDs', () => {
    expect(getJobProgress('unknown-job-id')).toBeUndefined();
  });

  it('returns queued status immediately after addExportJob', async () => {
    const jobId = await addExportJob({
      type: 'payment',
      userId: 'user-3',
      clinicId: 'clinic-3',
      format: 'json',
    });
    const progress = getJobProgress(jobId);
    expect(progress).toBeDefined();
    expect(progress!.status).toBe('queued');
    expect(progress!.percentage).toBe(0);
    expect(progress!.processed).toBe(0);
  });
});

// ── getQueueStats ─────────────────────────────────────────────────────────────
describe('getQueueStats', () => {
  it('returns waiting, active, completed, failed counts', async () => {
    const stats = await getQueueStats();
    expect(stats).toEqual({ waiting: 2, active: 1, completed: 10, failed: 0 });
  });
});

// ── Progress state lifecycle ──────────────────────────────────────────────────
describe('Progress lifecycle', () => {
  it('transitions from queued → processing → completed', async () => {
    const jobId = await addExportJob({
      type: 'report',
      userId: 'user-4',
      clinicId: 'clinic-4',
      format: 'pdf',
    });

    expect(getJobProgress(jobId)!.status).toBe('queued');

    updateJobProgress(jobId, { status: 'processing', total: 100 });
    expect(getJobProgress(jobId)!.status).toBe('processing');

    updateJobProgress(jobId, { status: 'completed', processed: 100 });
    expect(getJobProgress(jobId)!.status).toBe('completed');
  });

  it('captures error message on failed status', async () => {
    const jobId = await addExportJob({
      type: 'patient',
      userId: 'user-5',
      clinicId: 'clinic-5',
      format: 'json',
    });

    updateJobProgress(jobId, { status: 'failed', error: 'DB connection lost' });
    const progress = getJobProgress(jobId);
    expect(progress!.status).toBe('failed');
    expect(progress!.error).toBe('DB connection lost');
  });
});
