/**
 * SMS OTP Service (Issue #1430)
 *
 * Thin OTP management layer that delegates actual SMS delivery to the
 * provider selected by the SMS_PROVIDER environment variable:
 *
 *   SMS_PROVIDER=console  (default) – logs to stdout, no external call
 *   SMS_PROVIDER=twilio             – Twilio REST API
 *   SMS_PROVIDER=sns                – AWS SNS
 *
 * Each provider validates required env vars at module load time and
 * throws during startup (not at request time) if configuration is missing.
 *
 * Actual delivery goes through the smsQueue (BullMQ) so failures are
 * retried with exponential back-off without blocking the HTTP response.
 */

import crypto from 'crypto';
import logger from '@api/utils/logger';
import {
  SmsProvider,
  ConsoleSmsProvider,
  TwilioSmsProvider,
  SnsSmsProvider,
} from './sms-providers';
import { enqueueSms } from './sms-queue';

// ── Provider factory (validates env at startup) ───────────────────────────────

function createSmsProvider(): SmsProvider {
  const provider = (process.env.SMS_PROVIDER ?? 'console').toLowerCase();

  switch (provider) {
    case 'twilio': {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;
      if (!accountSid || !authToken || !fromNumber) {
        throw new Error(
          '[SMS] SMS_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to be set'
        );
      }
      logger.info('[SMS] Using Twilio provider');
      return new TwilioSmsProvider(accountSid, authToken, fromNumber);
    }

    case 'sns': {
      const region = process.env.AWS_REGION ?? 'us-east-1';
      logger.info({ region }, '[SMS] Using AWS SNS provider');
      return new SnsSmsProvider(region);
    }

    case 'console':
    default:
      logger.info('[SMS] Using console provider (development mode)');
      return new ConsoleSmsProvider();
  }
}

// Singleton provider — initialised once at module load
let _provider: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (!_provider) {
    _provider = createSmsProvider();
  }
  return _provider;
}

/** Replace the provider (used in tests). */
export function setSmsProvider(p: SmsProvider): void {
  _provider = p;
}

// ── OTP store ─────────────────────────────────────────────────────────────────

interface SmsOtpStore {
  [phoneNumber: string]: {
    code: string;
    expiresAt: number;
    attempts: number;
  };
}

// In-memory store for OTP codes (in production, use Redis)
const otpStore: SmsOtpStore = {};

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 3;

export const smsOtpService = {
  /**
   * Generate and store OTP code for SMS
   */
  generateOtp(phoneNumber: string): string {
    const code = crypto.randomInt(100000, 999999).toString();
    otpStore[phoneNumber] = {
      code,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
      attempts: 0,
    };
    logger.info({ phoneNumber }, 'OTP generated for SMS');
    return code;
  },

  /**
   * Verify OTP code
   */
  verifyOtp(phoneNumber: string, code: string): boolean {
    const otp = otpStore[phoneNumber];
    if (!otp) return false;

    if (Date.now() > otp.expiresAt) {
      delete otpStore[phoneNumber];
      return false;
    }

    otp.attempts++;
    if (otp.attempts > MAX_OTP_ATTEMPTS) {
      delete otpStore[phoneNumber];
      return false;
    }

    if (otp.code !== code) {
      return false;
    }

    delete otpStore[phoneNumber];
    return true;
  },

  /**
   * Clear OTP for phone number
   */
  clearOtp(phoneNumber: string): void {
    delete otpStore[phoneNumber];
  },

  /**
   * Send SMS OTP via the configured provider.
   *
   * In test environments the call is skipped entirely.
   * In all other environments the message is enqueued in BullMQ for delivery
   * with automatic exponential-backoff retry on failure.
   */
  async sendSms(
    phoneNumber: string,
    code: string,
    opts?: { patientId?: string; clinicId?: string; sentById?: string }
  ): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;

    const message = `Your Health Watchers verification code is: ${code}. Valid for 10 minutes.`;

    await enqueueSms({
      to: phoneNumber,
      body: message,
      patientId: opts?.patientId,
      clinicId: opts?.clinicId,
      sentById: opts?.sentById,
    });

    logger.info({ phoneNumber }, 'SMS OTP enqueued for delivery');
  },
};
