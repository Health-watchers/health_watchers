/**
 * SMS Queue (Issue #1430)
 *
 * BullMQ-based SMS delivery queue with exponential-backoff retry and
 * communication-log status tracking.
 *
 * Pattern mirrors apps/api/src/utils/email-queue.ts.
 */

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '@health-watchers/config';
import { CommunicationLogModel } from '../communications/communication-log.model';
import { getSmsProvider } from './sms-otp.service';
import logger from '@api/utils/logger';

const QUEUE_NAME = 'sms';

// Shared Redis connection for BullMQ
const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

export interface SmsJobData {
  to: string;
  body: string;
  patientId?: string;
  clinicId?: string;
  sentById?: string;
}

export const smsQueue = new Queue<SmsJobData>(QUEUE_NAME, { connection });

/**
 * Enqueue an SMS message for async delivery with retry.
 * Errors are logged but never surfaced to the caller.
 */
export async function enqueueSms(opts: SmsJobData): Promise<void> {
  try {
    await smsQueue.add('send', opts, {
      attempts: 4,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: true,
      removeOnFail: 200,
    });
  } catch (err) {
    logger.error({ err }, '[sms-queue] Failed to enqueue SMS');
  }
}

/** Start the worker — call once at app startup (alongside startEmailWorker) */
export function startSmsWorker(): void {
  const worker = new Worker<SmsJobData>(
    QUEUE_NAME,
    async (job: Job<SmsJobData>) => {
      const { to, body, patientId, clinicId, sentById } = job.data;
      const provider = getSmsProvider();

      let logId: string | undefined;
      // Create a "sent" communication log entry first (optimistic)
      if (patientId && clinicId && sentById) {
        const log = await CommunicationLogModel.create({
          patientId,
          clinicId,
          sentBy: sentById,
          channel: 'sms',
          direction: 'outbound',
          content: body,
          status: 'sent',
          sentAt: new Date(),
        });
        logId = String(log._id);
      }

      try {
        const result = await provider.send(to, body);
        logger.info(
          { to, messageId: result.messageId, jobId: job.id },
          '[sms-worker] SMS sent successfully'
        );

        // Update delivery status
        if (logId) {
          await CommunicationLogModel.findByIdAndUpdate(logId, {
            $set: {
              status: result.status === 'sent' ? 'delivered' : 'failed',
              deliveredAt: result.status === 'sent' ? new Date() : undefined,
              twilioMessageSid: result.messageId,
            },
          });
        }
      } catch (err) {
        logger.error({ err, to, jobId: job.id }, '[sms-worker] SMS delivery failed');

        // Update log to failed status
        if (logId) {
          await CommunicationLogModel.findByIdAndUpdate(logId, {
            $set: { status: 'failed' },
          });
        }

        throw err; // re-throw so BullMQ can retry
      }
    },
    { connection }
  );

  worker.on('completed', (job) => {
    logger.info(`[sms-worker] Delivered SMS to ${job.data.to} (job ${job.id})`);
  });

  worker.on('failed', (job, err) => {
    logger.error({ err, to: job?.data.to, jobId: job?.id }, '[sms-worker] Failed to deliver SMS');
  });
}
