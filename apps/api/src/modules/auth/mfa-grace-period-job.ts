import { UserModel } from './models/user.model';
import { sendMfaGracePeriodReminderEmail } from '@api/lib/email.service';
import logger from '@api/utils/logger';

/**
 * MFA Grace Period Reminder Job
 *
 * Runs daily. Sends email reminders to DOCTOR/NURSE users who have not yet
 * enabled MFA when their grace period is 3 days or 1 day away.
 */

export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REMINDER_DAYS = [3, 1]; // days before deadline to send reminders

let jobInterval: NodeJS.Timeout | null = null;

export async function runMfaGracePeriodReminderTick(): Promise<void> {
  const now = new Date();

  for (const days of REMINDER_DAYS) {
    // Window: users whose grace period ends between (now + days*24h - 1h) and (now + days*24h)
    const windowEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const windowStart = new Date(windowEnd.getTime() - 60 * 60 * 1000); // 1-hour window

    const users = await UserModel.find({
      role: { $in: ['DOCTOR', 'NURSE'] },
      mfaEnabled: false,
      mfaGracePeriodEndsAt: { $gte: windowStart, $lt: windowEnd },
    }).select('email fullName mfaGracePeriodEndsAt');

    for (const user of users) {
      sendMfaGracePeriodReminderEmail(
        user.email,
        user.fullName,
        days,
        user.mfaGracePeriodEndsAt!
      );
      logger.info({ userId: user.id, days }, '[mfa-grace-period-job] reminder sent');
    }
  }
}

export function startMfaGracePeriodJob(): void {
  if (jobInterval) {
    logger.warn('[mfa-grace-period-job] already running');
    return;
  }
  logger.info('[mfa-grace-period-job] starting');
  runMfaGracePeriodReminderTick();
  jobInterval = setInterval(() => runMfaGracePeriodReminderTick(), CHECK_INTERVAL_MS);
}

export function stopMfaGracePeriodJob(): void {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
    logger.info('[mfa-grace-period-job] stopped');
  }
}
