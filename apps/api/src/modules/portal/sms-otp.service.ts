import crypto from 'crypto';
import logger from '@api/utils/logger';

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
   * Send SMS (mock implementation - integrate with Twilio/AWS SNS in production)
   */
  async sendSms(phoneNumber: string, code: string): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;

    try {
      // TODO: Integrate with Twilio or AWS SNS
      // const message = `Your Health Watchers verification code is: ${code}. Valid for 10 minutes.`;
      // await twilioClient.messages.create({
      //   body: message,
      //   from: process.env.TWILIO_PHONE_NUMBER,
      //   to: phoneNumber,
      // });
      logger.info({ phoneNumber }, 'SMS OTP sent (mock)');
    } catch (err) {
      logger.error({ err, phoneNumber }, 'Failed to send SMS OTP');
      throw err;
    }
  },
};
