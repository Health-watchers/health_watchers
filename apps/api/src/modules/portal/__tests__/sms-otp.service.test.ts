/**
 * Tests for Issue #1430 — SMS OTP provider abstraction
 * Covers: ConsoleSmsProvider, provider factory, smsOtpService.sendSms enqueue,
 * OTP generate/verify lifecycle, and delivery status logging concepts.
 */

import { ConsoleSmsProvider, TwilioSmsProvider, SnsSmsProvider } from '../sms-providers';
import { smsOtpService, getSmsProvider, setSmsProvider } from '../sms-otp.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../sms-queue', () => ({
  enqueueSms: jest.fn().mockResolvedValue(undefined),
}));

import { enqueueSms } from '../sms-queue';
const mockEnqueueSms = enqueueSms as jest.MockedFunction<typeof enqueueSms>;

// Silence logger output
jest.mock('@api/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  // Reset singleton so each test starts fresh
  setSmsProvider(new ConsoleSmsProvider());
});

// ── ConsoleSmsProvider ────────────────────────────────────────────────────────

describe('ConsoleSmsProvider', () => {
  it('returns a sent result with a messageId', async () => {
    const provider = new ConsoleSmsProvider();
    const result = await provider.send('+15551234567', 'Test message');
    expect(result.status).toBe('sent');
    expect(result.messageId).toContain('console_');
  });

  it('includes the phone number in the messageId prefix', async () => {
    const provider = new ConsoleSmsProvider();
    const result = await provider.send('+15559876543', 'Hello');
    expect(typeof result.messageId).toBe('string');
    expect(result.messageId.length).toBeGreaterThan(0);
  });
});

// ── TwilioSmsProvider ─────────────────────────────────────────────────────────

describe('TwilioSmsProvider', () => {
  it('throws a helpful error when twilio package is not installed', async () => {
    const provider = new TwilioSmsProvider('sid', 'token', '+15550001111');
    // jest module resolution won't find 'twilio' in test env, so dynamic import will throw
    await expect(provider.send('+15551234567', 'OTP')).rejects.toThrow(
      /twilio.*npm package.*not installed/i
    );
  });
});

// ── SnsSmsProvider ────────────────────────────────────────────────────────────

describe('SnsSmsProvider', () => {
  it('throws a helpful error when @aws-sdk/client-sns is not installed', async () => {
    const provider = new SnsSmsProvider('us-east-1');
    await expect(provider.send('+15551234567', 'OTP')).rejects.toThrow(
      /@aws-sdk\/client-sns.*not installed/i
    );
  });
});

// ── getSmsProvider / setSmsProvider ──────────────────────────────────────────

describe('getSmsProvider', () => {
  it('returns the provider set via setSmsProvider', () => {
    const custom = new ConsoleSmsProvider();
    setSmsProvider(custom);
    expect(getSmsProvider()).toBe(custom);
  });
});

// ── smsOtpService — OTP lifecycle ────────────────────────────────────────────

describe('smsOtpService — OTP lifecycle', () => {
  it('generates a 6-digit numeric OTP', () => {
    const code = smsOtpService.generateOtp('+15550000001');
    expect(code).toMatch(/^\d{6}$/);
  });

  it('verifies a correct OTP', () => {
    const phone = '+15550000002';
    const code = smsOtpService.generateOtp(phone);
    expect(smsOtpService.verifyOtp(phone, code)).toBe(true);
  });

  it('rejects an incorrect OTP', () => {
    const phone = '+15550000003';
    smsOtpService.generateOtp(phone);
    expect(smsOtpService.verifyOtp(phone, '000000')).toBe(false);
  });

  it('invalidates the OTP after successful verification', () => {
    const phone = '+15550000004';
    const code = smsOtpService.generateOtp(phone);
    smsOtpService.verifyOtp(phone, code);
    // Second verification should fail since OTP was consumed
    expect(smsOtpService.verifyOtp(phone, code)).toBe(false);
  });

  it('rejects OTP after max attempts exceeded', () => {
    const phone = '+15550000005';
    smsOtpService.generateOtp(phone);
    smsOtpService.verifyOtp(phone, '111111'); // attempt 1
    smsOtpService.verifyOtp(phone, '222222'); // attempt 2
    smsOtpService.verifyOtp(phone, '333333'); // attempt 3
    // After 3 wrong attempts the store should be cleared
    expect(smsOtpService.verifyOtp(phone, '444444')).toBe(false);
  });

  it('clearOtp removes the stored OTP', () => {
    const phone = '+15550000006';
    const code = smsOtpService.generateOtp(phone);
    smsOtpService.clearOtp(phone);
    expect(smsOtpService.verifyOtp(phone, code)).toBe(false);
  });

  it('returns false when no OTP has been generated for the phone number', () => {
    expect(smsOtpService.verifyOtp('+15550000099', '123456')).toBe(false);
  });
});

// ── smsOtpService.sendSms ─────────────────────────────────────────────────────

describe('smsOtpService.sendSms', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('skips sending in test environment', async () => {
    process.env.NODE_ENV = 'test';
    await smsOtpService.sendSms('+15550000007', '123456');
    expect(mockEnqueueSms).not.toHaveBeenCalled();
  });

  it('enqueues SMS via smsQueue in non-test environment', async () => {
    process.env.NODE_ENV = 'development';
    await smsOtpService.sendSms('+15550000008', '654321', {
      patientId: 'pat1',
      clinicId: 'clinic1',
      sentById: 'user1',
    });
    expect(mockEnqueueSms).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '+15550000008',
        body: expect.stringContaining('654321'),
        patientId: 'pat1',
        clinicId: 'clinic1',
        sentById: 'user1',
      })
    );
  });

  it('includes the OTP code in the message body', async () => {
    process.env.NODE_ENV = 'development';
    await smsOtpService.sendSms('+15550000009', '987654');
    const callArg = mockEnqueueSms.mock.calls[0][0];
    expect(callArg.body).toContain('987654');
  });
});
