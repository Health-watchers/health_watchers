/**
 * Unit tests for lib/email.service.ts
 *
 * nodemailer is mocked so no SMTP connection is attempted, and the real pino
 * logger is replaced to avoid the (unnecessary) pino-pretty transport.
 */
jest.mock('nodemailer', () => {
  const sendMail = jest.fn().mockResolvedValue({ messageId: 'm1' });
  const createTransport = jest.fn().mockReturnValue({ sendMail });
  // No `__esModule` marker so the compiled default import (`__importDefault(...).default`)
  // resolves to this module object itself.
  return { createTransport, _sendMail: sendMail };
});

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import nodemailer from 'nodemailer';
import logger from '@api/utils/logger';
import {
  enqueue,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendAppointmentReminderEmail,
  sendPaymentConfirmationEmail,
  sendInvoiceEmail,
  sendReferralNotificationEmail,
  sendAiSummaryReadyEmail,
  sendAISummaryNotification,
  sendDisputeOpenedEmail,
  sendDisputeResolvedEmail,
  sendLowBalanceWarningEmail,
  sendCriticalBalanceEmail,
  sendLargeTransactionEmail,
  sendUnrecognizedTransactionEmail,
  sendPortalMfaEnabledEmail,
  sendPortalMfaDisabledEmail,
  sendPortalMfaBackupCodesEmail,
  sendOutcomeNotificationEmail,
} from './email.service';

const mockSendMail = (nodemailer as unknown as { _sendMail: jest.Mock })._sendMail;
const mockLoggerError = logger.error as jest.Mock;

const prevNodeEnv = process.env.NODE_ENV;

function setEnv(mode: string) {
  process.env.NODE_ENV = mode;
}

afterAll(() => {
  process.env.NODE_ENV = prevNodeEnv;
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('enqueue', () => {
  it('skips actually sending in test mode', async () => {
    setEnv('test');
    await enqueue('a@b.co', 'S', 'body', '<p>body</p>');
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('sends the email with the default from address outside test mode', async () => {
    setEnv('development');
    await enqueue('a@b.co', 'Subject', 'text', '<p>html</p>');

    expect(mockSendMail).toHaveBeenCalledWith({
      from: expect.stringContaining('Health Watchers'),
      to: 'a@b.co',
      subject: 'Subject',
      text: 'text',
      html: '<p>html</p>',
    });
  });

  it('logs and swallows send failures', async () => {
    setEnv('development');
    mockSendMail.mockRejectedValueOnce(new Error('smtp down'));
    await expect(enqueue('a@b.co', 'S', 't')).resolves.toBeUndefined();
    expect(mockLoggerError).toHaveBeenCalled();
  });
});

describe('composed send helpers', () => {
  beforeEach(() => setEnv('development'));

  it('sendWelcomeEmail includes the recipient name', async () => {
    sendWelcomeEmail('a@b.co', 'Alice');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe('a@b.co');
    expect(call.subject).toContain('Welcome');
    expect(call.html).toContain('Alice');
    expect(call.text).toContain('Alice');
  });

  it('sendPasswordResetEmail includes a reset link with the token', async () => {
    sendPasswordResetEmail('a@b.co', 'token-xyz');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain('Password Reset');
    expect(call.html).toContain('reset-password?token=token-xyz');
  });

  it('sendAppointmentReminderEmail builds a human-readable date', async () => {
    sendAppointmentReminderEmail('a@b.co', 'Bob', new Date('2026-10-01T14:30:00Z'), 'Smith');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain('Appointment Reminder');
    expect(call.text).toContain('Dr. Smith');
    expect(call.text).toContain('Bob');
  });

  it('sendPaymentConfirmationEmail includes amount, asset and tx hash', async () => {
    sendPaymentConfirmationEmail('a@b.co', '10.5', 'USDC', 'deadbeef');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain('Payment Confirmed');
    expect(call.html).toContain('10.5 USDC');
    expect(call.html).toContain('deadbeef');
  });

  it('sendInvoiceEmail includes invoice details, payment link and QR code', async () => {
    sendInvoiceEmail('a@b.co', {
      invoiceNumber: 'INV-1001',
      total: '250.00',
      currency: 'USD',
      dueDate: new Date('2026-11-01'),
      stellarPayURI: 'web+stellar:pay?amount=250.00',
      qrCodeDataUrl: 'data:image/png;base64,QRDATA',
    });
    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain('INV-1001');
    expect(call.text).toContain('250.00 USD');
    expect(call.html).toContain('web+stellar:pay?amount=250.00');
    expect(call.html).toContain('base64,QRDATA');
  });

  it('sendReferralNotificationEmail includes urgency and patient name', async () => {
    sendReferralNotificationEmail('a@b.co', 'Dr. Admin', {
      patientName: 'Jane Doe',
      urgency: 'high',
      reason: 'Cardiac consult',
      referralId: 'ref-42',
    });
    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain('HIGH');
    expect(call.html).toContain('Jane Doe');
    expect(call.html).toContain('Cardiac consult');
  });

  it('AI summary emails include the encounter link (both variants)', async () => {
    sendAiSummaryReadyEmail('a@b.co', 'Jane Doe', 'enc-77');
    let call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain('AI Clinical Summary');
    expect(call.html).toContain('/encounters/enc-77');

    sendAISummaryNotification('a@b.co', 'Jane Doe', 'enc-77');
    call = mockSendMail.mock.calls[1][0];
    expect(call.subject).toContain('AI Clinical Summary');
  });

  it('dispute emails include dispute id, payment intent and resolution notes', async () => {
    sendDisputeOpenedEmail('a@b.co', 'disp-1', 'pi_123', 'fraud');
    let call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain('Dispute');
    expect(call.html).toContain('pi_123');

    sendDisputeResolvedEmail('a@b.co', 'disp-1', 'refunded', 'Money back');
    call = mockSendMail.mock.calls[1][0];
    expect(call.subject).toContain('Resolved');
    expect(call.html).toContain('Money back');
  });

  it('balance alert emails include amount, threshold and clinic name', async () => {
    sendLowBalanceWarningEmail('a@b.co', 'Clinic A', '12.5', 50);
    let call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain('Low Balance');
    expect(call.html).toContain('12.5 XLM');
    expect(call.html).toContain('50 XLM');

    sendCriticalBalanceEmail('a@b.co', 'Clinic A', '2.1', 10);
    call = mockSendMail.mock.calls[1][0];
    expect(call.subject).toContain('Critical');
    expect(call.html).toContain('2.1 XLM');
  });

  it('transaction alert emails include direction, hash and amount', async () => {
    sendLargeTransactionEmail('a@b.co', 'Clinic A', '900', 'abc123', 'incoming', 500);
    let call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain('Large Transaction');
    expect(call.html).toContain('incoming');
    expect(call.html).toContain('abc123');

    sendUnrecognizedTransactionEmail('a@b.co', 'Clinic A', '3.3', 'def456', 'GBXXXX');
    call = mockSendMail.mock.calls[1][0];
    expect(call.subject).toContain('Unrecognized');
    expect(call.html).toContain('GBXXXX');
  });

  it('portal MFA emails cover enable, disable and backup codes', async () => {
    sendPortalMfaEnabledEmail('a@b.co', 'Jane Doe', 'totp');
    let call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('authenticator app');

    sendPortalMfaDisabledEmail('a@b.co', 'Jane Doe');
    call = mockSendMail.mock.calls[1][0];
    expect(call.subject).toContain('Disabled');

    sendPortalMfaBackupCodesEmail('a@b.co', 'Jane Doe', ['111-222', '333-444']);
    call = mockSendMail.mock.calls[2][0];
    expect(call.html).toContain('111-222');
    expect(call.html).toContain('333-444');
  });

  it('referral outcome email reflects the recorded outcome', async () => {
    sendOutcomeNotificationEmail('a@b.co', 'Dr. Smith', {
      outcome: 'attended',
      referralId: 'ref-9',
    });
    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain('Referral Outcome');
    expect(call.html).toContain('Patient Attended');
    expect(call.html).toContain('ref-9');
  });
});
