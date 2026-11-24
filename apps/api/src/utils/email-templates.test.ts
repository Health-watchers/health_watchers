/**
 * Unit tests for email-templates.ts
 */
import {
  passwordResetTemplate,
  appointmentReminderTemplate,
  paymentReceiptTemplate,
  accountLockedTemplate,
} from './email-templates';

describe('passwordResetTemplate', () => {
  it('includes the reset URL and expiry minutes', () => {
    const html = passwordResetTemplate('https://app.example/reset?token=abc', 30);
    expect(html).toContain('https://app.example/reset?token=abc');
    expect(html).toContain('30 minutes');
  });

  it('defaults to 60 minutes when not provided', () => {
    const html = passwordResetTemplate('https://app.example/reset');
    expect(html).toContain('60 minutes');
  });
});

describe('appointmentReminderTemplate', () => {
  const params = {
    patientName: 'Jane Doe',
    doctorName: 'Dr. Smith',
    date: '2026-09-01',
    time: '10:00 AM',
    location: 'Main Clinic, Room 2',
  };

  it('renders all appointment fields', () => {
    const html = appointmentReminderTemplate(params);
    expect(html).toContain('Jane Doe');
    expect(html).toContain('Dr. Smith');
    expect(html).toContain('2026-09-01');
    expect(html).toContain('10:00 AM');
    expect(html).toContain('Main Clinic, Room 2');
  });
});

describe('paymentReceiptTemplate', () => {
  it('renders amount, currency, transaction id and date', () => {
    const html = paymentReceiptTemplate({
      patientName: 'John Roe',
      amount: '120.00',
      currency: 'USDC',
      transactionId: 'tx-123456',
      date: '2026-08-29',
    });
    expect(html).toContain('John Roe');
    expect(html).toContain('120.00 USDC');
    expect(html).toContain('tx-123456');
    expect(html).toContain('2026-08-29');
  });
});

describe('accountLockedTemplate', () => {
  it('defaults to 15 minutes when not provided', () => {
    expect(accountLockedTemplate()).toContain('15 minutes');
  });

  it('honors a custom unlock timeout', () => {
    expect(accountLockedTemplate(45)).toContain('45 minutes');
  });
});
