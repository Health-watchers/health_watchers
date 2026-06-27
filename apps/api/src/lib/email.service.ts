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

type EmailLanguage = 'en' | 'fr';

type EmailContent = {
  subject: string;
  text: string;
  html: string;
};

type EmailRenderer = (...args: any[]) => EmailContent;

const emailPlugins = new Map<string, Record<string, EmailRenderer>>();

export function registerEmailTemplatePlugin(
  language: string,
  templates: Record<string, EmailRenderer>
): void {
  emailPlugins.set(language.toLowerCase(), templates);
}

function resolveLanguage(language?: string): EmailLanguage {
  return language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

function renderTemplate(
  key: string,
  language: string | undefined,
  fallback: EmailRenderer,
  ...args: any[]
): EmailContent {
  const locale = resolveLanguage(language);
  const plugin = emailPlugins.get(locale)?.[key];
  return plugin ? plugin(...args) : fallback(...args);
}

function buildVerificationEmail(token: string, language?: string): EmailContent {
  const verifyUrl = `${APP_BASE_URL()}/verify-email?token=${token}`;
  if (resolveLanguage(language) === 'fr') {
    return {
      subject: 'Vérifiez votre adresse e-mail',
      text: `Bonjour,\n\nVeuillez vérifier votre adresse e-mail en utilisant le lien suivant : ${verifyUrl}`,
      html: `<h3>Vérification de l'adresse e-mail</h3><p>Veuillez vérifier votre adresse e-mail en cliquant sur le lien ci-dessous :</p><p><a href="${verifyUrl}">Vérifier mon adresse e-mail</a></p>`,
    };
  }

  return {
    subject: 'Verify your email address',
    text: `Please verify your email address using the following link: ${verifyUrl}`,
    html: `<h3>Email Verification</h3><p>Please verify your email address by clicking the link below:</p><p><a href="${verifyUrl}">Verify Email Address</a></p>`,
  };
}

function buildWelcomeEmail(name: string, language?: string): EmailContent {
  if (resolveLanguage(language) === 'fr') {
    return {
      subject: 'Bienvenue chez Health Watchers',
      text: `Bonjour ${name},\n\nBienvenue chez Health Watchers ! Votre compte a été créé avec succès.`,
      html: `<h3>Bienvenue chez Health Watchers</h3><p>Bonjour <strong>${name}</strong>,</p><p>Votre compte a été créé avec succès. Vous pouvez maintenant vous connecter au portail.</p>`,
    };
  }

  return {
    subject: 'Welcome to Health Watchers',
    text: `Hi ${name},\n\nWelcome to Health Watchers! Your account has been successfully created.`,
    html: `<h3>Welcome to Health Watchers</h3><p>Hi <strong>${name}</strong>,</p><p>Your account has been successfully created. You can now log in to the portal.</p>`,
  };
}

function buildPasswordResetEmail(token: string, language?: string): EmailContent {
  const resetUrl = `${APP_BASE_URL()}/reset-password?token=${token}`;
  if (resolveLanguage(language) === 'fr') {
    return {
      subject: 'Demande de réinitialisation du mot de passe',
      text: `Vous avez demandé la réinitialisation de votre mot de passe. Utilisez le lien suivant : ${resetUrl}`,
      html: `<h3>Réinitialisation du mot de passe</h3><p>Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le lien ci-dessous pour définir un nouveau mot de passe :</p><p><a href="${resetUrl}">Réinitialiser le mot de passe</a></p><p>Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité.</p>`,
    };
  }

  return {
    subject: 'Password Reset Request',
    text: `You requested a password reset. Please use the following link: ${resetUrl}`,
    html: `<h3>Password Reset</h3><p>You requested a password reset. Please click the link below to set a new password:</p><p><a href="${resetUrl}">Reset Password</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
  };
}

function buildAppointmentReminderEmail(
  patientName: string,
  date: Date,
  doctorName: string,
  language?: string
): EmailContent {
  const locale = resolveLanguage(language);
  const dateStr = date.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
  });

  if (locale === 'fr') {
    return {
      subject: 'Rappel de rendez-vous',
      text: `Ceci est un rappel pour votre rendez-vous avec le Dr ${doctorName} le ${dateStr} pour le patient ${patientName}.`,
      html: `<h3>Rappel de rendez-vous</h3><p>Voici un rappel pour votre prochain rendez-vous :</p><ul><li><strong>Médecin :</strong> Dr ${doctorName}</li><li><strong>Patient :</strong> ${patientName}</li><li><strong>Heure :</strong> ${dateStr}</li></ul>`,
    };
  }

  return {
    subject: 'Appointment Reminder',
    text: `This is a reminder for your appointment with Dr. ${doctorName} on ${dateStr} for patient ${patientName}.`,
    html: `<h3>Appointment Reminder</h3><p>This is a reminder for your upcoming appointment:</p><ul><li><strong>Doctor:</strong> Dr. ${doctorName}</li><li><strong>Patient:</strong> ${patientName}</li><li><strong>Time:</strong> ${dateStr}</li></ul>`,
  };
}

function buildPaymentConfirmationEmail(
  amount: string,
  assetCode: string,
  txHash: string,
  language?: string
): EmailContent {
  const explorerUrl = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
  if (resolveLanguage(language) === 'fr') {
    return {
      subject: `Paiement confirmé — ${amount} ${assetCode}`,
      text: `Votre paiement de ${amount} ${assetCode} a été confirmé.\n\nTransaction : ${txHash}\nVoir sur l'explorateur : ${explorerUrl}`,
      html: `<h3>Paiement confirmé</h3><p>Votre paiement de <strong>${amount} ${assetCode}</strong> a été confirmé sur le réseau Stellar.</p><p><strong>Hachage de transaction :</strong> <code>${txHash}</code></p><p><a href="${explorerUrl}">Voir sur Stellar Explorer</a></p>`,
    };
  }

  return {
    subject: `Payment Confirmed — ${amount} ${assetCode}`,
    text: `Your payment of ${amount} ${assetCode} has been confirmed.\n\nTransaction: ${txHash}\nView on explorer: ${explorerUrl}`,
    html: `<h3>Payment Confirmed</h3><p>Your payment of <strong>${amount} ${assetCode}</strong> has been confirmed on the Stellar network.</p><p><strong>Transaction hash:</strong> <code>${txHash}</code></p><p><a href="${explorerUrl}">View on Stellar Explorer</a></p>`,
  };
}

function buildAiSummaryReadyEmail(
  patientName: string,
  encounterId: string,
  language?: string
): EmailContent {
  const encounterUrl = `${APP_BASE_URL()}/encounters/${encounterId}`;
  if (resolveLanguage(language) === 'fr') {
    return {
      subject: 'Résumé clinique IA prêt — Health Watchers',
      text: `Le résumé clinique IA pour la rencontre de ${patientName} est prêt.\n\nVoir ici : ${encounterUrl}`,
      html: `<h3>Résumé clinique IA prêt</h3><p>Le résumé clinique généré par l'IA pour la rencontre de <strong>${patientName}</strong> est maintenant disponible.</p><p><a href="${encounterUrl}">Voir le résumé de la rencontre</a></p>`,
    };
  }

  return {
    subject: 'AI Clinical Summary Ready — Health Watchers',
    text: `The AI clinical summary for ${patientName}'s encounter is ready.\n\nView it here: ${encounterUrl}`,
    html: `<h3>AI Clinical Summary Ready</h3><p>The AI-generated clinical summary for <strong>${patientName}</strong>'s encounter is now available.</p><p><a href="${encounterUrl}">View Encounter Summary</a></p>`,
  };
}

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

export const sendMail = enqueue;

export function sendVerificationEmail(to: string, token: string, language?: string): void {
  const rendered = renderTemplate(
    'verification',
    language,
    buildVerificationEmail,
    token,
    language
  );
  enqueue(to, rendered.subject, rendered.text, rendered.html);
}

export function sendWelcomeEmail(to: string, name: string, language?: string): void {
  const rendered = renderTemplate('welcome', language, buildWelcomeEmail, name, language);
  enqueue(to, rendered.subject, rendered.text, rendered.html);
}

export function sendPasswordResetEmail(to: string, token: string, language?: string) {
  const rendered = renderTemplate(
    'passwordReset',
    language,
    buildPasswordResetEmail,
    token,
    language
  );
  enqueue(to, rendered.subject, rendered.text, rendered.html);
}

export function sendAppointmentReminderEmail(
  to: string,
  patientName: string,
  date: Date,
  doctorName: string,
  language?: string
): void {
  const rendered = renderTemplate(
    'appointmentReminder',
    language,
    buildAppointmentReminderEmail,
    patientName,
    date,
    doctorName,
    language
  );
  enqueue(to, rendered.subject, rendered.text, rendered.html);
}

/** Payment confirmation email sent when Stellar transaction confirms */
export function sendPaymentConfirmationEmail(
  to: string,
  amount: string,
  assetCode: string,
  txHash: string,
  language?: string
): void {
  const rendered = renderTemplate(
    'paymentConfirmation',
    language,
    buildPaymentConfirmationEmail,
    amount,
    assetCode,
    txHash,
    language
  );
  enqueue(to, rendered.subject, rendered.text, rendered.html);
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
  },
  language?: string
): void {
  const isFrench = resolveLanguage(language) === 'fr';
  const dueDateStr = invoice.dueDate.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const subject = isFrench
    ? `Facture ${invoice.invoiceNumber} — Health Watchers`
    : `Invoice ${invoice.invoiceNumber} — Health Watchers`;
  const text = isFrench
    ? `Facture ${invoice.invoiceNumber}\n\nMontant dû : ${invoice.total} ${invoice.currency}\nDate d'échéance : ${dueDateStr}\n\nPaiement via Stellar : ${invoice.stellarPayURI}`
    : `Invoice ${invoice.invoiceNumber}\n\nAmount due: ${invoice.total} ${invoice.currency}\nDue date: ${dueDateStr}\n\nPay via Stellar: ${invoice.stellarPayURI}`;
  const html = isFrench
    ? `<h2>Facture ${invoice.invoiceNumber}</h2><p><strong>Montant dû :</strong> ${invoice.total} ${invoice.currency}</p><p><strong>Date d'échéance :</strong> ${dueDateStr}</p><p><a href="${invoice.stellarPayURI}">Payer avec Stellar Wallet</a></p><p>Ou scannez le code QR ci-dessous :</p><img src="${invoice.qrCodeDataUrl}" alt="Code QR de paiement Stellar" width="200" height="200" />`
    : `<h2>Invoice ${invoice.invoiceNumber}</h2><p><strong>Amount due:</strong> ${invoice.total} ${invoice.currency}</p><p><strong>Due date:</strong> ${dueDateStr}</p><p><a href="${invoice.stellarPayURI}">Pay with Stellar Wallet</a></p><p>Or scan the QR code below:</p><img src="${invoice.qrCodeDataUrl}" alt="Stellar payment QR code" width="200" height="200" />`;
  enqueue(to, subject, text, html);
}

/** Encounter summary email sent to patient when a patient-friendly summary is generated */
export function sendEncounterSummaryEmail(
  to: string,
  patientName: string,
  encounter: { chiefComplaint: string; summary: string; encounterId: string; date: Date },
  language?: string
): void {
  const encounterUrl = `${APP_BASE_URL()}/portal/encounters`;
  const isFrench = resolveLanguage(language) === 'fr';
  const dateStr = encounter.date.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const subject = isFrench
    ? 'Résumé de votre consultation — Health Watchers'
    : 'Your Visit Summary — Health Watchers';
  const text = isFrench
    ? `Bonjour ${patientName},\n\nVoici le résumé de votre consultation du ${dateStr} :\n\n${encounter.chiefComplaint}\n\n${encounter.summary}\n\nConsultez votre historique complet : ${encounterUrl}`
    : `Hi ${patientName},\n\nHere is a summary of your visit on ${dateStr}:\n\n${encounter.chiefComplaint}\n\n${encounter.summary}\n\nView your full encounter history: ${encounterUrl}`;
  const html = isFrench
    ? `<h3>Résumé de votre consultation</h3><p>Bonjour <strong>${patientName}</strong>,</p><p>Voici le résumé de votre consultation du <strong>${dateStr}</strong> :</p><blockquote style="border-left:3px solid #3b82f6;padding-left:12px;color:#374151">${encounter.summary}</blockquote><p style="font-size:12px;color:#9ca3af">Ce résumé est généré par IA à titre informatif uniquement.</p><p><a href="${encounterUrl}">Voir mon historique de consultations</a></p>`
    : `<h3>Your Visit Summary</h3><p>Hi <strong>${patientName}</strong>,</p><p>Here is a summary of your visit on <strong>${dateStr}</strong>:</p><blockquote style="border-left:3px solid #3b82f6;padding-left:12px;color:#374151">${encounter.summary}</blockquote><p style="font-size:12px;color:#9ca3af">This summary is AI-generated for informational purposes only.</p><p><a href="${encounterUrl}">View My Encounter History</a></p>`;
  enqueue(to, subject, text, html);
}

/** Referral notification sent to receiving clinic admin */
export function sendReferralNotificationEmail(
  to: string,
  adminName: string,
  referral: { patientName: string; urgency: string; reason: string; referralId: string },
  language?: string
): void {
  const referralUrl = `${APP_BASE_URL()}/referrals/incoming`;
  const urgencyLabel = referral.urgency.toUpperCase();
  const isFrench = resolveLanguage(language) === 'fr';
  const subject = isFrench
    ? `Nouvelle orientation ${urgencyLabel} — Health Watchers`
    : `New ${urgencyLabel} Referral — Health Watchers`;
  const text = isFrench
    ? `Une nouvelle orientation ${urgencyLabel} a été reçue pour le patient ${referral.patientName}.\n\nMotif : ${referral.reason}\n\nVoir l'orientation : ${referralUrl}`
    : `A new ${urgencyLabel} referral has been received for patient ${referral.patientName}.\n\nReason: ${referral.reason}\n\nView referral: ${referralUrl}`;
  const html = isFrench
    ? `<h3>Nouvelle orientation de patient reçue</h3><p>Bonjour ${adminName},</p><p>Une nouvelle orientation <strong>${urgencyLabel}</strong> a été reçue pour le patient <strong>${referral.patientName}</strong>.</p><p><strong>Motif :</strong> ${referral.reason}</p><p><a href="${referralUrl}">Voir les orientations entrantes</a></p>`
    : `<h3>New Patient Referral Received</h3><p>Hello ${adminName},</p><p>A new <strong>${urgencyLabel}</strong> referral has been received for patient <strong>${referral.patientName}</strong>.</p><p><strong>Reason:</strong> ${referral.reason}</p><p><a href="${referralUrl}">View Incoming Referrals</a></p>`;
  enqueue(to, subject, text, html);
}

/** AI summary ready notification sent when clinical summary is generated */
export function sendAiSummaryReadyEmail(
  to: string,
  patientName: string,
  encounterId: string,
  language?: string
): void {
  const rendered = renderTemplate(
    'aiSummaryReady',
    language,
    buildAiSummaryReadyEmail,
    patientName,
    encounterId,
    language
  );
  enqueue(to, rendered.subject, rendered.text, rendered.html);
}

/** @deprecated Use sendAiSummaryReadyEmail instead */
export function sendAISummaryNotification(
  to: string,
  patientName: string,
  encounterId: string,
  language?: string
): void {
  sendAiSummaryReadyEmail(to, patientName, encounterId, language);
}

/** Dispute opened notification sent to clinic admin */
export function sendDisputeOpenedEmail(
  to: string,
  disputeId: string,
  paymentIntentId: string,
  reason: string,
  language?: string
): void {
  const disputeUrl = `${APP_BASE_URL()}/disputes`;
  const isFrench = resolveLanguage(language) === 'fr';
  const subject = isFrench
    ? 'Litige de paiement ouvert — Health Watchers'
    : 'Payment Dispute Opened — Health Watchers';
  const text = isFrench
    ? `Un nouveau litige de paiement a été ouvert.\n\nID du litige : ${disputeId}\nPaiement : ${paymentIntentId}\nMotif : ${reason}\n\nVoir les litiges : ${disputeUrl}`
    : `A new payment dispute has been opened.\n\nDispute ID: ${disputeId}\nPayment: ${paymentIntentId}\nReason: ${reason}\n\nView disputes: ${disputeUrl}`;
  const html = isFrench
    ? `<h3>Litige de paiement ouvert</h3><p>Un nouveau litige a été ouvert pour le paiement <strong>${paymentIntentId}</strong>.</p><p><strong>Motif :</strong> ${reason.replace(/_/g, ' ')}</p><p><a href="${disputeUrl}">Voir les litiges</a></p>`
    : `<h3>Payment Dispute Opened</h3><p>A new dispute has been opened for payment <strong>${paymentIntentId}</strong>.</p><p><strong>Reason:</strong> ${reason.replace(/_/g, ' ')}</p><p><a href="${disputeUrl}">View Disputes</a></p>`;
  enqueue(to, subject, text, html);
}

/** Dispute resolved notification */
export function sendDisputeResolvedEmail(
  to: string,
  disputeId: string,
  status: string,
  resolutionNotes?: string,
  language?: string
): void {
  const isFrench = resolveLanguage(language) === 'fr';
  const subject = isFrench
    ? 'Litige de paiement résolu — Health Watchers'
    : 'Payment Dispute Resolved — Health Watchers';
  const text = isFrench
    ? `Le litige ${disputeId} a été résolu avec le statut : ${status}.${resolutionNotes ? `\n\nNotes : ${resolutionNotes}` : ''}`
    : `Dispute ${disputeId} has been resolved with status: ${status}.${resolutionNotes ? `\n\nNotes: ${resolutionNotes}` : ''}`;
  const html = isFrench
    ? `<h3>Litige de paiement résolu</h3><p>Le litige <strong>${disputeId}</strong> a été résolu.</p><p><strong>Statut :</strong> ${status.replace(/_/g, ' ')}</p>${resolutionNotes ? `<p><strong>Notes :</strong> ${resolutionNotes}</p>` : ''}`
    : `<h3>Payment Dispute Resolved</h3><p>Dispute <strong>${disputeId}</strong> has been resolved.</p><p><strong>Status:</strong> ${status.replace(/_/g, ' ')}</p>${resolutionNotes ? `<p><strong>Notes:</strong> ${resolutionNotes}</p>` : ''}`;
  enqueue(to, subject, text, html);
}

/** Dispute evidence submitted — notifies that the 7-day review period has started */
export function sendDisputeEvidenceSubmittedEmail(
  to: string,
  disputeId: string,
  reviewDeadline: Date
): void {
  const disputeUrl = `${APP_BASE_URL()}/disputes`;
  const deadlineStr = reviewDeadline.toUTCString();
  const text = `Evidence has been submitted for dispute ${disputeId}. The review period ends ${deadlineStr}.\n\nView disputes: ${disputeUrl}`;
  const html = `
    <h3>Dispute Evidence Submitted</h3>
    <p>Evidence has been submitted for dispute <strong>${disputeId}</strong>.</p>
    <p>The review period ends <strong>${deadlineStr}</strong>.</p>
    <p><a href="${disputeUrl}">View Disputes</a></p>
  `;
  enqueue(to, 'Dispute Evidence Submitted — Health Watchers', text, html);
}

/**
 * Data export ready — sends a SECURE DOWNLOAD LINK (never the data as an
 * attachment) for a patient's HIPAA Right of Access export.
 */
export function sendDataExportReadyEmail(to: string, downloadUrl: string, expiresAt: Date): void {
  const expiryStr = expiresAt.toUTCString();
  const text = `Your health record export is ready.\n\nDownload it securely here (link expires ${expiryStr}):\n${downloadUrl}\n\nFor your security this link is single-purpose and time-limited. Do not share it.`;
  const html = `
    <h3>Your Health Record Export Is Ready</h3>
    <p>You requested a copy of your health record. It is now ready to download.</p>
    <p><a href="${downloadUrl}">Download your records securely</a></p>
    <p>This link expires <strong>${expiryStr}</strong>. For your security, do not share it.</p>
  `;
  enqueue(to, 'Your Health Record Export Is Ready — Health Watchers', text, html);
}

/** Low balance warning sent when XLM balance drops below the warning threshold */
export function sendLowBalanceWarningEmail(
  to: string,
  clinicName: string,
  xlmBalance: string,
  threshold: number,
  language?: string
): void {
  const walletUrl = `${APP_BASE_URL()}/wallet`;
  const isFrench = resolveLanguage(language) === 'fr';
  const subject = isFrench
    ? `Alerte de solde faible — ${clinicName}`
    : `⚠️ Low Balance Warning — ${clinicName}`;
  const text = isFrench
    ? `Avertissement : le solde de votre compte Stellar (${xlmBalance} XLM) est passé sous le seuil d'alerte de ${threshold} XLM.\n\nVeuillez recharger votre compte pour éviter les échecs de paiement.\n\nGérer le portefeuille : ${walletUrl}`
    : `Warning: Your clinic's Stellar account balance (${xlmBalance} XLM) has dropped below the warning threshold of ${threshold} XLM.\n\nPlease top up your account to avoid payment failures.\n\nManage wallet: ${walletUrl}`;
  const html = isFrench
    ? `<h3>⚠️ Alerte de solde faible — ${clinicName}</h3><p>Le solde de votre compte Stellar est passé sous le seuil d'alerte.</p><table style="border-collapse:collapse;width:100%;margin:16px 0"><tr><td style="padding:8px;font-weight:bold">Solde actuel</td><td style="padding:8px;color:#d97706">${xlmBalance} XLM</td></tr><tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">Seuil d'alerte</td><td style="padding:8px">${threshold} XLM</td></tr></table><p>Veuillez recharger votre compte pour éviter les échecs de paiement.</p><p><a href="${walletUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Gérer le portefeuille</a></p><hr style="margin-top:32px"><small style="color:#6b7280">Health Watchers</small>`
    : `<h3>⚠️ Low Balance Warning — ${clinicName}</h3><p>Your clinic's Stellar account balance has dropped below the warning threshold.</p><table style="border-collapse:collapse;width:100%;margin:16px 0"><tr><td style="padding:8px;font-weight:bold">Current Balance</td><td style="padding:8px;color:#d97706">${xlmBalance} XLM</td></tr><tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">Warning Threshold</td><td style="padding:8px">${threshold} XLM</td></tr></table><p>Please top up your account to avoid payment failures.</p><p><a href="${walletUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Manage Wallet</a></p><hr style="margin-top:32px"><small style="color:#6b7280">Health Watchers</small>`;
  enqueue(to, subject, text, html);
}

/** Critical balance alert sent when XLM balance drops below the critical threshold */
export function sendCriticalBalanceEmail(
  to: string,
  clinicName: string,
  xlmBalance: string,
  threshold: number,
  language?: string
): void {
  const walletUrl = `${APP_BASE_URL()}/wallet`;
  const isFrench = resolveLanguage(language) === 'fr';
  const subject = isFrench
    ? `Alerte critique de solde — ${clinicName}`
    : `🚨 Critical Balance Alert — ${clinicName}`;
  const text = isFrench
    ? `CRITIQUE : le solde de votre compte Stellar (${xlmBalance} XLM) est très faible (en dessous de ${threshold} XLM). Les paiements peuvent échouer immédiatement.\n\nGérer le portefeuille : ${walletUrl}`
    : `CRITICAL: Your clinic's Stellar account balance (${xlmBalance} XLM) is critically low (below ${threshold} XLM). Payments may fail immediately.\n\nManage wallet: ${walletUrl}`;
  const html = isFrench
    ? `<h3>🚨 Alerte critique de solde — ${clinicName}</h3><p><strong>Le solde de votre compte Stellar est très faible. Les paiements peuvent échouer immédiatement.</strong></p><table style="border-collapse:collapse;width:100%;margin:16px 0"><tr><td style="padding:8px;font-weight:bold">Solde actuel</td><td style="padding:8px;color:#dc2626">${xlmBalance} XLM</td></tr><tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">Seuil critique</td><td style="padding:8px">${threshold} XLM</td></tr></table><p><a href="${walletUrl}" style="display:inline-block;padding:10px 20px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px">Recharger maintenant</a></p><hr style="margin-top:32px"><small style="color:#6b7280">Health Watchers</small>`
    : `<h3>🚨 Critical Balance Alert — ${clinicName}</h3><p><strong>Your clinic's Stellar account balance is critically low. Payments may fail immediately.</strong></p><table style="border-collapse:collapse;width:100%;margin:16px 0"><tr><td style="padding:8px;font-weight:bold">Current Balance</td><td style="padding:8px;color:#dc2626">${xlmBalance} XLM</td></tr><tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">Critical Threshold</td><td style="padding:8px">${threshold} XLM</td></tr></table><p><a href="${walletUrl}" style="display:inline-block;padding:10px 20px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px">Top Up Now</a></p><hr style="margin-top:32px"><small style="color:#6b7280">Health Watchers</small>`;
  enqueue(to, subject, text, html);
}

/** Large transaction alert sent when a transaction exceeds the configured threshold */
export function sendLargeTransactionEmail(
  to: string,
  clinicName: string,
  amount: string,
  txHash: string,
  direction: 'incoming' | 'outgoing',
  threshold: number,
  language?: string
): void {
  const explorerUrl = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
  const walletUrl = `${APP_BASE_URL()}/wallet`;
  const isFrench = resolveLanguage(language) === 'fr';
  const subject = isFrench
    ? `Transaction importante détectée — ${clinicName}`
    : `💸 Large Transaction Detected — ${clinicName}`;
  const text = isFrench
    ? `Une transaction ${direction} importante de ${amount} XLM (seuil : ${threshold} XLM) a été détectée sur le compte Stellar de votre clinique.\n\nTransaction : ${txHash}\nVoir : ${explorerUrl}`
    : `A large ${direction} transaction of ${amount} XLM (threshold: ${threshold} XLM) was detected on your clinic's Stellar account.\n\nTransaction: ${txHash}\nView: ${explorerUrl}`;
  const html = isFrench
    ? `<h3>💸 Transaction importante détectée — ${clinicName}</h3><p>Une transaction <strong>${direction}</strong> importante a été détectée sur le compte Stellar de votre clinique.</p><table style="border-collapse:collapse;width:100%;margin:16px 0"><tr><td style="padding:8px;font-weight:bold">Montant</td><td style="padding:8px">${amount} XLM</td></tr><tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">Direction</td><td style="padding:8px;text-transform:capitalize">${direction}</td></tr><tr><td style="padding:8px;font-weight:bold">Transaction</td><td style="padding:8px;font-family:monospace;font-size:12px">${txHash}</td></tr></table><p><a href="${explorerUrl}">Voir sur Stellar Explorer</a> &nbsp;|&nbsp; <a href="${walletUrl}">Voir le portefeuille</a></p><hr style="margin-top:32px"><small style="color:#6b7280">Health Watchers</small>`
    : `<h3>💸 Large Transaction Detected — ${clinicName}</h3><p>A large <strong>${direction}</strong> transaction was detected on your clinic's Stellar account.</p><table style="border-collapse:collapse;width:100%;margin:16px 0"><tr><td style="padding:8px;font-weight:bold">Amount</td><td style="padding:8px">${amount} XLM</td></tr><tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">Direction</td><td style="padding:8px;text-transform:capitalize">${direction}</td></tr><tr><td style="padding:8px;font-weight:bold">Transaction</td><td style="padding:8px;font-family:monospace;font-size:12px">${txHash}</td></tr></table><p><a href="${explorerUrl}">View on Stellar Explorer</a> &nbsp;|&nbsp; <a href="${walletUrl}">View Wallet</a></p><hr style="margin-top:32px"><small style="color:#6b7280">Health Watchers</small>`;
  enqueue(to, subject, text, html);
}

/** Unrecognized transaction alert sent when a transaction is not matched to a known payment intent */
export function sendUnrecognizedTransactionEmail(
  to: string,
  clinicName: string,
  amount: string,
  txHash: string,
  from: string,
  language?: string
): void {
  const explorerUrl = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
  const walletUrl = `${APP_BASE_URL()}/wallet`;
  const isFrench = resolveLanguage(language) === 'fr';
  const subject = isFrench
    ? `Transaction non reconnue détectée — ${clinicName}`
    : `🔍 Unrecognized Transaction Detected — ${clinicName}`;
  const text = isFrench
    ? `Une transaction non reconnue de ${amount} XLM provenant de ${from} a été détectée sur le compte Stellar de votre clinique. Cette transaction n'a pas été initiée via Health Watchers.\n\nTransaction : ${txHash}\nVoir : ${explorerUrl}`
    : `An unrecognized transaction of ${amount} XLM from ${from} was detected on your clinic's Stellar account. This transaction was not initiated through Health Watchers.\n\nTransaction: ${txHash}\nView: ${explorerUrl}`;
  const html = isFrench
    ? `<h3>🔍 Transaction non reconnue — ${clinicName}</h3><p>Une transaction non reconnue a été détectée sur le compte Stellar de votre clinique. Cette transaction <strong>n'a pas été initiée via Health Watchers</strong>.</p><table style="border-collapse:collapse;width:100%;margin:16px 0"><tr><td style="padding:8px;font-weight:bold">Montant</td><td style="padding:8px">${amount} XLM</td></tr><tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">Origine</td><td style="padding:8px;font-family:monospace;font-size:12px">${from}</td></tr><tr><td style="padding:8px;font-weight:bold">Transaction</td><td style="padding:8px;font-family:monospace;font-size:12px">${txHash}</td></tr></table><p>Veuillez examiner cette transaction et contacter le support si vous n'êtes pas à l'origine de celle-ci.</p><p><a href="${explorerUrl}">Voir sur Stellar Explorer</a> &nbsp;|&nbsp; <a href="${walletUrl}">Voir le portefeuille</a></p><hr style="margin-top:32px"><small style="color:#6b7280">Health Watchers</small>`
    : `<h3>🔍 Unrecognized Transaction — ${clinicName}</h3><p>An unrecognized transaction was detected on your clinic's Stellar account. This transaction was <strong>not initiated through Health Watchers</strong>.</p><table style="border-collapse:collapse;width:100%;margin:16px 0"><tr><td style="padding:8px;font-weight:bold">Amount</td><td style="padding:8px">${amount} XLM</td></tr><tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">From</td><td style="padding:8px;font-family:monospace;font-size:12px">${from}</td></tr><tr><td style="padding:8px;font-weight:bold">Transaction</td><td style="padding:8px;font-family:monospace;font-size:12px">${txHash}</td></tr></table><p>Please review this transaction and contact support if you did not authorize it.</p><p><a href="${explorerUrl}">View on Stellar Explorer</a> &nbsp;|&nbsp; <a href="${walletUrl}">View Wallet</a></p><hr style="margin-top:32px"><small style="color:#6b7280">Health Watchers</small>`;
  enqueue(to, subject, text, html);
}

/** Portal MFA enabled notification sent to patient */
export function sendPortalMfaEnabledEmail(
  to: string,
  patientName: string,
  method: 'totp' | 'sms',
  language?: string
): void {
  const methodLabel = method === 'totp' ? 'authenticator app' : 'SMS';
  const portalUrl = `${APP_BASE_URL()}/portal/settings/security`;
  const isFrench = resolveLanguage(language) === 'fr';
  const subject = isFrench
    ? 'Authentification à deux facteurs activée — Health Watchers'
    : 'Portal Two-Factor Authentication Enabled — Health Watchers';
  const text = isFrench
    ? `L'authentification à deux facteurs (${methodLabel}) a été activée sur votre compte du portail patient Health Watchers.\n\nSi vous n'avez pas effectué cette action, contactez immédiatement le support.\n\nGérer les paramètres de sécurité : ${portalUrl}`
    : `Two-factor authentication (${methodLabel}) has been enabled on your Health Watchers patient portal account.\n\nIf you did not enable this, please contact support immediately.\n\nManage security settings: ${portalUrl}`;
  const html = isFrench
    ? `<h3>Authentification à deux facteurs du portail activée</h3><p>Bonjour <strong>${patientName}</strong>,</p><p>L'authentification à deux facteurs utilisant <strong>${methodLabel}</strong> a été activée sur votre compte du portail patient Health Watchers.</p><p>Vous devrez fournir un code de vérification lors de la connexion à votre portail.</p><p style="color:#dc2626"><strong>Si vous n'avez pas effectué cette action, contactez immédiatement le support.</strong></p><p><a href="${portalUrl}">Gérer les paramètres de sécurité</a></p>`
    : `<h3>Portal Two-Factor Authentication Enabled</h3><p>Hello <strong>${patientName}</strong>,</p><p>Two-factor authentication using <strong>${methodLabel}</strong> has been enabled on your Health Watchers patient portal account.</p><p>You will be required to provide a verification code when logging in to your portal.</p><p style="color:#dc2626"><strong>If you did not enable this, please contact support immediately.</strong></p><p><a href="${portalUrl}">Manage Security Settings</a></p>`;
  enqueue(to, subject, text, html);
}

/** Portal MFA disabled notification sent to patient */
export function sendPortalMfaDisabledEmail(
  to: string,
  patientName: string,
  language?: string
): void {
  const portalUrl = `${APP_BASE_URL()}/portal/settings/security`;
  const isFrench = resolveLanguage(language) === 'fr';
  const subject = isFrench
    ? 'Authentification à deux facteurs désactivée — Health Watchers'
    : 'Portal Two-Factor Authentication Disabled — Health Watchers';
  const text = isFrench
    ? `L'authentification à deux facteurs a été désactivée sur votre compte du portail patient Health Watchers.\n\nSi vous n'avez pas effectué cette action, contactez immédiatement le support.\n\nGérer les paramètres de sécurité : ${portalUrl}`
    : `Two-factor authentication has been disabled on your Health Watchers patient portal account.\n\nIf you did not disable this, please contact support immediately.\n\nManage security settings: ${portalUrl}`;
  const html = isFrench
    ? `<h3>Authentification à deux facteurs du portail désactivée</h3><p>Bonjour <strong>${patientName}</strong>,</p><p>L'authentification à deux facteurs a été désactivée sur votre compte du portail patient Health Watchers.</p><p style="color:#dc2626"><strong>Si vous n'avez pas effectué cette action, contactez immédiatement le support.</strong></p><p><a href="${portalUrl}">Gérer les paramètres de sécurité</a></p>`
    : `<h3>Portal Two-Factor Authentication Disabled</h3><p>Hello <strong>${patientName}</strong>,</p><p>Two-factor authentication has been disabled on your Health Watchers patient portal account.</p><p style="color:#dc2626"><strong>If you did not disable this, please contact support immediately.</strong></p><p><a href="${portalUrl}">Manage Security Settings</a></p>`;
  enqueue(to, subject, text, html);
}

/** Portal MFA backup codes generated notification sent to patient */
export function sendPortalMfaBackupCodesEmail(
  to: string,
  patientName: string,
  backupCodes: string[],
  language?: string
): void {
  const portalUrl = `${APP_BASE_URL()}/portal/settings/security`;
  const codesHtml = backupCodes
    .map(
      (code) =>
        `<code style="background:#f3f4f6;padding:4px 8px;margin:4px;display:inline-block">${code}</code>`
    )
    .join('');
  const isFrench = resolveLanguage(language) === 'fr';
  const subject = isFrench
    ? 'Codes de secours MFA générés — Health Watchers'
    : 'Portal MFA Backup Codes — Health Watchers';
  const text = isFrench
    ? `Vos codes de secours pour l'authentification à deux facteurs du portail ont été générés. Conservez-les dans un endroit sûr.\n\nCodes de secours :\n${backupCodes.join('\n')}\n\nGérer les paramètres de sécurité : ${portalUrl}`
    : `Your backup codes for portal two-factor authentication have been generated. Keep these codes in a safe place.\n\nBackup codes:\n${backupCodes.join('\n')}\n\nManage security settings: ${portalUrl}`;
  const html = isFrench
    ? `<h3>Codes de secours MFA du portail générés</h3><p>Bonjour <strong>${patientName}</strong>,</p><p>Vos codes de secours pour l'authentification à deux facteurs du portail ont été générés. Conservez-les dans un endroit sûr.</p><p><strong>Codes de secours :</strong></p><div style="background:#f9fafb;padding:16px;border-radius:6px;margin:16px 0;font-family:monospace">${codesHtml}</div><p style="color:#dc2626"><strong>Important :</strong> chaque code ne peut être utilisé qu'une seule fois. Conservez-les en lieu sûr.</p><p><a href="${portalUrl}">Gérer les paramètres de sécurité</a></p>`
    : `<h3>Portal MFA Backup Codes Generated</h3><p>Hello <strong>${patientName}</strong>,</p><p>Your backup codes for portal two-factor authentication have been generated. Keep these codes in a safe place.</p><p><strong>Backup Codes:</strong></p><div style="background:#f9fafb;padding:16px;border-radius:6px;margin:16px 0;font-family:monospace">${codesHtml}</div><p style="color:#dc2626"><strong>Important:</strong> Each code can only be used once. Store them securely.</p><p><a href="${portalUrl}">Manage Security Settings</a></p>`;
  enqueue(to, subject, text, html);
}

/** Notification sent to patient when a new consent version requires acceptance */
export function sendConsentVersionNotificationEmail(
  to: string,
  patientName: string,
  consentType: string,
  version: string
): void {
  const portalUrl = `${APP_BASE_URL()}/portal/consent`;
  const typeLabel = consentType.replace(/_/g, ' ');
  const subject = `Action Required: Updated ${typeLabel} consent form — Health Watchers`;
  const text = `Hi ${patientName},\n\nYour clinic has updated the ${typeLabel} consent form (version ${version}). Please review and re-consent at your earliest convenience.\n\nReview and sign: ${portalUrl}`;
  const html = `
    <h3>Updated Consent Form Requires Your Acceptance</h3>
    <p>Hi <strong>${patientName}</strong>,</p>
    <p>Your clinic has published an updated <strong>${typeLabel}</strong> consent form (version <strong>${version}</strong>).</p>
    <p>Please review and re-accept the updated form to continue receiving care.</p>
    <p><a href="${portalUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Review &amp; Sign</a></p>
    <hr style="margin-top:32px">
    <small style="color:#6b7280">Health Watchers — HIPAA Compliance</small>
  `;
  enqueue(to, subject, text, html);
}

/** MFA grace period reminder sent to DOCTOR/NURSE who haven't set up 2FA */
export function sendMfaGracePeriodReminderEmail(
  to: string,
  name: string,
  daysRemaining: number,
  gracePeriodEndsAt: Date
): void {
  const setupUrl = `${APP_BASE_URL()}/settings/security`;
  const deadlineStr = gracePeriodEndsAt.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const urgency = daysRemaining === 1 ? '🚨 Last day' : `⚠️ ${daysRemaining} days remaining`;
  const subject = `${urgency}: Set up Two-Factor Authentication — Health Watchers`;
  const text = `Hi ${name},\n\nYour account requires two-factor authentication (2FA) to be set up by ${deadlineStr}.\n\nAfter that date, you will not be able to log in until 2FA is enabled.\n\nSet it up now: ${setupUrl}`;
  const html = `
    <h3>${urgency}: Two-Factor Authentication Required</h3>
    <p>Hi <strong>${name}</strong>,</p>
    <p>Your account requires two-factor authentication (2FA) to protect patient data.</p>
    <p><strong>Deadline:</strong> ${deadlineStr}</p>
    <p>After this date, you will <strong>not be able to log in</strong> until 2FA is enabled.</p>
    <p><a href="${setupUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Set Up 2FA Now</a></p>
    <hr style="margin-top:32px">
    <small style="color:#6b7280">Health Watchers — HIPAA Compliance</small>
  `;
  enqueue(to, subject, text, html);
}

/** Backup codes regenerated — sent to staff user (DOCTOR/NURSE/ADMIN) when new codes are generated */
export function sendMfaBackupCodesRegeneratedEmail(
  to: string,
  name: string,
  backupCodes: string[]
): void {
  const setupUrl = `${APP_BASE_URL()}/settings/security`;
  const codesHtml = backupCodes
    .map(
      (code) =>
        `<code style="background:#f3f4f6;padding:4px 8px;margin:4px;display:inline-block;font-family:monospace">${code}</code>`
    )
    .join('');
  const subject = 'MFA Backup Codes Regenerated — Health Watchers';
  const text = `Hi ${name},\n\nYour MFA backup codes have been regenerated. All previous codes are now invalid.\n\nNew backup codes:\n${backupCodes.join('\n')}\n\nStore them in a safe place. Each code can only be used once.\n\nManage security settings: ${setupUrl}`;
  const html = `
    <h3>MFA Backup Codes Regenerated</h3>
    <p>Hi <strong>${name}</strong>,</p>
    <p>Your MFA backup codes have been regenerated. <strong>All previous codes are now invalid.</strong></p>
    <p><strong>New Backup Codes:</strong></p>
    <div style="background:#f9fafb;padding:16px;border-radius:6px;margin:16px 0;font-family:monospace">${codesHtml}</div>
    <p style="color:#dc2626"><strong>Important:</strong> Each code can only be used once. Store them securely and do not share them.</p>
    <p>If you did not request this, contact your administrator immediately.</p>
    <p><a href="${setupUrl}">Manage Security Settings</a></p>
    <hr style="margin-top:32px">
    <small style="color:#6b7280">Health Watchers — HIPAA Compliance</small>
  `;
  enqueue(to, subject, text, html);
}

/** Referral outcome notification sent to referring doctor */
export function sendOutcomeNotificationEmail(
  to: string,
  doctorName: string,
  data: { outcome: string; referralId: string },
  language?: string
): void {
  const referralUrl = `${APP_BASE_URL()}/referrals/${data.referralId}`;
  const outcomeLabel =
    data.outcome === 'attended'
      ? 'Patient Attended'
      : data.outcome.charAt(0).toUpperCase() + data.outcome.slice(1);
  const isFrench = resolveLanguage(language) === 'fr';
  const subject = isFrench
    ? 'Résultat de l’orientation enregistré — Health Watchers'
    : 'Referral Outcome Recorded — Health Watchers';
  const text = isFrench
    ? `Un résultat d'orientation a été enregistré : ${outcomeLabel}.\n\nID de l'orientation : ${data.referralId}\nVoir : ${referralUrl}`
    : `A referral outcome has been recorded: ${outcomeLabel}.\n\nReferral ID: ${data.referralId}\nView: ${referralUrl}`;
  const html = isFrench
    ? `<h3>Résultat de l'orientation enregistré</h3><p>Bonjour <strong>${doctorName}</strong>,</p><p>Un résultat d'orientation a été enregistré pour l'une de vos orientations.</p><table style="border-collapse:collapse;width:100%;margin:16px 0"><tr><td style="padding:8px;font-weight:bold">Résultat</td><td style="padding:8px">${outcomeLabel}</td></tr><tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">ID de l'orientation</td><td style="padding:8px;font-family:monospace;font-size:12px">${data.referralId}</td></tr></table><p><a href="${referralUrl}">Voir les détails de l'orientation</a></p>`
    : `<h3>Referral Outcome Recorded</h3><p>Hello <strong>${doctorName}</strong>,</p><p>A referral outcome has been recorded for one of your referrals.</p><table style="border-collapse:collapse;width:100%;margin:16px 0"><tr><td style="padding:8px;font-weight:bold">Outcome</td><td style="padding:8px">${outcomeLabel}</td></tr><tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">Referral ID</td><td style="padding:8px;font-family:monospace;font-size:12px">${data.referralId}</td></tr></table><p><a href="${referralUrl}">View Referral Details</a></p>`;
  enqueue(to, subject, text, html);
}

/** Keypair rotation notification sent to clinic admin after successful rotation */
export function sendKeypairRotationEmail(
  to: string,
  clinicName: string,
  newPublicKey: string,
  keyVersion: number,
  language?: string
): void {
  const isFrench = resolveLanguage(language) === 'fr';
  const subject = isFrench
    ? `Rotation des clés Stellar effectuée — ${clinicName}`
    : `Stellar Keypair Rotated — ${clinicName}`;
  const text = isFrench
    ? `La rotation des clés Stellar de votre clinique a été effectuée avec succès.\n\nNouvelle clé publique : ${newPublicKey}\nVersion : ${keyVersion}\n\nSi vous n'avez pas initié cette action, contactez le support immédiatement.`
    : `Your clinic's Stellar keypair has been successfully rotated.\n\nNew public key: ${newPublicKey}\nKey version: ${keyVersion}\n\nIf you did not initiate this action, please contact support immediately.`;
  const html = isFrench
    ? `<h3>Rotation des clés Stellar effectuée — ${clinicName}</h3><p>La rotation des clés Stellar de votre clinique a été effectuée avec succès.</p><table style="border-collapse:collapse;width:100%;margin:16px 0"><tr><td style="padding:8px;font-weight:bold">Nouvelle clé publique</td><td style="padding:8px;font-family:monospace;font-size:12px">${newPublicKey}</td></tr><tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">Version</td><td style="padding:8px">${keyVersion}</td></tr></table><p style="color:#dc2626"><strong>Si vous n'avez pas initié cette action, contactez le support immédiatement.</strong></p>`
    : `<h3>Stellar Keypair Rotated — ${clinicName}</h3><p>Your clinic's Stellar keypair has been successfully rotated.</p><table style="border-collapse:collapse;width:100%;margin:16px 0"><tr><td style="padding:8px;font-weight:bold">New Public Key</td><td style="padding:8px;font-family:monospace;font-size:12px">${newPublicKey}</td></tr><tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">Key Version</td><td style="padding:8px">${keyVersion}</td></tr></table><p style="color:#dc2626"><strong>If you did not initiate this action, please contact support immediately.</strong></p>`;
  enqueue(to, subject, text, html);
}

/** Claimable balance expiry notification sent to patient */
export function sendClaimableExpiryEmail(
  to: string,
  patientName: string,
  amount: string,
  claimableUntil: Date,
  language?: string
): void {
  const portalUrl = `${APP_BASE_URL()}/portal/payments`;
  const isFrench = resolveLanguage(language) === 'fr';
  const expiryStr =
    claimableUntil.toLocaleString(isFrench ? 'fr-FR' : 'en-US', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    }) + ' UTC';
  const subject = isFrench
    ? 'Paiement à réclamer expirant bientôt — Health Watchers'
    : '⏰ Your Claimable Payment is Expiring Soon — Health Watchers';
  const text = isFrench
    ? `Votre paiement réclamable de ${amount} XLM expire bientôt (${expiryStr}). Veuillez le réclamer avant expiration, sinon les fonds seront retournés à la clinique.\n\nRéclamer maintenant : ${portalUrl}`
    : `Your claimable payment of ${amount} XLM is expiring soon (${expiryStr}). Please claim it before it expires or the funds will be returned to the clinic.\n\nClaim now: ${portalUrl}`;
  const html = isFrench
    ? `<h3>⏰ Paiement réclamable expirant bientôt</h3><p>Bonjour <strong>${patientName}</strong>,</p><p>Vous avez un paiement réclamable qui expire dans les 24 heures. Veuillez le réclamer avant son expiration.</p><table style="border-collapse:collapse;width:100%;margin:16px 0"><tr><td style="padding:8px;font-weight:bold">Montant</td><td style="padding:8px">${amount} XLM</td></tr><tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">Expire le</td><td style="padding:8px;color:#dc2626">${expiryStr}</td></tr></table><p>Si vous ne réclamez pas ce paiement avant la date d'expiration, les fonds seront retournés à la clinique.</p><p><a href="${portalUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Réclamer maintenant</a></p><hr style="margin-top:32px"><small style="color:#6b7280">Health Watchers</small>`
    : `<h3>⏰ Claimable Payment Expiring Soon</h3><p>Hello <strong>${patientName}</strong>,</p><p>You have a claimable payment that is expiring within 24 hours. Please claim it before it expires.</p><table style="border-collapse:collapse;width:100%;margin:16px 0"><tr><td style="padding:8px;font-weight:bold">Amount</td><td style="padding:8px">${amount} XLM</td></tr><tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">Expires At</td><td style="padding:8px;color:#dc2626">${expiryStr}</td></tr></table><p>If you do not claim this payment before the expiry date, the funds will be returned to the clinic.</p><p><a href="${portalUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Claim Payment Now</a></p><hr style="margin-top:32px"><small style="color:#6b7280">Health Watchers</small>`;
  enqueue(to, subject, text, html);
}
