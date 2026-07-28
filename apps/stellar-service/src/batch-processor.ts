/**
 * batch-processor.ts
 *
 * Issue #994 — [Stellar] Stellar Batch Payment Processing
 *
 * Implements efficient batch payment processing for Stellar:
 *   - Batch creation: group multiple payments into a single Stellar transaction
 *   - Queuing: accept payments and buffer them until a batch is ready
 *   - Transaction bundling: up to 100 operations per Stellar transaction
 *   - Monitoring: real-time batch statistics, queue depth, throughput
 */

import logger from './logger.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface BatchPaymentItem {
  /** Target account public key */
  toPublicKey: string;
  /** Amount as a decimal string (e.g. "10.5000000") */
  amount: string;
  /** Optional memo text */
  memo?: string;
}

export interface BatchJob {
  /** Unique job identifier */
  jobId: string;
  /** Source account public key */
  fromPublicKey: string;
  /** Payments included in this batch */
  payments: BatchPaymentItem[];
  /** ISO timestamp when this job was enqueued */
  enqueuedAt: Date;
  /** Current status */
  status: BatchJobStatus;
  /** Stellar transaction hash (once submitted) */
  transactionHash?: string;
  /** Total XLM across all payments */
  totalAmount?: string;
  /** Processing duration in milliseconds */
  durationMs?: number;
  /** Error message on failure */
  error?: string;
  /** ISO timestamp when processing started */
  startedAt?: Date;
  /** ISO timestamp when processing completed */
  completedAt?: Date;
}

export type BatchJobStatus =
  | 'queued'
  | 'processing'
  | 'submitted'
  | 'confirmed'
  | 'failed';

export interface BatchProcessorStats {
  /** Number of jobs currently in the queue */
  queueDepth: number;
  /** Total jobs processed since startup */
  totalProcessed: number;
  /** Total jobs that succeeded */
  totalSucceeded: number;
  /** Total jobs that failed */
  totalFailed: number;
  /** Total individual payments processed */
  totalPayments: number;
  /** Total XLM transferred across all succeeded batches */
  totalXlmTransferred: string;
  /** Average batch size (payments per batch) */
  averageBatchSize: number;
  /** Average processing time in milliseconds (succeeded batches only) */
  averageDurationMs: number;
  /** Whether the processor is currently accepting new jobs */
  accepting: boolean;
  /** Timestamp of last processed job */
  lastProcessedAt: Date | null;
}

export interface EnqueueResult {
  jobId: string;
  queuePosition: number;
  estimatedPayments: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Hard limit imposed by Stellar: max operations per transaction */
export const MAX_OPERATIONS_PER_TX = 100;

/** Default max batch size used when auto-flushing */
const DEFAULT_BATCH_SIZE = 50;

/** Auto-flush interval: flush the queue every 10 seconds if not full */
const AUTO_FLUSH_INTERVAL_MS = 10_000;

// ── BatchProcessor ─────────────────────────────────────────────────────────

/**
 * BatchProcessor manages a queue of payment jobs and submits them to the
 * Stellar network in batches for efficiency.
 *
 * Usage:
 *
 *   // Register the executor (provided by stellar.ts at startup)
 *   batchProcessor.setExecutor(processBatchPayments);
 *
 *   // Enqueue a batch
 *   const { jobId } = await batchProcessor.enqueue('GPUBKEY...', [
 *     { toPublicKey: 'GDEST...', amount: '10.0' },
 *   ]);
 *
 *   // Monitor
 *   const stats = batchProcessor.getStats();
 */
export class BatchProcessor {
  private readonly queue: BatchJob[] = [];
  private readonly completedJobs: Map<string, BatchJob> = new Map();

  private executor: ((fromPublicKey: string, payments: BatchPaymentItem[]) => Promise<{ hash: string; count: number; totalAmount: string; durationMs: number }>) | null = null;

  private isProcessing = false;
  private accepting = true;
  private autoFlushHandle: ReturnType<typeof setInterval> | null = null;

  // Monitoring counters
  private totalProcessed = 0;
  private totalSucceeded = 0;
  private totalFailed = 0;
  private totalPaymentsProcessed = 0;
  private totalXlmTransferred = 0;
  private totalDurationMs = 0;
  private lastProcessedAt: Date | null = null;

  // ── Executor registration ──────────────────────────────────────────────

  /**
   * Register the function that actually submits a batch to Stellar.
   * Must be called before the processor can execute any jobs.
   */
  setExecutor(
    fn: (
      fromPublicKey: string,
      payments: BatchPaymentItem[]
    ) => Promise<{ hash: string; count: number; totalAmount: string; durationMs: number }>
  ): void {
    this.executor = fn;
    logger.info('BatchProcessor executor registered');
  }

  // ── Queue management ───────────────────────────────────────────────────

  /**
   * Add a batch job to the processing queue.
   *
   * @param fromPublicKey  Source account for all payments in this batch
   * @param payments       1–100 payment instructions
   * @returns  Job ID and queue position
   */
  async enqueue(fromPublicKey: string, payments: BatchPaymentItem[]): Promise<EnqueueResult> {
    if (!this.accepting) {
      throw new Error('BatchProcessor is not accepting new jobs');
    }
    if (!fromPublicKey) {
      throw new Error('fromPublicKey is required');
    }
    if (!payments.length) {
      throw new Error('At least one payment is required');
    }
    if (payments.length > MAX_OPERATIONS_PER_TX) {
      throw new Error(`Batch size cannot exceed ${MAX_OPERATIONS_PER_TX} payments`);
    }

    for (const p of payments) {
      if (!p.toPublicKey) {
        throw new Error('Each payment must have a toPublicKey');
      }
      const amount = parseFloat(p.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(`Invalid payment amount: ${p.amount}`);
      }
    }

    const jobId = this.generateJobId();
    const job: BatchJob = {
      jobId,
      fromPublicKey,
      payments,
      enqueuedAt: new Date(),
      status: 'queued',
    };

    this.queue.push(job);

    const queuePosition = this.queue.length;
    logger.info(
      { jobId, fromPublicKey, paymentCount: payments.length, queuePosition },
      'Batch job enqueued'
    );

    return { jobId, queuePosition, estimatedPayments: payments.length };
  }

  /**
   * Flush up to `batchSize` queued jobs immediately.
   * Jobs from the same source account are bundled into a single Stellar tx
   * (up to MAX_OPERATIONS_PER_TX operations).
   */
  async flush(batchSize: number = DEFAULT_BATCH_SIZE): Promise<void> {
    if (this.isProcessing) {
      logger.debug('BatchProcessor is already flushing — skipping');
      return;
    }
    if (!this.queue.length) {
      return;
    }
    if (!this.executor) {
      logger.warn('BatchProcessor has no executor — cannot flush');
      return;
    }

    this.isProcessing = true;

    try {
      // Group queued jobs by source account
      const groups = this.groupBySource(this.queue.splice(0, batchSize));

      for (const [fromPublicKey, jobs] of groups.entries()) {
        await this.processGroup(fromPublicKey, jobs);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Start a background timer that auto-flushes the queue on a regular interval.
   */
  startAutoFlush(intervalMs: number = AUTO_FLUSH_INTERVAL_MS, batchSize: number = DEFAULT_BATCH_SIZE): void {
    if (this.autoFlushHandle !== null) {
      logger.warn('BatchProcessor auto-flush is already running');
      return;
    }

    this.autoFlushHandle = setInterval(() => {
      this.flush(batchSize).catch((err) => {
        logger.error({ error: (err as Error).message }, 'BatchProcessor auto-flush error');
      });
    }, intervalMs);

    if (typeof this.autoFlushHandle === 'object' && 'unref' in this.autoFlushHandle) {
      (this.autoFlushHandle as NodeJS.Timeout).unref();
    }

    logger.info({ intervalMs, batchSize }, 'BatchProcessor auto-flush started');
  }

  /** Stop the background auto-flush timer. */
  stopAutoFlush(): void {
    if (this.autoFlushHandle !== null) {
      clearInterval(this.autoFlushHandle);
      this.autoFlushHandle = null;
      logger.info('BatchProcessor auto-flush stopped');
    }
  }

  /** Pause acceptance of new jobs. Existing queue is unaffected. */
  pause(): void {
    this.accepting = false;
    logger.info('BatchProcessor paused — no new jobs accepted');
  }

  /** Resume acceptance of new jobs. */
  resume(): void {
    this.accepting = true;
    logger.info('BatchProcessor resumed');
  }

  // ── Job status ─────────────────────────────────────────────────────────

  /**
   * Look up a job by ID. Returns the job regardless of whether it is
   * still queued or already completed.
   */
  getJob(jobId: string): BatchJob | undefined {
    const queued = this.queue.find((j) => j.jobId === jobId);
    return queued ?? this.completedJobs.get(jobId);
  }

  /** Return a snapshot of all queued jobs (not yet processing). */
  getQueueSnapshot(): BatchJob[] {
    return this.queue.map((j) => ({ ...j }));
  }

  /** Return recent completed jobs (up to `limit`). */
  getCompletedJobs(limit = 50): BatchJob[] {
    const all = Array.from(this.completedJobs.values());
    return all.slice(Math.max(0, all.length - limit));
  }

  // ── Monitoring ─────────────────────────────────────────────────────────

  /**
   * Return a comprehensive snapshot of batch processor health and throughput.
   */
  getStats(): BatchProcessorStats {
    const averageBatchSize =
      this.totalSucceeded > 0 ? this.totalPaymentsProcessed / this.totalSucceeded : 0;

    const averageDurationMs =
      this.totalSucceeded > 0 ? this.totalDurationMs / this.totalSucceeded : 0;

    return {
      queueDepth: this.queue.length,
      totalProcessed: this.totalProcessed,
      totalSucceeded: this.totalSucceeded,
      totalFailed: this.totalFailed,
      totalPayments: this.totalPaymentsProcessed,
      totalXlmTransferred: this.totalXlmTransferred.toFixed(7),
      averageBatchSize: parseFloat(averageBatchSize.toFixed(2)),
      averageDurationMs: parseFloat(averageDurationMs.toFixed(2)),
      accepting: this.accepting,
      lastProcessedAt: this.lastProcessedAt,
    };
  }

  /**
   * Reset all monitoring counters (does not clear the queue).
   */
  resetStats(): void {
    this.totalProcessed = 0;
    this.totalSucceeded = 0;
    this.totalFailed = 0;
    this.totalPaymentsProcessed = 0;
    this.totalXlmTransferred = 0;
    this.totalDurationMs = 0;
    this.lastProcessedAt = null;
    logger.info('BatchProcessor stats reset');
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Group a list of jobs by their source account.
   */
  private groupBySource(jobs: BatchJob[]): Map<string, BatchJob[]> {
    const groups = new Map<string, BatchJob[]>();
    for (const job of jobs) {
      const existing = groups.get(job.fromPublicKey) ?? [];
      existing.push(job);
      groups.set(job.fromPublicKey, existing);
    }
    return groups;
  }

  /**
   * Bundle jobs from the same source into Stellar transactions
   * (max MAX_OPERATIONS_PER_TX operations each).
   */
  private async processGroup(fromPublicKey: string, jobs: BatchJob[]): Promise<void> {
    // Mark all jobs as processing
    for (const job of jobs) {
      job.status = 'processing';
      job.startedAt = new Date();
    }

    // Flatten all payments and chunk into bundles of MAX_OPERATIONS_PER_TX
    const allPayments: Array<{ payment: BatchPaymentItem; job: BatchJob }> = [];
    for (const job of jobs) {
      for (const payment of job.payments) {
        allPayments.push({ payment, job });
      }
    }

    const bundles = this.chunkArray(allPayments, MAX_OPERATIONS_PER_TX);

    for (const bundle of bundles) {
      const payments = bundle.map((b) => b.payment);
      const bundleJobs = [...new Set(bundle.map((b) => b.job))];

      try {
        const result = await this.executor!(fromPublicKey, payments);

        const now = new Date();
        for (const job of bundleJobs) {
          job.status = 'submitted';
          job.transactionHash = result.hash;
          job.totalAmount = result.totalAmount;
          job.durationMs = result.durationMs;
          job.completedAt = now;
          this.archiveJob(job);
        }

        // Update monitoring counters
        this.totalSucceeded += bundleJobs.length;
        this.totalPaymentsProcessed += payments.length;
        this.totalXlmTransferred += parseFloat(result.totalAmount);
        this.totalDurationMs += result.durationMs;

        logger.info(
          {
            fromPublicKey,
            jobCount: bundleJobs.length,
            paymentCount: payments.length,
            hash: result.hash,
            totalAmount: result.totalAmount,
            durationMs: result.durationMs,
          },
          'Bundle submitted successfully'
        );
      } catch (error) {
        const errMsg = (error as Error).message;
        const now = new Date();

        for (const job of bundleJobs) {
          job.status = 'failed';
          job.error = errMsg;
          job.completedAt = now;
          this.archiveJob(job);
        }

        this.totalFailed += bundleJobs.length;

        logger.error(
          { fromPublicKey, jobCount: bundleJobs.length, paymentCount: payments.length, error: errMsg },
          'Bundle submission failed'
        );
      } finally {
        this.totalProcessed += bundleJobs.length;
        this.lastProcessedAt = new Date();
      }
    }
  }

  /** Move a completed job from the queue to the completed archive. */
  private archiveJob(job: BatchJob): void {
    this.completedJobs.set(job.jobId, job);
    // Keep the completed map from growing unbounded (cap at 1000 entries)
    if (this.completedJobs.size > 1000) {
      const oldest = this.completedJobs.keys().next().value;
      if (oldest) this.completedJobs.delete(oldest);
    }
  }

  private generateJobId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}

// ── Singleton export ───────────────────────────────────────────────────────

export const batchProcessor = new BatchProcessor();
