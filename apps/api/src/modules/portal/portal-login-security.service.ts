/**
 * @module portal-login-security.service
 * @description Brute-force protection for the patient portal login (Issue #1666).
 *
 * Responsibilities:
 *  - Track failed portal login attempts per account
 *  - Compute progressive delays between attempts
 *  - Lock the portal account after N failures
 *  - Require a CAPTCHA challenge after M failures
 *  - Issue / verify email or SMS unlock tokens
 *  - Write every failure / lockout / unlock to the audit log
 *
 * See docs/SECURITY_POLICY.md → "Patient Portal Login Lockout".
 */
import crypto from 'crypto';
import type { Request } from 'express';
import { PORTAL_LOGIN_SECURITY } from '@api/constants';
import { auditLog } from '../audit/audit.service';
import { sendMail } from '@api/utils/mailer';
import { smsOtpService } from './sms-otp.service';
import logger from '@api/utils/logger';

/** Minimal shape of the user document this service needs. */
export interface PortalSecurityUser {
  _id: unknown;
  email?: string;
  clinicId?: unknown;
  portalPhoneNumber?: string;
  portalFailedLoginAttempts?: number;
  portalLockedUntil?: Date;
  portalLastFailedLoginAt?: Date;
  portalCaptchaRequired?: boolean;
  portalUnlockTokenHash?: string;
  portalUnlockTokenExpiresAt?: Date;
  portalUnlockChannel?: 'email' | 'sms';
  save: () => Promise<unknown>;
}

export type UnlockChannel = 'email' | 'sms';

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── CAPTCHA verifier (pluggable, provider-agnostic) ───────────────────────────

export interface CaptchaVerifier {
  verifyCaptcha(token: string | undefined, ip?: string): Promise<boolean>;
}

/**
 * Default verifier. When `CAPTCHA_PROVIDER` is unset (or 'none') the gate is a
 * no-op so dev/test environments are not blocked. In production set
 * `CAPTCHA_PROVIDER` (recaptcha | hcaptcha | turnstile) and `CAPTCHA_SECRET`.
 */
export const captchaVerifier: CaptchaVerifier = {
  async verifyCaptcha(token: string | undefined, ip?: string): Promise<boolean> {
    const provider = (process.env.CAPTCHA_PROVIDER ?? 'none').toLowerCase();
    if (provider === 'none' || provider === '') return true;
    if (!token) return false;

    const secret = process.env.CAPTCHA_SECRET;
    if (!secret) {
      logger.warn('[portal-login-security] CAPTCHA_PROVIDER set but CAPTCHA_SECRET missing');
      return false;
    }

    const endpoints: Record<string, string> = {
      recaptcha: 'https://www.google.com/recaptcha/api/siteverify',
      hcaptcha: 'https://hcaptcha.com/siteverify',
      turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    };
    const endpoint = endpoints[provider];
    if (!endpoint) {
      logger.warn(`[portal-login-security] Unknown CAPTCHA provider: ${provider}`);
      return false;
    }

    try {
      const body = new URLSearchParams({ secret, response: token });
      if (ip) body.set('remoteip', ip);
      const res = await fetch(endpoint, { method: 'POST', body });
      const json = (await res.json()) as { success?: boolean };
      return json.success === true;
    } catch (err) {
      logger.error(
        `[portal-login-security] CAPTCHA verification failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  },
};

// ── Service ───────────────────────────────────────────────────────────────────

export const portalLoginSecurityService = {
  /** True when the portal account is currently locked. */
  isLocked(user: PortalSecurityUser): boolean {
    return Boolean(user.portalLockedUntil && user.portalLockedUntil.getTime() > Date.now());
  },

  /** Progressive delay (ms) for the given number of failed attempts. */
  getProgressiveDelayMs(attempts: number): number {
    const schedule = PORTAL_LOGIN_SECURITY.PROGRESSIVE_DELAYS_MS;
    if (attempts <= 0) return 0;
    const idx = Math.min(attempts, schedule.length - 1);
    return schedule[idx] ?? 0;
  },

  /** Seconds until the lock expires (for Retry-After). */
  getLockRetryAfterSeconds(user: PortalSecurityUser): number {
    if (!user.portalLockedUntil) return 0;
    return Math.max(1, Math.ceil((user.portalLockedUntil.getTime() - Date.now()) / 1000));
  },

  /**
   * Record a failed portal login attempt. Increments the counter, applies the
   * CAPTCHA gate, and locks the account once the threshold is reached.
   * Returns the progressive delay (ms) that should be applied to the response.
   */
  async recordFailure(user: PortalSecurityUser, req?: Request): Promise<number> {
    const now = Date.now();
    const last = user.portalLastFailedLoginAt?.getTime() ?? 0;
    const withinWindow = last > 0 && now - last < PORTAL_LOGIN_SECURITY.ATTEMPT_WINDOW_MS;

    const attempts = (withinWindow ? user.portalFailedLoginAttempts ?? 0 : 0) + 1;
    user.portalFailedLoginAttempts = attempts;
    user.portalLastFailedLoginAt = new Date(now);

    if (attempts >= PORTAL_LOGIN_SECURITY.CAPTCHA_THRESHOLD) {
      user.portalCaptchaRequired = true;
    }

    const locked = attempts >= PORTAL_LOGIN_SECURITY.MAX_FAILED_ATTEMPTS;
    if (locked) {
      user.portalLockedUntil = new Date(now + PORTAL_LOGIN_SECURITY.LOCKOUT_DURATION_MS);
    }

    try {
      await user.save();
    } catch (err) {
      logger.error(
        `[portal-login-security] Failed to persist failure counter: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    await auditLog(
      {
        action: 'PORTAL_LOGIN_FAILED',
        userId: user._id as any,
        clinicId: user.clinicId as any,
        resourceType: 'User',
        resourceId: String(user._id),
        outcome: 'FAILURE',
        metadata: { attempts, captchaRequired: Boolean(user.portalCaptchaRequired), locked },
      },
      req
    );

    if (locked) {
      await auditLog(
        {
          action: 'PORTAL_ACCOUNT_LOCKED',
          userId: user._id as any,
          clinicId: user.clinicId as any,
          resourceType: 'User',
          resourceId: String(user._id),
          outcome: 'FAILURE',
          metadata: {
            attempts,
            lockedUntil: user.portalLockedUntil?.toISOString(),
          },
        },
        req
      );
    }

    return this.getProgressiveDelayMs(attempts);
  },

  /** Clear counters, lock, and CAPTCHA flag after a successful login. */
  async resetOnSuccess(user: PortalSecurityUser): Promise<void> {
    if (
      !user.portalFailedLoginAttempts &&
      !user.portalLockedUntil &&
      !user.portalCaptchaRequired &&
      !user.portalLastFailedLoginAt
    ) {
      return;
    }
    user.portalFailedLoginAttempts = 0;
    user.portalLockedUntil = undefined;
    user.portalLastFailedLoginAt = undefined;
    user.portalCaptchaRequired = false;
    try {
      await user.save();
    } catch (err) {
      logger.error(
        `[portal-login-security] Failed to reset counters: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },

  /**
   * Issue an unlock token and deliver it via email or SMS.
   * Returns the plaintext token (email) or the OTP code (sms) for tests/logging.
   */
  async issueUnlockToken(
    user: PortalSecurityUser,
    channel: UnlockChannel = 'email'
  ): Promise<string> {
    const token = crypto.randomInt(100000, 999999).toString();
    user.portalUnlockTokenHash = sha256(token);
    user.portalUnlockTokenExpiresAt = new Date(Date.now() + PORTAL_LOGIN_SECURITY.UNLOCK_TOKEN_TTL_MS);
    user.portalUnlockChannel = channel;

    try {
      await user.save();
    } catch (err) {
      logger.error(
        `[portal-login-security] Failed to persist unlock token: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (channel === 'sms' && user.portalPhoneNumber) {
      smsOtpService.generateOtp(user.portalPhoneNumber);
      // generateOtp creates its own code; store that code's hash so verify matches.
      // Re-issue deterministically: use the generated code as the unlock token.
      const code = smsOtpService.generateOtp(user.portalPhoneNumber);
      user.portalUnlockTokenHash = sha256(code);
      user.portalUnlockTokenExpiresAt = new Date(
        Date.now() + PORTAL_LOGIN_SECURITY.UNLOCK_TOKEN_TTL_MS
      );
      await user.save();
      return code;
    }

    if (user.email) {
      await sendMail({
        to: user.email,
        subject: 'Unlock your patient portal account',
        html: `
          <p>Hello,</p>
          <p>We received a request to unlock your patient portal account.</p>
          <p>Your verification code is: <strong>${token}</strong></p>
          <p>This code expires in 15 minutes. If you did not request this, please contact support.</p>
        `,
      }).catch(() => undefined);
    }

    return token;
  },

  /**
   * Verify an unlock token and clear the lock. Returns true on success.
   */
  async verifyUnlockToken(
    user: PortalSecurityUser,
    token: string,
    req?: Request
  ): Promise<boolean> {
    if (!user.portalUnlockTokenHash || !user.portalUnlockTokenExpiresAt) return false;
    if (user.portalUnlockTokenExpiresAt.getTime() < Date.now()) return false;
    if (sha256(token) !== user.portalUnlockTokenHash) return false;

    user.portalFailedLoginAttempts = 0;
    user.portalLockedUntil = undefined;
    user.portalLastFailedLoginAt = undefined;
    user.portalCaptchaRequired = false;
    user.portalUnlockTokenHash = undefined;
    user.portalUnlockTokenExpiresAt = undefined;
    user.portalUnlockChannel = undefined;

    try {
      await user.save();
    } catch (err) {
      logger.error(
        `[portal-login-security] Failed to clear lock: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    await auditLog(
      {
        action: 'PORTAL_ACCOUNT_UNLOCKED',
        userId: user._id as any,
        clinicId: user.clinicId as any,
        resourceType: 'User',
        resourceId: String(user._id),
        outcome: 'SUCCESS',
      },
      req
    );

    return true;
  },
};

/** Sleep helper capped at MAX_SERVER_SLEEP_MS — used by the login handler. */
export async function applyProgressiveDelay(delayMs: number): Promise<number> {
  const capped = Math.min(delayMs, PORTAL_LOGIN_SECURITY.MAX_SERVER_SLEEP_MS);
  if (capped > 0) await sleep(capped);
  return capped;
}
