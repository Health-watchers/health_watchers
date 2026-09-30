/**
 * JobRegistry — one distributed scheduler for every background job (#1433).
 *
 * Every job is a named BullMQ Job Scheduler on a single `scheduled-jobs` queue.
 * `upsertJobScheduler` is idempotent per scheduler id, and each iteration is
 * materialised as one job with a deterministic id, so N API/worker replicas
 * upserting the same schedule still produce exactly one job per tick. That job
 * is then locked by whichever worker picks it up first, which gives a single
 * execution per schedule across the whole fleet.
 *
 * Configuration (per job, `NAME` = job name upper-snake-cased):
 *   JOB_<NAME>_CRON=<pattern>    override the default cron pattern (UTC)
 *   JOB_<NAME>_ENABLED=false     disable the job (its scheduler is removed)
 *   JOBS_ENABLED=false           do not start the scheduler in this process
 *   JOBS_WORKER_CONCURRENCY=<n>  how many different jobs one process may run at once
 */
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import client from 'prom-client';
import logger from '@api/utils/logger';
import { register } from '@api/services/metrics.service';
import { markJobsActive, clearActiveJobs } from './job-state';

export const SCHEDULED_JOBS_QUEUE = 'scheduled-jobs';

export interface JobDefinition {
  /** Unique kebab-case name, e.g. `payment-expiration`. Also the scheduler id. */
  name: string;
  /** Default cron pattern (UTC). 6-field patterns include seconds. */
  cron: string;
  description: string;
  handler: () => Promise<unknown>;
}

export interface JobStatus {
  name: string;
  description: string;
  cron: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastFinishedAt: string | null;
  lastDurationMs: number | null;
  lastStatus: 'success' | 'failed' | null;
  lastError: string | null;
  failureCount: number;
  successCount: number;
  nextRunAt: string | null;
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export const scheduledJobDurationSeconds = new client.Histogram({
  name: 'scheduled_job_duration_seconds',
  help: 'Duration of scheduled background job runs',
  labelNames: ['job', 'status'] as const,
  buckets: [0.05, 0.1, 0.5, 1, 5, 15, 30, 60, 300, 900],
  registers: [register],
});

export const scheduledJobFailuresTotal = new client.Counter({
  name: 'scheduled_job_failures_total',
  help: 'Total failed scheduled background job runs',
  labelNames: ['job'] as const,
  registers: [register],
});

export const scheduledJobRunsTotal = new client.Counter({
  name: 'scheduled_job_runs_total',
  help: 'Total scheduled background job runs',
  labelNames: ['job', 'status'] as const,
  registers: [register],
});

export const scheduledJobLastSuccessTimestamp = new client.Gauge({
  name: 'scheduled_job_last_success_timestamp_seconds',
  help: 'Unix timestamp of the last successful run of each scheduled job',
  labelNames: ['job'] as const,
  registers: [register],
});

// ── Env helpers ───────────────────────────────────────────────────────────────

export function envKeyFor(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
}

function resolveCron(def: JobDefinition, env: NodeJS.ProcessEnv): string {
  return env[`JOB_${envKeyFor(def.name)}_CRON`]?.trim() || def.cron;
}

function resolveEnabled(def: JobDefinition, env: NodeJS.ProcessEnv): boolean {
  const raw = env[`JOB_${envKeyFor(def.name)}_ENABLED`];
  return raw === undefined ? true : !['false', '0', 'no', 'off'].includes(raw.toLowerCase());
}

const statsKey = (name: string): string => `hw:jobs:stats:${name}`;

/** Redis reads use maxRetriesPerRequest=null (BullMQ requirement) and would
 *  otherwise wait forever while Redis is down. */
function withTimeout<T>(promise: Promise<T>, ms = 2000): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`redis read timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ── Registry ──────────────────────────────────────────────────────────────────

export interface JobRegistryOptions {
  redisUrl?: string;
  queueName?: string;
  concurrency?: number;
  env?: NodeJS.ProcessEnv;
  /** Injected for tests. */
  connection?: IORedis;
}

export class JobRegistry {
  private readonly definitions = new Map<string, JobDefinition>();
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private connection: IORedis | null = null;
  private ownsConnection = false;
  private started = false;

  constructor(private readonly options: JobRegistryOptions = {}) {}

  private get env(): NodeJS.ProcessEnv {
    return this.options.env ?? process.env;
  }

  register(def: JobDefinition): this {
    if (this.definitions.has(def.name)) {
      throw new Error(`[job-registry] job "${def.name}" is already registered`);
    }
    this.definitions.set(def.name, def);
    return this;
  }

  has(name: string): boolean {
    return this.definitions.has(name);
  }

  names(): string[] {
    return [...this.definitions.keys()];
  }

  isRunning(name?: string): boolean {
    if (!this.started) return false;
    if (!name) return true;
    const def = this.definitions.get(name);
    return !!def && resolveEnabled(def, this.env);
  }

  /**
   * Upsert every enabled job's scheduler, remove schedulers for disabled
   * jobs, and start a worker that executes whichever job is due.
   */
  async start(): Promise<void> {
    if (this.started) return;
    const env = this.env;
    if (['false', '0', 'no', 'off'].includes((env.JOBS_ENABLED ?? '').toLowerCase())) {
      logger.info('[job-registry] JOBS_ENABLED=false — scheduler not started in this process');
      return;
    }

    const queueName = this.queueName;
    const { queue, connection } = this.handles();

    for (const def of this.definitions.values()) {
      if (!resolveEnabled(def, env)) {
        await queue.removeJobScheduler(def.name);
        logger.info({ job: def.name }, '[job-registry] job disabled via env — scheduler removed');
        continue;
      }
      const pattern = resolveCron(def, env);
      await queue.upsertJobScheduler(
        def.name,
        { pattern, tz: 'UTC' },
        {
          name: def.name,
          data: {},
          opts: { removeOnComplete: 100, removeOnFail: 500, attempts: 1 },
        }
      );
      logger.info({ job: def.name, pattern }, '[job-registry] job scheduled');
    }

    this.worker = new Worker(queueName, (job) => this.execute(job), {
      connection,
      concurrency: Number(env.JOBS_WORKER_CONCURRENCY ?? 5),
    });
    this.worker.on('error', (err) => logger.error({ err }, '[job-registry] worker error'));

    this.started = true;
    markJobsActive(this.names().filter((n) => this.isRunning(n)));
    logger.info({ jobs: this.definitions.size }, '[job-registry] scheduler started');
  }

  private get queueName(): string {
    return this.options.queueName ?? SCHEDULED_JOBS_QUEUE;
  }

  /** Lazily open the Redis connection + queue (also used read-only by list()). */
  private handles(): { queue: Queue; connection: IORedis } {
    if (!this.connection) {
      this.connection =
        this.options.connection ??
        new IORedis(this.options.redisUrl ?? this.env.REDIS_URL ?? 'redis://localhost:6379', {
          maxRetriesPerRequest: null,
        });
      this.ownsConnection = !this.options.connection;
      if (this.ownsConnection) {
        this.connection.on('error', (err) =>
          logger.warn({ err: err.message }, '[job-registry] redis connection error')
        );
      }
    }
    if (!this.queue) this.queue = new Queue(this.queueName, { connection: this.connection });
    return { queue: this.queue, connection: this.connection };
  }

  /** Stop consuming jobs in this process. Schedulers stay in Redis for the other replicas. */
  async stop(): Promise<void> {
    this.started = false;
    clearActiveJobs();
    await this.worker?.close();
    await this.queue?.close();
    if (this.ownsConnection) await this.connection?.quit();
    this.worker = null;
    this.queue = null;
    this.connection = null;
    logger.info('[job-registry] scheduler stopped');
  }

  /** Worker processor — runs the handler for `job.name` and records the outcome. */
  async execute(job: Pick<Job, 'name'>): Promise<void> {
    const def = this.definitions.get(job.name);
    if (!def) {
      logger.warn({ job: job.name }, '[job-registry] no handler registered — skipping');
      return;
    }

    const startedAt = new Date();
    const endTimer = scheduledJobDurationSeconds.startTimer({ job: def.name });
    await this.writeStats(def.name, { lastRunAt: startedAt.toISOString() });

    try {
      await def.handler();
      const durationMs = Date.now() - startedAt.getTime();
      endTimer({ status: 'success' });
      scheduledJobRunsTotal.inc({ job: def.name, status: 'success' });
      scheduledJobLastSuccessTimestamp.set({ job: def.name }, Date.now() / 1000);
      await this.writeStats(
        def.name,
        {
          lastFinishedAt: new Date().toISOString(),
          lastDurationMs: String(durationMs),
          lastStatus: 'success',
          lastSuccessAt: new Date().toISOString(),
          lastError: '',
        },
        'successCount'
      );
    } catch (err) {
      const durationMs = Date.now() - startedAt.getTime();
      endTimer({ status: 'failed' });
      scheduledJobRunsTotal.inc({ job: def.name, status: 'failed' });
      scheduledJobFailuresTotal.inc({ job: def.name });
      await this.writeStats(
        def.name,
        {
          lastFinishedAt: new Date().toISOString(),
          lastDurationMs: String(durationMs),
          lastStatus: 'failed',
          lastError: err instanceof Error ? err.message : String(err),
        },
        'failureCount'
      );
      logger.error({ err, job: def.name }, '[job-registry] job run failed');
      throw err;
    }
  }

  /** Last successful run of `name` on any replica, or null when unknown. */
  async lastSuccessAt(name: string): Promise<Date | null> {
    if (!this.connection) return null;
    try {
      const lastOk = await withTimeout(this.connection.hget(statsKey(name), 'lastSuccessAt'));
      return lastOk ? new Date(lastOk) : null;
    } catch {
      return null;
    }
  }

  /** Status of every registered job, shared across replicas via Redis. */
  async list(): Promise<JobStatus[]> {
    const env = this.env;
    const result: JobStatus[] = [];
    for (const def of this.definitions.values()) {
      const enabled = resolveEnabled(def, env);
      let stats: Record<string, string> = {};
      let next: number | undefined;
      try {
        const { queue, connection } = this.handles();
        stats = await withTimeout(connection.hgetall(statsKey(def.name)));
        if (enabled) next = (await withTimeout(queue.getJobScheduler(def.name)))?.next;
      } catch (err) {
        logger.warn({ err, job: def.name }, '[job-registry] failed to read job status');
      }
      result.push({
        name: def.name,
        description: def.description,
        cron: resolveCron(def, env),
        enabled,
        lastRunAt: stats.lastRunAt || null,
        lastFinishedAt: stats.lastFinishedAt || null,
        lastDurationMs: stats.lastDurationMs ? Number(stats.lastDurationMs) : null,
        lastStatus: (stats.lastStatus as JobStatus['lastStatus']) || null,
        lastError: stats.lastError || null,
        failureCount: Number(stats.failureCount ?? 0),
        successCount: Number(stats.successCount ?? 0),
        nextRunAt: next ? new Date(next).toISOString() : null,
      });
    }
    return result;
  }

  private async writeStats(
    name: string,
    fields: Record<string, string>,
    counter?: 'successCount' | 'failureCount'
  ): Promise<void> {
    if (!this.connection) return;
    try {
      const multi = this.connection.multi().hset(statsKey(name), fields);
      if (counter) multi.hincrby(statsKey(name), counter, 1);
      await multi.exec();
    } catch (err) {
      logger.warn({ err, job: name }, '[job-registry] failed to persist job stats');
    }
  }
}

export const jobRegistry = new JobRegistry();
