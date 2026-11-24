import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { PaymentRecord } from './entities/payment-record.entity';
import { NotificationService } from '../notifications/notification.service';

/**
 * Statuses that indicate a multi-signature payment is still gathering signatures.
 */
const AWAITING_SIGNATURE_STATUSES = ['awaiting_signatures', 'pending_signatures'];

/**
 * Job handler name used for registration in the JobRegistry.
 */
export const MULTISIG_EXPIRY_JOB_NAME = 'multisig-expiry';

/**
 * Default run interval for the multi-sig expiry job (5 minutes).
 */
export const MULTISIG_EXPIRY_INTERVAL_MS = 5 * 60 * 1000;

/**
 * MultiSigExpiryJob
 *
 * Periodically scans for multi-signature payment records that are still
 * awaiting signatures but have passed their expiry deadline (24 hours by
 * default). Such payments are auto-voided by transitioning them to the
 * `expired` status, and the initiator is notified.
 *
 * This job is intended to be registered in the JobRegistry and executed
 * every 5 minutes.
 */
@Injectable()
export class MultiSigExpiryJob {
  private readonly logger = new Logger(MultiSigExpiryJob.name);

  constructor(
    @InjectRepository(PaymentRecord)
    private readonly paymentRecordRepository: Repository<PaymentRecord>,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Execute the expiry sweep.
   *
   * 1. Find all payment records awaiting signatures whose expiry has passed.
   * 2. Bulk-update them to `expired`.
   * 3. Notify each initiator that their payment was auto-voided.
   *
   * @returns The number of payments that were expired.
   */
  async handle(): Promise<number> {
    const now = new Date();

    const expiredCandidates = await this.paymentRecordRepository.find({
      where: {
        status: In(AWAITING_SIGNATURE_STATUSES),
        expiresAt: LessThan(now),
      },
    });

    if (expiredCandidates.length === 0) {
      this.logger.debug('No multi-signature payments to expire.');
      return 0;
    }

    const ids = expiredCandidates.map((record) => record.id);

    await this.paymentRecordRepository.update(
      { id: In(ids) },
      { status: 'expired' },
    );

    this.logger.log(
      `Expired ${ids.length} multi-signature payment(s): ${ids.join(', ')}`,
    );

    await Promise.all(
      expiredCandidates.map((record) =>
        this.notifyInitiator(record).catch((error) => {
          this.logger.error(
            `Failed to notify initiator for payment ${record.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }),
      ),
    );

    return ids.length;
  }

  /**
   * Notify the initiator that their multi-signature payment has been
   * auto-voided due to signature timeout.
   */
  private async notifyInitiator(record: PaymentRecord): Promise<void> {
    const initiatorId =
      (record as any).initiatorId ?? (record as any).createdBy ?? null;

    if (!initiatorId) {
      this.logger.warn(
        `Payment ${record.id} has no initiator to notify about expiry.`,
      );
      return;
    }

    await this.notificationService.create({
      userId: initiatorId,
      type: 'payment_expired',
      title: 'Payment auto-voided',
      message: `Payment ${record.id} was automatically voided because it did not gather the required signatures within 24 hours.`,
      metadata: {
        paymentId: record.id,
        reason: 'signature_timeout',
      },
    });
  }
}

/**
 * Factory that returns a bound handler suitable for registration in the
 * JobRegistry. The registry invokes this every 5 minutes.
 *
 * @example
 * jobRegistry.register({
 *   name: MULTISIG_EXPIRY_JOB_NAME,
 *   intervalMs: MULTISIG_EXPIRY_INTERVAL_MS,
 *   handler: createMultiSigExpiryHandler(job),
 * });
 */
export function createMultiSigExpiryHandler(
  job: MultiSigExpiryJob,
): () => Promise<void> {
  return async () => {
    await job.handle();
  };
}