/**
 * Unit tests for the distributed JobRegistry (#1433).
 * BullMQ and Redis are replaced with in-memory fakes.
 */

const upsertJobScheduler = jest.fn().mockResolvedValue({});
const removeJobScheduler = jest.fn().mockResolvedValue(true);
const getJobScheduler = jest.fn();
const queueClose = jest.fn().mockResolvedValue(undefined);
const workerClose = jest.fn().mockResolvedValue(undefined);
let workerProcessor: ((job: { name: string }) => Promise<void>) | null = null;
let workerOpts: Record<string, unknown> | null = null;

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    upsertJobScheduler,
    removeJobScheduler,
    getJobScheduler,
    close: queueClose,
  })),
  Worker: jest.fn().mockImplementation((_name, processor, opts) => {
    workerProcessor = processor;
    workerOpts = opts;
    return { on: jest.fn(), close: workerClose };
  }),
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { register } from '@api/services/metrics.service';
import { JobRegistry, envKeyFor } from '../job-registry';
import { isJobActive } from '../job-state';
import { JOB_DEFINITIONS } from '../index';

/** Minimal in-memory stand-in for the ioredis calls the registry makes. */
function fakeRedis() {
  const hashes = new Map<string, Record<string, string>>();
  const api = {
    hashes,
    hgetall: jest.fn(async (key: string) => ({ ...(hashes.get(key) ?? {}) })),
    hget: jest.fn(async (key: string, field: string) => hashes.get(key)?.[field] ?? null),
    multi: jest.fn(() => {
      const ops: (() => void)[] = [];
      const chain = {
        hset: (key: string, fields: Record<string, string>) => {
          ops.push(() => hashes.set(key, { ...(hashes.get(key) ?? {}), ...fields }));
          return chain;
        },
        hincrby: (key: string, field: string, by: number) => {
          ops.push(() => {
            const h = hashes.get(key) ?? {};
            h[field] = String(Number(h[field] ?? 0) + by);
            hashes.set(key, h);
          });
          return chain;
        },
        exec: async () => ops.forEach((op) => op()),
      };
      return chain;
    }),
    quit: jest.fn(),
  };
  return api;
}

function makeRegistry(env: NodeJS.ProcessEnv = {}) {
  const redis = fakeRedis();
  const registry = new JobRegistry({ env, connection: redis as any });
  return { registry, redis };
}

beforeEach(() => {
  jest.clearAllMocks();
  workerProcessor = null;
  workerOpts = null;
});

describe('JobRegistry.start', () => {
  it('upserts one BullMQ job scheduler per enabled job with its default cron (UTC)', async () => {
    const { registry } = makeRegistry();
    registry.register({ name: 'alpha', cron: '*/5 * * * *', description: 'a', handler: jest.fn() });
    registry.register({ name: 'beta', cron: '0 * * * *', description: 'b', handler: jest.fn() });

    await registry.start();

    expect(upsertJobScheduler).toHaveBeenCalledTimes(2);
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'alpha',
      { pattern: '*/5 * * * *', tz: 'UTC' },
      expect.objectContaining({ name: 'alpha' })
    );
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'beta',
      { pattern: '0 * * * *', tz: 'UTC' },
      expect.objectContaining({ name: 'beta' })
    );
    expect(workerProcessor).not.toBeNull();
    await registry.stop();
  });

  it('uses JOB_<NAME>_CRON to override the schedule', async () => {
    const { registry } = makeRegistry({ JOB_XLM_RATE_CRON: '*/10 * * * *' });
    registry.register({ name: 'xlm-rate', cron: '*/5 * * * *', description: '', handler: jest.fn() });

    await registry.start();

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'xlm-rate',
      { pattern: '*/10 * * * *', tz: 'UTC' },
      expect.anything()
    );
    await registry.stop();
  });

  it('removes the scheduler of a job disabled with JOB_<NAME>_ENABLED=false', async () => {
    const { registry } = makeRegistry({ JOB_WEBHOOK_RETRY_ENABLED: 'false' });
    registry.register({ name: 'webhook-retry', cron: '* * * * *', description: '', handler: jest.fn() });
    registry.register({ name: 'other', cron: '* * * * *', description: '', handler: jest.fn() });

    await registry.start();

    expect(removeJobScheduler).toHaveBeenCalledWith('webhook-retry');
    expect(upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(upsertJobScheduler).toHaveBeenCalledWith('other', expect.anything(), expect.anything());
    expect(isJobActive('other')).toBe(true);
    expect(isJobActive('webhook-retry')).toBe(false);
    await registry.stop();
    expect(isJobActive('other')).toBe(false);
  });

  it('does not start at all when JOBS_ENABLED=false', async () => {
    const { registry } = makeRegistry({ JOBS_ENABLED: 'false' });
    registry.register({ name: 'alpha', cron: '* * * * *', description: '', handler: jest.fn() });

    await registry.start();

    expect(upsertJobScheduler).not.toHaveBeenCalled();
    expect(workerProcessor).toBeNull();
    expect(registry.isRunning()).toBe(false);
  });

  it('honours JOBS_WORKER_CONCURRENCY', async () => {
    const { registry } = makeRegistry({ JOBS_WORKER_CONCURRENCY: '2' });
    registry.register({ name: 'alpha', cron: '* * * * *', description: '', handler: jest.fn() });
    await registry.start();
    expect(workerOpts).toEqual(expect.objectContaining({ concurrency: 2 }));
    await registry.stop();
  });

  it('rejects duplicate job names', () => {
    const { registry } = makeRegistry();
    registry.register({ name: 'alpha', cron: '* * * * *', description: '', handler: jest.fn() });
    expect(() =>
      registry.register({ name: 'alpha', cron: '* * * * *', description: '', handler: jest.fn() })
    ).toThrow(/already registered/);
  });
});

describe('JobRegistry.execute', () => {
  it('runs the handler for the job name and records success stats + metrics', async () => {
    const { registry, redis } = makeRegistry();
    const handler = jest.fn().mockResolvedValue(3);
    registry.register({ name: 'metric-ok', cron: '* * * * *', description: '', handler });
    await registry.start();

    await workerProcessor!({ name: 'metric-ok' });

    expect(handler).toHaveBeenCalledTimes(1);
    const stats = redis.hashes.get('hw:jobs:stats:metric-ok')!;
    expect(stats.lastStatus).toBe('success');
    expect(stats.successCount).toBe('1');
    expect(stats.lastSuccessAt).toBeDefined();
    expect(await registry.lastSuccessAt('metric-ok')).toBeInstanceOf(Date);

    const metrics = await register.getMetricsAsJSON();
    const runs = metrics.find((m) => m.name === 'scheduled_job_runs_total') as any;
    expect(
      runs.values.find((v: any) => v.labels.job === 'metric-ok' && v.labels.status === 'success')
        .value
    ).toBe(1);
    const duration = metrics.find((m) => m.name === 'scheduled_job_duration_seconds') as any;
    expect(duration.values.some((v: any) => v.labels.job === 'metric-ok')).toBe(true);
    await registry.stop();
  });

  it('records failures, increments the failure metric, and rethrows so BullMQ marks the job failed', async () => {
    const { registry, redis } = makeRegistry();
    registry.register({
      name: 'metric-fail',
      cron: '* * * * *',
      description: '',
      handler: jest.fn().mockRejectedValue(new Error('boom')),
    });
    await registry.start();

    await expect(workerProcessor!({ name: 'metric-fail' })).rejects.toThrow('boom');

    const stats = redis.hashes.get('hw:jobs:stats:metric-fail')!;
    expect(stats.lastStatus).toBe('failed');
    expect(stats.lastError).toBe('boom');
    expect(stats.failureCount).toBe('1');

    const metrics = await register.getMetricsAsJSON();
    const failures = metrics.find((m) => m.name === 'scheduled_job_failures_total') as any;
    expect(failures.values.find((v: any) => v.labels.job === 'metric-fail').value).toBe(1);
    await registry.stop();
  });

  it('ignores jobs with no registered handler (e.g. removed in a newer deploy)', async () => {
    const { registry } = makeRegistry();
    await registry.start();
    await expect(registry.execute({ name: 'ghost' })).resolves.toBeUndefined();
    await registry.stop();
  });
});

describe('JobRegistry.list', () => {
  it('reports cron, enabled flag, last run, next run and failure counts', async () => {
    const { registry, redis } = makeRegistry({ JOB_BETA_ENABLED: 'false' });
    registry.register({ name: 'alpha', cron: '*/5 * * * *', description: 'Alpha', handler: jest.fn() });
    registry.register({ name: 'beta', cron: '0 * * * *', description: 'Beta', handler: jest.fn() });
    redis.hashes.set('hw:jobs:stats:alpha', {
      lastRunAt: '2026-09-29T10:00:00.000Z',
      lastFinishedAt: '2026-09-29T10:00:01.000Z',
      lastDurationMs: '1000',
      lastStatus: 'failed',
      lastError: 'nope',
      failureCount: '2',
      successCount: '5',
    });
    const next = Date.parse('2026-09-29T10:05:00.000Z');
    getJobScheduler.mockResolvedValue({ next });

    const jobs = await registry.list();

    expect(jobs).toEqual([
      {
        name: 'alpha',
        description: 'Alpha',
        cron: '*/5 * * * *',
        enabled: true,
        lastRunAt: '2026-09-29T10:00:00.000Z',
        lastFinishedAt: '2026-09-29T10:00:01.000Z',
        lastDurationMs: 1000,
        lastStatus: 'failed',
        lastError: 'nope',
        failureCount: 2,
        successCount: 5,
        nextRunAt: '2026-09-29T10:05:00.000Z',
      },
      expect.objectContaining({ name: 'beta', enabled: false, nextRunAt: null, failureCount: 0 }),
    ]);
  });
});

describe('JOB_DEFINITIONS', () => {
  it('registers every former setInterval job exactly once', () => {
    const names = JOB_DEFINITIONS.map((j) => j.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        'payment-expiration',
        'reconciliation',
        'risk-recalculation',
        'balance-monitoring',
        'waitlist-expiry',
        'appointment-reminder',
        'claimable-expiry-notification',
        'xlm-rate',
        'mfa-grace-period',
        'follow-up-reminder',
        'webhook-retry',
        'document-retention',
        'report-schedule',
        'api-key-lifecycle',
        'notification-dispatch',
        'immunization-compliance',
      ])
    );
  });

  it('keeps the intervals the jobs used to run at', () => {
    const cron = Object.fromEntries(JOB_DEFINITIONS.map((j) => [j.name, j.cron]));
    expect(cron['payment-expiration']).toBe('*/5 * * * *');
    expect(cron['waitlist-expiry']).toBe('*/15 * * * *');
    expect(cron['appointment-reminder']).toBe('*/15 * * * *');
    expect(cron['mfa-grace-period']).toBe('0 0 * * *');
    expect(cron['follow-up-reminder']).toBe('0 8 * * *');
    expect(cron['webhook-retry']).toBe('*/30 * * * * *');
    expect(cron['notification-dispatch']).toBe('*/30 * * * * *');
  });

  it('maps job names to env keys', () => {
    expect(envKeyFor('claimable-expiry-notification')).toBe('CLAIMABLE_EXPIRY_NOTIFICATION');
  });
});
