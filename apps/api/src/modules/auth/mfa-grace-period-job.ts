import { UserModel } from './models/user.model';
import { sendMfaGracePeriodReminderEmail } from '@api/lib/email.service';
import logger from '@api/utils/logger';

/**
 * MFA Grace Period Job
 *
 * Runs daily. Two responsibilities:
 *
 * 1. Reminder tick: sends email reminders to ADMIN/DOCTOR/NURSE users who have
 *    not yet enabled MFA when their grace period is 3 days or 1 day away.
 *
 * 2. Enforcement tick: for users with role admin/doctor/nurse and mfaEnabled=false,
 *    sets mfaGracePeriodEndsAt on first observation (7-day window) and marks the
 *    user as MFA-required once the deadline passes so the auth middleware blocks
 *    login. Audit events are logged when a grace period starts and when it expires.
 */

const REMINDER_DAYS = [3, 1]; // days before deadline to send reminders

const MFA_REQUIRED_ROLES = ['ADMIN', 'DOCTOR', 'NURSE'];
const GRACE_PERIOD_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Audit helper. Emits a structured audit event for MFA lifecycle changes.
 */
function logMfaAuditEvent(
  event: 'mfa.grace_period.started' | 'mfa.grace_period.expired',
  userId: string,
  extra: Record<string, unknown> = {},
): void {
  logger.info(
    { audit: true, event, userId, ...extra },
    `[mfa-grace-period-job] audit: ${event}`,
  );
}

/**
 * Reminder tick: notify users whose grace period is about to expire.
 */
export async function runMfaGracePeriodReminderTick(): Promise<void> {
  const now = new Date();

  for (const days of REMINDER_DAYS) {
    // Window: users whose grace period ends between (now + days*24h - 1h) and (now + days*24h)
    const windowEnd = new Date(now.getTime() + days * DAY_MS);
    const windowStart = new Date(windowEnd.getTime() - 60 * 60 * 1000); // 1-hour window

    const users = await UserModel.find({
      role: { $in: MFA_REQUIRED_ROLES },
      mfaEnabled: false,
      mfaGracePeriodEndsAt: { $gte: windowStart, $lt: windowEnd },
    }).select('email fullName mfaGracePeriodEndsAt');

    for (const user of users) {
      sendMfaGracePeriodReminderEmail(user.email, user.fullName, days, user.mfaGracePeriodEndsAt!);
      logger.info({ userId: user.id, days }, '[mfa-grace-period-job] reminder sent');
    }
  }
}

/**
 * Enforcement tick: start grace periods for newly observed users and expire
 * grace periods that have passed, marking the user as MFA-required.
 */
export async function runMfaGracePeriodEnforcementTick(): Promise<void> {
  const now = new Date();

  // 1. Start grace periods for users who have not yet been observed.
  const usersNeedingGracePeriod = await UserModel.find({
    role: { $in: MFA_REQUIRED_ROLES },
    mfaEnabled: false,
    mfaGracePeriodEndsAt: { $exists: false },
  }).select('email fullName role');

  for (const user of usersNeedingGracePeriod) {
    const gracePeriodEndsAt = new Date(now.getTime() + GRACE_PERIOD_DAYS * DAY_MS);

    await UserModel.updateOne(
      { _id: user._id, mfaGracePeriodEndsAt: { $exists: false } },
      { $set: { mfaGracePeriodEndsAt: gracePeriodEndsAt } },
    );

    logMfaAuditEvent('mfa.grace_period.started', user.id, {
      role: user.role,
      gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
    });
  }

  // 2. Expire grace periods that have passed and mark users as MFA-required.
  const expiredUsers = await UserModel.find({
    role: { $in: MFA_REQUIRED_ROLES },
    mfaEnabled: false,
    mfaGracePeriodEndsAt: { $lt: now },
    mfaRequired: { $ne: true },
  }).select('email fullName role mfaGracePeriodEndsAt');

  for (const user of expiredUsers) {
    await UserModel.updateOne(
      { _id: user._id, mfaRequired: { $ne: true } },
      { $set: { mfaRequired: true } },
    );

    logMfaAuditEvent('mfa.grace_period.expired', user.id, {
      role: user.role,
      gracePeriodEndsAt: user.mfaGracePeriodEndsAt?.toISOString(),
    });
  }
}

/**
 * Combined tick used by the scheduler. Runs enforcement first so that newly
 * observed users get their grace period set before reminders are evaluated.
 */
export async function runMfaGracePeriodTick(): Promise<void> {
  await runMfaGracePeriodEnforcementTick();
  await runMfaGracePeriodReminderTick();
}