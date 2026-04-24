/**
 * Email notification service — Issue #355
 *
 * Supports SMTP and SendGrid providers (configurable via EMAIL_PROVIDER env var).
 * All emails are sent asynchronously via an in-memory queue with up to 3 retries
 * and exponential backoff. Email sending is disabled in test environment.
 */

import nodemailer from 'nodemailer';
import logger from '@api/utils/logger';

const IS_TEST = process.env.NODE_ENV === 'test';
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:3000';
const FROM = process.env.EMAIL_FROM ?? 'no-reply@health-watchers.app';

// ── Transporter ───────────────────────────────────────────────────────────────

function createTransporter() {
  if (IS_TEST) return null;

  const provider = process.env.EMAIL_PROVIDER ?? 'smtp';

  if (provider === 'sendgrid') {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY ?? '' },
    });
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

const transporter = createTransporter();

// ── Async queue with retry ────────────────────────────────────────────────────

interface EmailJob {
  to: string;
  subject: string;
  text: string;
  html: string;
  attempt: number;
}

const MAX_RETRIES = 3;

async function sendWithRetry(job: EmailJob): Promise<void> {
  if (IS_TEST || !transporter) return;

  try {
    await transporter.sendMail({ from: FROM, to: job.to, subject: job.subject, text: job.text, html: job.html });
    logger.info({ to: job.to, subject: job.subject }, 'Email sent');
  } catch (err) {
    if (job.attempt < MAX_RETRIES) {
      const delay = Math.pow(2, job.attempt) * 1000; // 1s, 2s, 4s
      logger.warn({ to: job.to, attempt: job.attempt, delay }, 'Email failed, retrying');
      setTimeout(() => sendWithRetry({ ...job, attempt: job.attempt + 1 }), delay);
    } else {
      logger.error({ err, to: job.to, subject: job.subject }, 'Email delivery failed after max retries');
    }
  }
}

/** Enqueue an email for async delivery (non-blocking) */
function enqueue(to: string, subject: string, text: string, html: string): void {
  setImmediate(() => sendWithRetry({ to, subject, text, html, attempt: 1 }));
}

// ── Email templates ───────────────────────────────────────────────────────────

/** Welcome email sent on new user registration */
export function sendWelcomeEmail(to: string, fullName: string, tempPassword?: string): void {
  const loginUrl = `${APP_BASE_URL}/login`;
  const text = tempPassword
    ? `Welcome to Health Watchers, ${fullName}!\n\nYour account has been created.\nTemporary password: ${tempPassword}\n\nPlease log in and change your password immediately:\n${loginUrl}`
    : `Welcome to Health Watchers, ${fullName}!\n\nYour account has been created. Log in at:\n${loginUrl}`;

  const html = `
    <h2>Welcome to Health Watchers, ${fullName}!</h2>
    <p>Your account has been created.</p>
    ${tempPassword ? `<p><strong>Temporary password:</strong> <code>${tempPassword}</code></p><p>Please log in and change your password immediately.</p>` : ''}
    <p><a href="${loginUrl}">Log in to Health Watchers</a></p>
  `;

  enqueue(to, 'Welcome to Health Watchers', text, html);
}

/** Password reset email with secure token link (1-hour expiry) */
export async function sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
  const resetUrl = `${APP_BASE_URL}/reset-password?token=${resetToken}`;
  const text = `You requested a password reset. Use the link below (valid for 1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`;
  const html = `
    <p>You requested a password reset. Click the link below (valid for 1 hour):</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>If you did not request this, ignore this email.</p>
  `;
  enqueue(to, 'Password Reset Request', text, html);
}

/** Email verification link sent on registration */
export async function sendVerificationEmail(to: string, verificationToken: string): Promise<void> {
  const verifyUrl = `${APP_BASE_URL}/verify-email?token=${verificationToken}`;
  const text = `Welcome! Please verify your email address:\n\n${verifyUrl}\n\nIf you did not create this account, ignore this email.`;
  const html = `
    <p>Welcome! Please verify your email address:</p>
    <p><a href="${verifyUrl}">${verifyUrl}</a></p>
    <p>If you did not create this account, ignore this email.</p>
  `;
  enqueue(to, 'Verify your Health Watchers account', text, html);
}

/** Appointment reminder sent 24 hours before appointment */
export function sendAppointmentReminderEmail(
  to: string,
  patientName: string,
  appointmentDate: Date,
  doctorName: string,
): void {
  const dateStr = appointmentDate.toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const text = `Reminder: ${patientName} has an appointment with ${doctorName} on ${dateStr}.`;
  const html = `
    <h3>Appointment Reminder</h3>
    <p>This is a reminder that <strong>${patientName}</strong> has an upcoming appointment:</p>
    <ul>
      <li><strong>Date:</strong> ${dateStr}</li>
      <li><strong>Doctor:</strong> ${doctorName}</li>
    </ul>
  `;
  enqueue(to, 'Appointment Reminder — Health Watchers', text, html);
}

/** Payment confirmation email sent when Stellar transaction confirms */
export function sendPaymentConfirmationEmail(
  to: string,
  amount: string,
  assetCode: string,
  txHash: string,
): void {
  const explorerUrl = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
  const text = `Your payment of ${amount} ${assetCode} has been confirmed.\n\nTransaction: ${txHash}\nView on explorer: ${explorerUrl}`;
  const html = `
    <h3>Payment Confirmed</h3>
    <p>Your payment of <strong>${amount} ${assetCode}</strong> has been confirmed on the Stellar network.</p>
    <p><strong>Transaction hash:</strong> <code>${txHash}</code></p>
    <p><a href="${explorerUrl}">View on Stellar Explorer</a></p>
  `;
  enqueue(to, `Payment Confirmed — ${amount} ${assetCode}`, text, html);
}

/** AI summary ready notification sent when clinical summary is generated */
export function sendAiSummaryReadyEmail(
  to: string,
  patientName: string,
  encounterId: string,
): void {
  const encounterUrl = `${APP_BASE_URL}/encounters/${encounterId}`;
  const text = `The AI clinical summary for ${patientName}'s encounter is ready.\n\nView it here: ${encounterUrl}`;
  const html = `
    <h3>AI Clinical Summary Ready</h3>
    <p>The AI-generated clinical summary for <strong>${patientName}</strong>'s encounter is now available.</p>
    <p><a href="${encounterUrl}">View Encounter Summary</a></p>
  `;
  enqueue(to, 'AI Clinical Summary Ready — Health Watchers', text, html);
}
}
