import nodemailer from 'nodemailer';
import { config } from '@health-watchers/config';
import logger from '@api/utils/logger';

/**
 * Basic email service using Nodemailer.
 * In a production environment, you'd use a service like SendGrid, SES, or Mailgun.
 */

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.mailtrap.io',
  port: parseInt(process.env.EMAIL_PORT || '2525'),
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const APP_BASE_URL = () => process.env.APP_BASE_URL || 'http://localhost:3000';

/**
 * Enqueue an email to be sent.
 * Currently sends synchronously, but could be moved to a background job queue (e.g. BullMQ).
 */
export async function enqueue(to: string, subject: string, text: string, html?: string) {
  if (process.env.NODE_ENV === 'test') return;

  try {
    const info = await transporter.sendMail({
      from: `"Health Watchers" <${process.env.EMAIL_FROM || 'noreply@healthwatchers.com'}>`,
      to,
      subject,
      text,
      html,
    });
    logger.info({ messageId: info.messageId, to }, 'Email sent');
  } catch (err) {
    logger.error({ err, to, subject }, 'Failed to send email');
  }
}

export function sendWelcomeEmail(to: string, name: string): void {
  const subject = 'Welcome to Health Watchers';
  const text = `Hi ${name},\n\nWelcome to Health Watchers! Your account has been successfully created.`;
  const html = `<h3>Welcome to Health Watchers</h3><p>Hi <strong>${name}</strong>,</p><p>Your account has been successfully created. You can now log in to the portal.</p>`;
  enqueue(to, subject, text, html);
}

export function sendPasswordResetEmail(to: string, token: string) {
  const resetUrl = `${APP_BASE_URL()}/reset-password?token=${token}`;
  const subject = 'Password Reset Request';
  const text = `You requested a password reset. Please use the following link: ${resetUrl}`;
  const html = `<h3>Password Reset</h3><p>You requested a password reset. Please click the link below to set a new password:</p><p><a href="${resetUrl}">Reset Password</a></p><p>If you didn't request this, you can safely ignore this email.</p>`;
  enqueue(to, subject, text, html);
}

export function sendAppointmentReminderEmail(
  to: string,
  patientName: string,
  date: Date,
  doctorName: string
): void {
  const dateStr = date.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
  const subject = 'Appointment Reminder';
  const text = `This is a reminder for your appointment with Dr. ${doctorName} on ${dateStr} for patient ${patientName}.`;
  const html = `<h3>Appointment Reminder</h3><p>This is a reminder for your upcoming appointment:</p><ul><li><strong>Doctor:</strong> Dr. ${doctorName}</li><li><strong>Patient:</strong> ${patientName}</li><li><strong>Time:</strong> ${dateStr}</li></ul>`;
  enqueue(to, subject, text, html);
}

/** Payment confirmation email sent when Stellar transaction confirms */
export function sendPaymentConfirmationEmail(to: string, amount: string, assetCode: string, txHash: string): void {
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

/** Invoice email sent to patient with QR code and payment link */
export function sendInvoiceEmail(
  to: string,
  invoice: {
    invoiceNumber: string;
    total: string;
    currency: string;
    dueDate: Date;
    stellarPayURI: string;
    qrCodeDataUrl: string;
  }
): void {
  const dueDateStr = invoice.dueDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const text = `Invoice ${invoice.invoiceNumber}\n\nAmount due: ${invoice.total} ${invoice.currency}\nDue date: ${dueDateStr}\n\nPay via Stellar: ${invoice.stellarPayURI}`;
  const html = `
    <h2>Invoice ${invoice.invoiceNumber}</h2>
    <p><strong>Amount due:</strong> ${invoice.total} ${invoice.currency}</p>
    <p><strong>Due date:</strong> ${dueDateStr}</p>
    <p><a href="${invoice.stellarPayURI}">Pay with Stellar Wallet</a></p>
    <p>Or scan the QR code below:</p>
    <img src="${invoice.qrCodeDataUrl}" alt="Stellar payment QR code" width="200" height="200" />
  `;
  enqueue(to, `Invoice ${invoice.invoiceNumber} — Health Watchers`, text, html);
}

/** Referral notification sent to receiving clinic admin */
export function sendReferralNotificationEmail(
  to: string,
  adminName: string,
  referral: { patientName: string; urgency: string; reason: string; referralId: string }
): void {
  const referralUrl = `${APP_BASE_URL()}/referrals/incoming`;
  const urgencyLabel = referral.urgency.toUpperCase();
  const text = `A new ${urgencyLabel} referral has been received for patient ${referral.patientName}.\n\nReason: ${referral.reason}\n\nView referral: ${referralUrl}`;
  const html = `
    <h3>New Patient Referral Received</h3>
    <p>Hello ${adminName},</p>
    <p>A new <strong>${urgencyLabel}</strong> referral has been received for patient <strong>${referral.patientName}</strong>.</p>
    <p><strong>Reason:</strong> ${referral.reason}</p>
    <p><a href="${referralUrl}">View Incoming Referrals</a></p>
  `;
  enqueue(to, `New ${urgencyLabel} Referral — Health Watchers`, text, html);
}

/** AI summary ready notification sent when clinical summary is generated */
export function sendAiSummaryReadyEmail(to: string, patientName: string, encounterId: string): void {
  const encounterUrl = `${APP_BASE_URL()}/encounters/${encounterId}`;
  const text = `The AI clinical summary for ${patientName}'s encounter is ready.\n\nView it here: ${encounterUrl}`;
  const html = `
    <h3>AI Clinical Summary Ready</h3>
    <p>The AI-generated clinical summary for <strong>${patientName}</strong>'s encounter is now available.</p>
    <p><a href="${encounterUrl}">View Encounter Summary</a></p>
  `;
  enqueue(to, 'AI Clinical Summary Ready — Health Watchers', text, html);
}

/** @deprecated Use sendAiSummaryReadyEmail instead */
export function sendAISummaryNotification(to: string, patientName: string, encounterId: string): void {
  sendAiSummaryReadyEmail(to, patientName, encounterId);
}

/** Dispute opened notification sent to clinic admin */
export function sendDisputeOpenedEmail(to: string, disputeId: string, paymentIntentId: string, reason: string): void {
  const disputeUrl = `${APP_BASE_URL()}/disputes`;
  const text = `A new payment dispute has been opened.\n\nDispute ID: ${disputeId}\nPayment: ${paymentIntentId}\nReason: ${reason}\n\nView disputes: ${disputeUrl}`;
  const html = `
    <h3>Payment Dispute Opened</h3>
    <p>A new dispute has been opened for payment <strong>${paymentIntentId}</strong>.</p>
    <p><strong>Reason:</strong> ${reason.replace(/_/g, ' ')}</p>
    <p><a href="${disputeUrl}">View Disputes</a></p>
  `;
  enqueue(to, 'Payment Dispute Opened — Health Watchers', text, html);
}

/** Dispute resolved notification */
export function sendDisputeResolvedEmail(to: string, disputeId: string, status: string, resolutionNotes?: string): void {
  const text = `Dispute ${disputeId} has been resolved with status: ${status}.${resolutionNotes ? `\n\nNotes: ${resolutionNotes}` : ''}`;
  const html = `
    <h3>Payment Dispute Resolved</h3>
    <p>Dispute <strong>${disputeId}</strong> has been resolved.</p>
    <p><strong>Status:</strong> ${status.replace(/_/g, ' ')}</p>
    ${resolutionNotes ? `<p><strong>Notes:</strong> ${resolutionNotes}</p>` : ''}
  `;
  enqueue(to, 'Payment Dispute Resolved — Health Watchers', text, html);
}

/** Low balance warning sent when XLM balance drops below the warning threshold */
export function sendLowBalanceWarningEmail(
  to: string,
  clinicName: string,
  xlmBalance: string,
  threshold: number
): void {
  const walletUrl = `${APP_BASE_URL()}/wallet`;
  const text = `Warning: Your clinic's Stellar account balance (${xlmBalance} XLM) has dropped below the warning threshold of ${threshold} XLM.\n\nPlease top up your account to avoid payment failures.\n\nManage wallet: ${walletUrl}`;
  const html = `
    <h3>⚠️ Low Balance Warning — ${clinicName}</h3>
    <p>Your clinic's Stellar account balance has dropped below the warning threshold.</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0">
      <tr><td style="padding:8px;font-weight:bold">Current Balance</td><td style="padding:8px;color:#d97706">${xlmBalance} XLM</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">Warning Threshold</td><td style="padding:8px">${threshold} XLM</td></tr>
    </table>
    <p>Please top up your account to avoid payment failures.</p>
    <p><a href="${walletUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Manage Wallet</a></p>
    <hr style="margin-top:32px">
    <small style="color:#6b7280">Health Watchers</small>
  `;
  enqueue(to, `⚠️ Low Balance Warning — ${clinicName}`, text, html);
}

/** Critical balance alert sent when XLM balance drops below the critical threshold */
export function sendCriticalBalanceEmail(
  to: string,
  clinicName: string,
  xlmBalance: string,
  threshold: number
): void {
  const walletUrl = `${APP_BASE_URL()}/wallet`;
  const text = `CRITICAL: Your clinic's Stellar account balance (${xlmBalance} XLM) is critically low (below ${threshold} XLM). Payments may fail immediately.\n\nManage wallet: ${walletUrl}`;
  const html = `
    <h3>🚨 Critical Balance Alert — ${clinicName}</h3>
    <p><strong>Your clinic's Stellar account balance is critically low. Payments may fail immediately.</strong></p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0">
      <tr><td style="padding:8px;font-weight:bold">Current Balance</td><td style="padding:8px;color:#dc2626">${xlmBalance} XLM</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">Critical Threshold</td><td style="padding:8px">${threshold} XLM</td></tr>
    </table>
    <p><a href="${walletUrl}" style="display:inline-block;padding:10px 20px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px">Top Up Now</a></p>
    <hr style="margin-top:32px">
    <small style="color:#6b7280">Health Watchers</small>
  `;
  enqueue(to, `🚨 Critical Balance Alert — ${clinicName}`, text, html);
}

/** Large transaction alert sent when a transaction exceeds the configured threshold */
export function sendLargeTransactionEmail(
  to: string,
  clinicName: string,
  amount: string,
  txHash: string,
  direction: 'incoming' | 'outgoing',
  threshold: number
): void {
  const explorerUrl = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
  const walletUrl = `${APP_BASE_URL()}/wallet`;
  const text = `A large ${direction} transaction of ${amount} XLM (threshold: ${threshold} XLM) was detected on your clinic's Stellar account.\n\nTransaction: ${txHash}\nView: ${explorerUrl}`;
  const html = `
    <h3>💸 Large Transaction Detected — ${clinicName}</h3>
    <p>A large <strong>${direction}</strong> transaction was detected on your clinic's Stellar account.</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0">
      <tr><td style="padding:8px;font-weight:bold">Amount</td><td style="padding:8px">${amount} XLM</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">Direction</td><td style="padding:8px;text-transform:capitalize">${direction}</td></tr>
      <tr><td style="padding:8px;font-weight:bold">Transaction</td><td style="padding:8px;font-family:monospace;font-size:12px">${txHash}</td></tr>
    </table>
    <p><a href="${explorerUrl}">View on Stellar Explorer</a> &nbsp;|&nbsp; <a href="${walletUrl}">View Wallet</a></p>
    <hr style="margin-top:32px">
    <small style="color:#6b7280">Health Watchers</small>
  `;
  enqueue(to, `💸 Large Transaction Detected — ${clinicName}`, text, html);
}

/** Unrecognized transaction alert sent when a transaction is not matched to a known payment intent */
export function sendUnrecognizedTransactionEmail(
  to: string,
  clinicName: string,
  amount: string,
  txHash: string,
  from: string
): void {
  const explorerUrl = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
  const walletUrl = `${APP_BASE_URL()}/wallet`;
  const text = `An unrecognized transaction of ${amount} XLM from ${from} was detected on your clinic's Stellar account. This transaction was not initiated through Health Watchers.\n\nTransaction: ${txHash}\nView: ${explorerUrl}`;
  const html = `
    <h3>🔍 Unrecognized Transaction — ${clinicName}</h3>
    <p>An unrecognized transaction was detected on your clinic's Stellar account. This transaction was <strong>not initiated through Health Watchers</strong>.</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0">
      <tr><td style="padding:8px;font-weight:bold">Amount</td><td style="padding:8px">${amount} XLM</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">From</td><td style="padding:8px;font-family:monospace;font-size:12px">${from}</td></tr>
      <tr><td style="padding:8px;font-weight:bold">Transaction</td><td style="padding:8px;font-family:monospace;font-size:12px">${txHash}</td></tr>
    </table>
    <p>Please review this transaction and contact support if you did not authorize it.</p>
    <p><a href="${explorerUrl}">View on Stellar Explorer</a> &nbsp;|&nbsp; <a href="${walletUrl}">View Wallet</a></p>
    <hr style="margin-top:32px">
    <small style="color:#6b7280">Health Watchers</small>
  `;
  enqueue(to, `🔍 Unrecognized Transaction Detected — ${clinicName}`, text, html);
}
