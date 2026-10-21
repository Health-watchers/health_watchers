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
import { retryWithBackoff } from './error-handler.js';
import { recordBatchMetrics } from './metrics.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface BatchPaymentItem {
  /** Target account public key */
  toPublicKey: string;
  /** Amount as a decimal string (e.g. "10.5000000") */
  amount: string;
  /** Optional memo text */
  memo?: string;
}

export interface PaymentResult {
  /** Index of the payment within the original batch */
  index: number;
  /** Target account public key */
  toPublicKey: string;
  /** Amount as a decimal string */
  amount: string;
  /** Whether this individual payment succeeded */
  success: boolean;
  /** Error code on failure (e.g. "TX_FAILED", "CANCELLED") */
  errorCode?: string;
  /** Error message on failure */
  error?: string;
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
  /** Set when the job has been cancelled before submission */
  cancelled?: boolean;
  /** Per-payment outcome (partial success reporting) */
  results?: PaymentResult[];
  /** Number of payments that succeeded */
  succeededCount?: number;
  /** Number of payments that failed */
  failedCount?: number;
}

export type BatchJobStatus =
  | 'queued'
  | 'processing'
  | 'submitted'
  | 'confirmed'
  | 'failed'
  | 'cancelled';

export interface BatchPartialSuccessSummary {
  jobId: string;
  status: BatchJobStatus;
  transactionHash?: string;
  totalPayments: number;
  succeeded: PaymentResult[];
  failed: PaymentResult[];
  error?: string;
}

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
  /** Total individual payments that succeeded */
  totalPaymentsSucceeded: number;
  /** Total individual payments that failed */
  totalPaymentsFailed: number;
  /** Failure rate (failed payments / total payments) as a 0–1 ratio */
  failureRate: number;
  /** Throughput in payments per second since first processed job */
  throughputPerSecond: number;
  /** Number of jobs cancelled before submission */
  totalCancelled: number;
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

/** Default number of retry attempts for a failed bundle submission */
const DEFAULT_MAX_RETRIES = 3;

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

  private executor:
    | ((
        fromPublicKey: string,
        payments: BatchPaymentItem[]
      ) => Promise<{ hash: string; count: number; totalAmount: string; durationMs: number }>)
    | null = null;

  private isProcessing = false;
  private accepting = true;
  private autoFlushHandle: ReturnType<typeof setInterval> | null = null;
  private maxRetries = DEFAULT_MAX_RETRIES;

  /** Jobs cancelled while queued or in-flight (checked before submission) */
  private readonly cancelledJobIds: Set<string> = new Set();

  // Monitoring counters
  private totalProcessed = 0;
  private totalSucceeded = 0;
  private totalFailed = 0;
  private totalCancelled = 0;
  private totalPaymentsProcessed = 0;
  private totalPaymentsSucceeded = 0;
  private totalPaymentsFailed = 0;
  private totalXlmTransferred = 0;
  private totalDurationMs = 0;
  private lastProcessedAt: Date | null = null;
  private firstProcessedAt: Date | null = null;

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

  /**
   * Configure the maximum number of retry attempts for failed bundle
   * submissions (exponential backoff). Defaults to 3.
   */
  setMaxRetries(maxRetries: number): void {
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new Error('maxRetries must be a non-negative integer');
    }
    this.maxRetries = maxRetries;
    logger.info({ maxRetries }, 'BatchProcessor max retries updated');
  }

  /** Return the configured maximum retry count. */
  getMaxRetries(): number {
    return this.maxRetries;
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
  startAutoFlush(
    intervalMs: number = AUTO_FLUSH_INTERVAL_MS,
    batchSize: number = DEFAULT_BATCH_SIZE
  ): void {
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

  /**
   * Cancel a batch job before it is submitted.
   *
   * - Queued jobs are removed from the queue and marked `cancelled`.
   * - In-flight jobs are flagged; the processor checks the flag before
   *   submitting and rejects the job if it has been cancelled.
   *
   * @returns true if the job was found and cancelled, false otherwise.
   */
  cancel(jobId: string): boolean {
    const queuedIndex = this.queue.findIndex((j) => j.jobId === jobId);
    if (queuedIndex !== -1) {
      const [job] = this.queue.splice(queuedIndex, 1);
      job.status = 'cancelled';
      job.cancelled = true;
      job.completedAt = new Date();
      this.archiveJob(job);
      this.cancelledJobIds.add(jobId);
      this.totalCancelled += 1;
      logger.info({ jobId }, 'Batch job cancelled while queued');
      return true;
    }

    const completed = this.completedJobs.get(jobId);
    if (completed) {
      if (completed.status === 'processing') {
        completed.cancelled = true;
        this.cancelledJobIds.add(jobId);
        logger.info({ jobId }, 'Batch job flagged for cancellation (in-flight)');
        return true;
      }
      logger.warn({ jobId, status: completed.status }, 'Cannot cancel a completed job');
      return false;
    }

    logger.warn({ jobId }, 'Cannot cancel unknown job');
    return false;
  }

  /** Whether a job has been cancelled. */
  isCancelled(jobId: string): boolean {
    return this.cancelledJobIds.has(jobId);
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

  /**
   * Return a partial-success summary for a job: which payments succeeded
   * and which failed (with error codes).
   */
  getPartialSuccessSummary(jobId: string): BatchPartialSuccessSummary | undefined {
    const job = this.getJob(jobId);
    if (!job) return undefined;

    const results = job.results ?? [];
    return {
      jobId: job.jobId,
      status: job.status,
      transactionHash: job.transactionHash,
      totalPayments: job.payments.length,
      succeeded: results.filter((r) => r.success),
      failed: results.filter((r) => !r.success),
      error: job.error,
    };
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

    const failureRate =
      this.totalPaymentsProcessed > 0
        ? this.totalPaymentsFailed / this.totalPaymentsProcessed
        : 0;

    let throughputPerSecond = 0;
    if (this.firstProcessedAt && this.lastProcessedAt) {
      const elapsedSeconds =
        (this.lastProcessedAt.getTime() - this.firstProcessedAt.getTime()) / 1000;
      throughputPerSecond = elapsedSeconds > 0 ? this.totalPaymentsProcessed / elapsedSeconds : 0;
    }

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
      totalPaymentsSucceeded: this.totalPaymentsSucceeded,
      totalPaymentsFailed: this.totalPaymentsFailed,
      failureRate: parseFloat(failureRate.toFixed(4)),
      throughputPerSecond: parseFloat(throughputPerSecond.toFixed(2)),
      totalCancelled: this.totalCancelled,
    };
  }

  /**
   * Reset all monitoring counters (does not clear the queue).
   */
  resetStats(): void {
    this.totalProcessed = 0;
    this.totalSucceeded = 0;
    this.totalFailed = 0;
    this.totalCancelled = 0;
    this.totalPaymentsProcessed = 0;
    this.totalPaymentsSucceeded = 0;
    this.totalPaymentsFailed = 0;
    this.totalXlmTransferred = 0;
    this.totalDurationMs = 0;
    this.lastProcessedAt = null;
    this.firstProcessedAt = null;
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

      // Honour cancellation flags before submission
      const activeJobs = bundleJobs.filter((job) => !this.isCancelled(job.jobId));
      const cancelledJobs = bundleJobs.filter((job) => this.isCancelled(job.jobId));

      for (const job of cancelledJobs) {
        this.finalizeCancelledJob(job);
      }

      if (!activeJobs.length) {
        continue;
      }

      // Only submit payments belonging to active jobs
      const activePayments = bundle
        .filter((b) => !this.isCancelled(b.job.jobId))
        .map((b) => b.payment);

      try {
        const result = await retryWithBackoff(
          () => this.executor!(fromPublicKey, activePayments),
          { maxRetries: this.maxRetries }
        );

        const now = new Date();
        for (const job of activeJobs) {
          job.status = 'submitted';
          job.transactionHash = result.hash;
          job.totalAmount = result.totalAmount;
          job.durationMs = result.durationMs;
          job.completedAt = now;
          job.results = this.buildSuccessResults(job);
          job.succeededCount = job.results.length;
          job.failedCount = 0;
          this.archiveJob(job);
        }

        // Update monitoring counters
        this.totalSucceeded += activeJobs.length;
        this.totalPaymentsProcessed += activePayments.length;
        this.totalPaymentsSucceeded += activePayments.length;
        this.totalXlmTransferred += parseFloat(result.totalAmount);
        this.totalDurationMs += result.durationMs;

        logger.info(
          {
            fromPublicKey,
            jobCount: activeJobs.length,
            paymentCount: activePayments.length,
            hash: result.hash,
            totalAmount: result.totalAmount,
            durationMs: result.durationMs,
          },
          'Bundle submitted successfully'
        );
      } catch (error) {
        const errMsg = (error as Error).message;
        const now = new Date();

        for (const job of activeJobs) {
          job.status = 'failed';
          job.error = errMsg;
          job.completedAt = now;
          job.results = this.buildFailureResults(job, 'TX_FAILED', errMsg);
          job.succeededCount = 0;
          job.failedCount = job.results.length;
          this.archiveJob(job);
        }

        this.totalFailed += activeJobs.length;
        this.totalPaymentsProcessed += activePayments.length;
        this.totalPaymentsFailed += activePayments.length;

        logger.error(
          {
            fromPublicKey,
            jobCount: activeJobs.length,
            paymentCount: activePayments.length,
            error: errMsg,
          },
          'Bundle submission failed'
        );
      } finally {
        const processedCount = activeJobs.length + cancelledJobs.length;
        this.totalProcessed += processedCount;
        const now = new Date();
        if (!this.firstProcessedAt) this.firstProcessedAt = now;
        this.lastProcessedAt = now;

        this.emitMetrics();
      }
    }
  }

  /** Mark an in-flight job as cancelled and archive it. */
  private finalizeCancelledJob(job: BatchJob): void {
    job.status = 'cancelled';
    job.cancelled = true;
    job.completedAt = new Date();
    job.results = this.buildFailureResults(job, 'CANCELLED', 'Job cancelled before submission');
    job.succeededCount = 0;
    job.failedCount = job.results.length;
    this.archiveJob(job);
    this.totalCancelled += 1;
    this.totalProcessed += 1;
    this.totalPaymentsProcessed += job.payments.length;
    this.totalPaymentsFailed += job.payments.length;
    logger.info({ jobId: job.jobId }, 'Batch job cancelled before submission');
  }

  /** Build per-payment results for a fully successful job. */
  private buildSuccessResults(job: BatchJob): PaymentResult[] {
    return job.payments.map((payment, index) => ({
      index,
      toPublicKey: payment.toPublicKey,
      amount: payment.amount,
      success: true,
    }));
  }

  /** Build per-payment results for a failed/cancelled job. */
  private buildFailureResults(job: BatchJob, errorCode: string, error: string): PaymentResult[] {
    return job.payments.map((payment, index) => ({
      index,
      toPublicKey: payment.toPublicKey,
      amount: payment.amount,
      success: false,
      errorCode,
      error,
    }));
  }

  /** Emit throughput and failure-rate metrics to the metrics module. */
  private emitMetrics(): void {
    const stats = this.getStats();
    try {
      recordBatchMetrics({
        queueDepth: stats.queueDepth,
        totalProcessed: stats.totalProcessed,
        totalSucceeded: stats.totalSucceeded,
        totalFailed: stats.totalFailed,
        totalCancelled: stats.totalCancelled,
        totalPayments: stats.totalPayments,
        totalPaymentsSucceeded: stats.totalPaymentsSucceeded,
        totalPaymentsFailed: stats.totalPaymentsFailed,
        failureRate: stats.failureRate,
        throughputPerSecond: stats.throughputPerSecond,
        averageBatchSize: stats.averageBatchSize,
        averageDurationMs: stats.averageDurationMs,
      });
    } catch (err) {
      logger.warn({ error: (err as Error).message }, 'Failed to record batch metrics');
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
