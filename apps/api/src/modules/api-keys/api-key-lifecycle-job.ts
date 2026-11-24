/**
 * #1252 — API key lifecycle worker.
 *
 * Runs hourly and:
 *   1. deactivates keys whose `expiresAt` has passed
 *   2. clears superseded key hashes once their rotation grace window closes
 *   3. emits a one-time "expiring soon" notification 7 days out
 *   4. #1667 — flags legacy keys with no scopes and warns their owner
 *
 * All steps are idempotent so multiple API instances running the job
 * concurrently is harmless.
 */

import logger from '../../utils/logger';
import { createNotification } from '../notifications/notification.service';
import { ApiKeyModel } from './models/api-key.model';

const EXPIRY_WARNING_DAYS = 7;

export interface LifecycleSweepResult {
  deactivated: number;
  graceCleared: number;
  warned: number;
  /** #1667 — legacy keys (no scopes) whose owner was warned this sweep. */
  legacyScopesWarned: number;
}

export async function sweepApiKeyLifecycle(now: Date = new Date()): Promise<LifecycleSweepResult> {
  // 1. Deactivate expired keys.
  const deactivated = await ApiKeyModel.updateMany(
    { isActive: true, revokedAt: { $exists: false }, expiresAt: { $lt: now } },
    { $set: { isActive: false } }
  );

  // 2. Drop grace hashes whose window has closed.
  const graceCleared = await ApiKeyModel.updateMany(
    { previousKeyExpiresAt: { $lt: now } },
    { $unset: { previousKeyHash: '', previousKeyExpiresAt: '' } }
  );

  // 3. One-time expiry warning.
  const warnBefore = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 86400_000);
  const expiringSoon = await ApiKeyModel.find({
    isActive: true,
    revokedAt: { $exists: false },
    expiresAt: { $gt: now, $lte: warnBefore },
    expiryWarningSentAt: { $exists: false },
  })
    .select('_id name clinicId createdBy expiresAt')
    .lean();

  let warned = 0;
  for (const key of expiringSoon) {
    try {
      await createNotification({
        userId: String(key.createdBy),
        clinicId: String(key.clinicId),
        type: 'system',
        title: 'API key expiring soon',
        message: `API key "${key.name}" expires on ${new Date(key.expiresAt as Date)
          .toISOString()
          .slice(0, 10)}. Rotate or extend it to avoid disruption.`,
        metadata: { apiKeyId: String(key._id), expiresAt: key.expiresAt },
      });
      await ApiKeyModel.updateOne({ _id: key._id }, { $set: { expiryWarningSentAt: now } });
      warned += 1;
    } catch (err) {
      logger.error({ err, apiKeyId: String(key._id) }, '[api-key-lifecycle] warning failed');
    }
  }

  // 4. #1667 — legacy keys created before scoping existed have no scopes and
  // therefore cannot reach any endpoint (empty scopes = deny-all). API keys are
  // not tied to logins, so instead of "rotating on next login" we notify the
  // owner once and let an admin update the scopes explicitly.
  const legacyKeys = await ApiKeyModel.find({
    isActive: true,
    revokedAt: { $exists: false },
    legacyScopesWarnedAt: { $exists: false },
    $or: [{ scopes: { $exists: false } }, { scopes: { $size: 0 } }],
  })
    .select('_id name clinicId createdBy')
    .lean();

  let legacyScopesWarned = 0;
  for (const key of legacyKeys) {
    try {
      await createNotification({
        userId: String(key.createdBy),
        clinicId: String(key.clinicId),
        type: 'system',
        title: 'API key has no scopes',
        message: `API key "${key.name}" has no scopes and cannot access any endpoint. Update its scopes or rotate it.`,
        metadata: { apiKeyId: String(key._id) },
      });
      await ApiKeyModel.updateOne({ _id: key._id }, { $set: { legacyScopesWarnedAt: now } });
      legacyScopesWarned += 1;
    } catch (err) {
      logger.error(
        { err, apiKeyId: String(key._id) },
        '[api-key-lifecycle] legacy scope warning failed'
      );
    }
  }

  const result: LifecycleSweepResult = {
    deactivated: deactivated.modifiedCount ?? 0,
    graceCleared: graceCleared.modifiedCount ?? 0,
    warned,
    legacyScopesWarned,
  };

  if (result.deactivated || result.graceCleared || result.warned || result.legacyScopesWarned) {
    logger.info(result, '[api-key-lifecycle] sweep complete');
  }
  return result;
}
