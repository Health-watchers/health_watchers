import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '@health-watchers/config';
import { sendMail, MailOptions } from './mailer';

const QUEUE_NAME = 'email';

// Shared Redis connection for BullMQ
const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

export const emailQueue = new Queue<MailOptions>(QUEUE_NAME, { connection });

/**
 * Enqueue an email for async delivery.
 * Failures are logged but never bubble up to the caller.
 */
export async function enqueueEmail(opts: MailOptions): Promise<void> {
  try {
    await emailQueue.add('send', opts, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: 100,
    });
  } catch (err) {
    console.error('[email-queue] Failed to enqueue email:', err);
  }
}

/** Start the worker — call once at app startup */
export function startEmailWorker(): void {
  const worker = new Worker<MailOptions>(
    QUEUE_NAME,
    async (job: Job<MailOptions>) => {
      await sendMail(job.data);
    },
    { connection }
  );

  worker.on('completed', (job) => {
    console.info(`[email-worker] Sent email to ${job.data.to} (job ${job.id})`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[email-worker] Failed to send email (job ${job?.id}):`, err);
  });
}
