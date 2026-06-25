/**
 * Tests for language selection logic in email.service.ts (issue #706)
 *
 * Strategy: set NODE_ENV to non-test, mock nodemailer's sendMail, and verify
 * the subject/text passed to it reflects the correct language.
 */

// Must set before importing the service so the transporter uses our mock
const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'mock-id' });

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: sendMailMock })),
}));

jest.mock('@api/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

// Import AFTER mocks are in place
import * as emailService from './email.service';

// Override NODE_ENV so enqueue actually calls sendMail
const originalEnv = process.env.NODE_ENV;
beforeAll(() => { process.env.NODE_ENV = 'development'; });
afterAll(() => { process.env.NODE_ENV = originalEnv; });
beforeEach(() => sendMailMock.mockClear());

function lastCall() {
  expect(sendMailMock).toHaveBeenCalled();
  const { subject, text, html } = sendMailMock.mock.calls[sendMailMock.mock.calls.length - 1][0];
  return { subject: subject as string, text: (text ?? '') as string, html: (html ?? '') as string };
}

// ── resolveLanguage logic ─────────────────────────────────────────────────────
describe('language selection', () => {
  test('defaults to English when no language provided', () => {
    emailService.sendWelcomeEmail('a@b.com', 'Alice');
    expect(lastCall().subject).toMatch(/welcome/i);
  });

  test('selects French for language="fr"', () => {
    emailService.sendWelcomeEmail('a@b.com', 'Alice', 'fr');
    expect(lastCall().subject).toMatch(/bienvenue/i);
  });

  test('selects French for language="fr-CA" (prefix match)', () => {
    emailService.sendWelcomeEmail('a@b.com', 'Alice', 'fr-CA');
    expect(lastCall().subject).toMatch(/bienvenue/i);
  });

  test('selects French case-insensitively for language="FR"', () => {
    emailService.sendWelcomeEmail('a@b.com', 'Alice', 'FR');
    expect(lastCall().subject).toMatch(/bienvenue/i);
  });

  test('falls back to English for unknown language', () => {
    emailService.sendWelcomeEmail('a@b.com', 'Alice', 'de');
    expect(lastCall().subject).toMatch(/welcome/i);
  });
});

// ── sendVerificationEmail ─────────────────────────────────────────────────────
describe('sendVerificationEmail', () => {
  test('EN: correct subject', () => {
    emailService.sendVerificationEmail('a@b.com', 'tok123');
    const { subject, text } = lastCall();
    expect(subject).toBe('Verify your email address');
    expect(text).toContain('tok123');
  });

  test('FR: French subject', () => {
    emailService.sendVerificationEmail('a@b.com', 'tok123', 'fr');
    expect(lastCall().subject).toBe('Vérifiez votre adresse e-mail');
  });
});

// ── sendWelcomeEmail ──────────────────────────────────────────────────────────
describe('sendWelcomeEmail', () => {
  test('EN: contains name', () => {
    emailService.sendWelcomeEmail('a@b.com', 'Bob');
    const { text } = lastCall();
    expect(text).toContain('Bob');
  });

  test('FR: French subject', () => {
    emailService.sendWelcomeEmail('a@b.com', 'Bob', 'fr');
    expect(lastCall().subject).toContain('Bienvenue');
  });
});

// ── sendPasswordResetEmail ────────────────────────────────────────────────────
describe('sendPasswordResetEmail', () => {
  test('EN: contains token', () => {
    emailService.sendPasswordResetEmail('a@b.com', 'resetTok');
    expect(lastCall().text).toContain('resetTok');
  });

  test('FR: French subject', () => {
    emailService.sendPasswordResetEmail('a@b.com', 'resetTok', 'fr');
    expect(lastCall().subject).toMatch(/réinitialisation/i);
  });
});

// ── sendAppointmentReminderEmail ──────────────────────────────────────────────
describe('sendAppointmentReminderEmail', () => {
  const date = new Date('2026-07-01T10:00:00Z');

  test('EN: correct subject', () => {
    emailService.sendAppointmentReminderEmail('a@b.com', 'Alice', date, 'Smith');
    expect(lastCall().subject).toBe('Appointment Reminder');
  });

  test('FR: French subject', () => {
    emailService.sendAppointmentReminderEmail('a@b.com', 'Alice', date, 'Smith', 'fr');
    expect(lastCall().subject).toBe('Rappel de rendez-vous');
  });
});

// ── sendPaymentConfirmationEmail ──────────────────────────────────────────────
describe('sendPaymentConfirmationEmail', () => {
  test('EN: contains amount', () => {
    emailService.sendPaymentConfirmationEmail('a@b.com', '100', 'XLM', 'txhash1');
    expect(lastCall().subject).toContain('100 XLM');
  });

  test('FR: French subject', () => {
    emailService.sendPaymentConfirmationEmail('a@b.com', '100', 'XLM', 'txhash1', 'fr');
    expect(lastCall().subject).toContain('Paiement confirmé');
  });
});

// ── sendInvoiceEmail ──────────────────────────────────────────────────────────
describe('sendInvoiceEmail', () => {
  const invoice = {
    invoiceNumber: 'INV-001', total: '50', currency: 'XLM',
    dueDate: new Date('2026-08-01'),
    stellarPayURI: 'web+stellar:pay?destination=G...',
    qrCodeDataUrl: 'data:image/png;base64,abc',
  };

  test('EN: contains invoice number', () => {
    emailService.sendInvoiceEmail('a@b.com', invoice);
    expect(lastCall().subject).toContain('INV-001');
  });

  test('FR: French subject', () => {
    emailService.sendInvoiceEmail('a@b.com', invoice, 'fr');
    expect(lastCall().subject).toContain('Facture INV-001');
  });
});

// ── sendEncounterSummaryEmail ─────────────────────────────────────────────────
describe('sendEncounterSummaryEmail', () => {
  const encounter = { chiefComplaint: 'Headache', summary: 'Mild migraine', encounterId: 'enc1', date: new Date('2026-06-01') };

  test('EN: correct subject', () => {
    emailService.sendEncounterSummaryEmail('a@b.com', 'Carol', encounter);
    expect(lastCall().subject).toMatch(/visit summary/i);
  });

  test('FR: French subject', () => {
    emailService.sendEncounterSummaryEmail('a@b.com', 'Carol', encounter, 'fr');
    expect(lastCall().subject).toMatch(/consultation/i);
  });
});

// ── sendReferralNotificationEmail ─────────────────────────────────────────────
describe('sendReferralNotificationEmail', () => {
  const referral = { patientName: 'Dan', urgency: 'urgent', reason: 'chest pain', referralId: 'ref1' };

  test('EN: contains patient name', () => {
    emailService.sendReferralNotificationEmail('a@b.com', 'Admin', referral);
    expect(lastCall().text).toContain('Dan');
  });

  test('FR: French subject', () => {
    emailService.sendReferralNotificationEmail('a@b.com', 'Admin', referral, 'fr');
    expect(lastCall().subject).toMatch(/orientation/i);
  });
});

// ── sendAiSummaryReadyEmail ───────────────────────────────────────────────────
describe('sendAiSummaryReadyEmail', () => {
  test('EN: correct subject', () => {
    emailService.sendAiSummaryReadyEmail('a@b.com', 'Eve', 'enc42');
    expect(lastCall().subject).toMatch(/ai clinical summary/i);
  });

  test('FR: French subject', () => {
    emailService.sendAiSummaryReadyEmail('a@b.com', 'Eve', 'enc42', 'fr');
    expect(lastCall().subject).toMatch(/résumé clinique/i);
  });
});

// ── sendDisputeOpenedEmail ────────────────────────────────────────────────────
describe('sendDisputeOpenedEmail', () => {
  test('EN: correct subject', () => {
    emailService.sendDisputeOpenedEmail('a@b.com', 'disp1', 'pi_123', 'fraud');
    expect(lastCall().subject).toMatch(/dispute opened/i);
  });

  test('FR: French subject', () => {
    emailService.sendDisputeOpenedEmail('a@b.com', 'disp1', 'pi_123', 'fraud', 'fr');
    expect(lastCall().subject).toMatch(/litige/i);
  });
});

// ── sendDisputeResolvedEmail ──────────────────────────────────────────────────
describe('sendDisputeResolvedEmail', () => {
  test('EN: contains dispute ID', () => {
    emailService.sendDisputeResolvedEmail('a@b.com', 'disp2', 'won');
    expect(lastCall().text).toContain('disp2');
  });

  test('FR: French subject', () => {
    emailService.sendDisputeResolvedEmail('a@b.com', 'disp2', 'won', undefined, 'fr');
    expect(lastCall().subject).toMatch(/litige.*résolu/i);
  });
});

// ── sendDisputeEvidenceSubmittedEmail (was missing lang support) ──────────────
describe('sendDisputeEvidenceSubmittedEmail', () => {
  const deadline = new Date('2026-07-08T00:00:00Z');

  test('EN: English subject', () => {
    emailService.sendDisputeEvidenceSubmittedEmail('a@b.com', 'disp3', deadline);
    expect(lastCall().subject).toMatch(/evidence submitted/i);
  });

  test('FR: French subject', () => {
    emailService.sendDisputeEvidenceSubmittedEmail('a@b.com', 'disp3', deadline, 'fr');
    expect(lastCall().subject).toMatch(/preuves.*soumises/i);
  });
});

// ── sendDataExportReadyEmail (was missing lang support) ───────────────────────
describe('sendDataExportReadyEmail', () => {
  const expires = new Date('2026-07-02T12:00:00Z');

  test('EN: English subject and download URL', () => {
    emailService.sendDataExportReadyEmail('a@b.com', 'https://dl.test', expires);
    const { subject, text } = lastCall();
    expect(subject).toMatch(/export is ready/i);
    expect(text).toContain('https://dl.test');
  });

  test('FR: French subject and download URL', () => {
    emailService.sendDataExportReadyEmail('a@b.com', 'https://dl.test', expires, 'fr');
    const { subject, text } = lastCall();
    expect(subject).toMatch(/export.*prêt/i);
    expect(text).toContain('https://dl.test');
  });
});

// ── sendConsentVersionNotificationEmail (was missing lang support) ────────────
describe('sendConsentVersionNotificationEmail', () => {
  test('EN: English subject', () => {
    emailService.sendConsentVersionNotificationEmail('a@b.com', 'Frank', 'treatment', 'v2');
    expect(lastCall().subject).toMatch(/action required/i);
  });

  test('FR: French subject', () => {
    emailService.sendConsentVersionNotificationEmail('a@b.com', 'Frank', 'treatment', 'v2', 'fr');
    expect(lastCall().subject).toMatch(/action requise/i);
  });
});

// ── sendMfaGracePeriodReminderEmail (was missing lang support) ────────────────
describe('sendMfaGracePeriodReminderEmail', () => {
  const deadline = new Date('2026-07-15');

  test('EN: correct subject', () => {
    emailService.sendMfaGracePeriodReminderEmail('a@b.com', 'Grace', 3, deadline);
    expect(lastCall().subject).toMatch(/two-factor/i);
  });

  test('EN: last-day urgency label', () => {
    emailService.sendMfaGracePeriodReminderEmail('a@b.com', 'Grace', 1, deadline);
    expect(lastCall().subject).toContain('Last day');
  });

  test('FR: French subject', () => {
    emailService.sendMfaGracePeriodReminderEmail('a@b.com', 'Grace', 3, deadline, 'fr');
    expect(lastCall().subject).toMatch(/authentification à deux facteurs/i);
  });

  test('FR: last-day French urgency label', () => {
    emailService.sendMfaGracePeriodReminderEmail('a@b.com', 'Grace', 1, deadline, 'fr');
    expect(lastCall().subject).toContain('Dernier jour');
  });
});

// ── sendPortalMfaEnabledEmail ─────────────────────────────────────────────────
describe('sendPortalMfaEnabledEmail', () => {
  test('EN: English subject', () => {
    emailService.sendPortalMfaEnabledEmail('a@b.com', 'Hank', 'totp');
    expect(lastCall().subject).toMatch(/two-factor authentication enabled/i);
  });

  test('FR: French subject', () => {
    emailService.sendPortalMfaEnabledEmail('a@b.com', 'Hank', 'totp', 'fr');
    expect(lastCall().subject).toMatch(/authentification.*activée/i);
  });
});

// ── sendPortalMfaDisabledEmail ────────────────────────────────────────────────
describe('sendPortalMfaDisabledEmail', () => {
  test('EN: English subject', () => {
    emailService.sendPortalMfaDisabledEmail('a@b.com', 'Iris');
    expect(lastCall().subject).toMatch(/disabled/i);
  });

  test('FR: French subject', () => {
    emailService.sendPortalMfaDisabledEmail('a@b.com', 'Iris', 'fr');
    expect(lastCall().subject).toMatch(/désactivée/i);
  });
});

// ── sendLowBalanceWarningEmail ────────────────────────────────────────────────
describe('sendLowBalanceWarningEmail', () => {
  test('EN: contains clinic name', () => {
    emailService.sendLowBalanceWarningEmail('a@b.com', 'MediClinic', '5', 10);
    expect(lastCall().subject).toContain('MediClinic');
  });

  test('FR: French subject', () => {
    emailService.sendLowBalanceWarningEmail('a@b.com', 'MediClinic', '5', 10, 'fr');
    expect(lastCall().subject).toMatch(/solde faible/i);
  });
});

// ── sendCriticalBalanceEmail ──────────────────────────────────────────────────
describe('sendCriticalBalanceEmail', () => {
  test('EN: correct subject', () => {
    emailService.sendCriticalBalanceEmail('a@b.com', 'MediClinic', '1', 5);
    expect(lastCall().subject).toMatch(/critical/i);
  });

  test('FR: French subject', () => {
    emailService.sendCriticalBalanceEmail('a@b.com', 'MediClinic', '1', 5, 'fr');
    expect(lastCall().subject).toMatch(/alerte critique/i);
  });
});

// ── sendOutcomeNotificationEmail ──────────────────────────────────────────────
describe('sendOutcomeNotificationEmail', () => {
  test('EN: correct subject', () => {
    emailService.sendOutcomeNotificationEmail('a@b.com', 'Dr. Jones', { outcome: 'attended', referralId: 'ref9' });
    expect(lastCall().subject).toMatch(/referral outcome/i);
  });

  test('FR: French subject', () => {
    emailService.sendOutcomeNotificationEmail('a@b.com', 'Dr. Jones', { outcome: 'attended', referralId: 'ref9' }, 'fr');
    expect(lastCall().subject).toMatch(/orientation/i);
  });
});

// ── sendClaimableExpiryEmail ──────────────────────────────────────────────────
describe('sendClaimableExpiryEmail', () => {
  const expiry = new Date('2026-07-10T12:00:00Z');

  test('EN: contains amount', () => {
    emailService.sendClaimableExpiryEmail('a@b.com', 'Jack', '25', expiry);
    expect(lastCall().text).toContain('25 XLM');
  });

  test('FR: French subject', () => {
    emailService.sendClaimableExpiryEmail('a@b.com', 'Jack', '25', expiry, 'fr');
    expect(lastCall().subject).toMatch(/expirant/i);
  });
});
