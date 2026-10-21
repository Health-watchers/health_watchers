/**
 * Email Template Builders
 * Issue #1521: Extracted from email.service.ts for better organization and reusability
 *
 * Each template builder returns { subject, text, html }
 * Support bilingual templates (English and French)
 */

type EmailContent = {
  subject: string;
  text: string;
  html: string;
};

type EmailLanguage = 'en' | 'fr';

const APP_BASE_URL = () => process.env.APP_BASE_URL || 'http://localhost:3000';

function resolveLanguage(language?: string): EmailLanguage {
  return language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

// ============================================================
// AUTHENTICATION TEMPLATES
// ============================================================

export function buildVerificationEmail(token: string, language?: string): EmailContent {
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

export function buildWelcomeEmail(name: string, language?: string): EmailContent {
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

export function buildPasswordResetEmail(token: string, language?: string): EmailContent {
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

export function buildMfaEnabledEmail(language?: string): EmailContent {
  if (resolveLanguage(language) === 'fr') {
    return {
      subject: 'Authentification multi-facteur activée',
      text: 'L\'authentification multi-facteur a été activée sur votre compte.',
      html: '<h3>MFA Activée</h3><p>L\'authentification multi-facteur a été activée sur votre compte avec succès.</p>',
    };
  }

  return {
    subject: 'Multi-Factor Authentication Enabled',
    text: 'Multi-factor authentication has been enabled on your account.',
    html: '<h3>MFA Enabled</h3><p>Multi-factor authentication has been successfully enabled on your account.</p>',
  };
}

export function buildAccountLockedEmail(language?: string): EmailContent {
  if (resolveLanguage(language) === 'fr') {
    return {
      subject: 'Compte verrouillé — Trop de tentatives de connexion échouées',
      text: 'Votre compte a été verrouillé en raison de trop de tentatives de connexion échouées.',
      html: '<h3>Compte verrouillé</h3><p>Votre compte a été temporairement verrouillé pour des raisons de sécurité après trop de tentatives de connexion échouées.</p>',
    };
  }

  return {
    subject: 'Account Locked — Too Many Failed Login Attempts',
    text: 'Your account has been locked due to too many failed login attempts.',
    html: '<h3>Account Locked</h3><p>Your account has been temporarily locked for security reasons after too many failed login attempts.</p>',
  };
}

// ============================================================
// APPOINTMENT & CLINICAL TEMPLATES
// ============================================================

export function buildAppointmentReminderEmail(
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

export function buildEncounterSummaryEmail(
  patientName: string,
  encounterId: string,
  language?: string
): EmailContent {
  const encounterUrl = `${APP_BASE_URL()}/encounters/${encounterId}`;
  if (resolveLanguage(language) === 'fr') {
    return {
      subject: 'Résumé de la consultation',
      text: `Le résumé de la consultation de ${patientName} est disponible.\n\nVoir ici : ${encounterUrl}`,
      html: `<h3>Résumé de la consultation</h3><p>Le résumé de la consultation pour <strong>${patientName}</strong> est maintenant disponible.</p><p><a href="${encounterUrl}">Voir le résumé</a></p>`,
    };
  }

  return {
    subject: 'Encounter Summary',
    text: `The encounter summary for ${patientName} is available.\n\nView it here: ${encounterUrl}`,
    html: `<h3>Encounter Summary</h3><p>The encounter summary for <strong>${patientName}</strong> is now available.</p><p><a href="${encounterUrl}">View Summary</a></p>`,
  };
}

export function buildAiSummaryReadyEmail(
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

// ============================================================
// PAYMENT & FINANCIAL TEMPLATES
// ============================================================

export function buildPaymentConfirmationEmail(
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

export function buildInvoiceEmail(
  invoiceId: string,
  patientName: string,
  amount: string,
  language?: string
): EmailContent {
  const invoiceUrl = `${APP_BASE_URL()}/invoices/${invoiceId}`;
  if (resolveLanguage(language) === 'fr') {
    return {
      subject: `Facture ${invoiceId}`,
      text: `Facture pour ${patientName} : ${amount}\n\nVoir la facture : ${invoiceUrl}`,
      html: `<h3>Facture ${invoiceId}</h3><p>Facture pour <strong>${patientName}</strong> : <strong>${amount}</strong></p><p><a href="${invoiceUrl}">Voir la facture détaillée</a></p>`,
    };
  }

  return {
    subject: `Invoice ${invoiceId}`,
    text: `Invoice for ${patientName}: ${amount}\n\nView invoice: ${invoiceUrl}`,
    html: `<h3>Invoice ${invoiceId}</h3><p>Invoice for <strong>${patientName}</strong>: <strong>${amount}</strong></p><p><a href="${invoiceUrl}">View Detailed Invoice</a></p>`,
  };
}

export function buildLowBalanceWarningEmail(
  currentBalance: string,
  assetCode: string,
  language?: string
): EmailContent {
  if (resolveLanguage(language) === 'fr') {
    return {
      subject: 'Solde faible — Veuillez reconstituer votre compte',
      text: `Votre solde en ${assetCode} est maintenant faible : ${currentBalance} ${assetCode}`,
      html: `<h3>Solde faible</h3><p>Votre solde en <strong>${assetCode}</strong> est maintenant faible :</p><p><strong>${currentBalance} ${assetCode}</strong></p><p>Veuillez reconstituer votre compte dès que possible.</p>`,
    };
  }

  return {
    subject: 'Low Balance — Please Refill Your Account',
    text: `Your balance in ${assetCode} is now low: ${currentBalance} ${assetCode}`,
    html: `<h3>Low Balance</h3><p>Your balance in <strong>${assetCode}</strong> is now low:</p><p><strong>${currentBalance} ${assetCode}</strong></p><p>Please refill your account as soon as possible.</p>`,
  };
}

// ============================================================
// DISPUTE & COMPLIANCE TEMPLATES
// ============================================================

export function buildDisputeOpenedEmail(
  paymentId: string,
  reason: string,
  language?: string
): EmailContent {
  const disputeUrl = `${APP_BASE_URL()}/disputes/${paymentId}`;
  if (resolveLanguage(language) === 'fr') {
    return {
      subject: 'Litige ouvert pour le paiement',
      text: `Un litige a été ouvert pour le paiement ${paymentId}.\n\nRaison : ${reason}\n\nVoir les détails : ${disputeUrl}`,
      html: `<h3>Litige ouvert</h3><p>Un litige a été ouvert pour le paiement <strong>${paymentId}</strong>.</p><p><strong>Raison :</strong> ${reason}</p><p><a href="${disputeUrl}">Voir les détails du litige</a></p>`,
    };
  }

  return {
    subject: 'Dispute Opened for Payment',
    text: `A dispute has been opened for payment ${paymentId}.\n\nReason: ${reason}\n\nView details: ${disputeUrl}`,
    html: `<h3>Dispute Opened</h3><p>A dispute has been opened for payment <strong>${paymentId}</strong>.</p><p><strong>Reason:</strong> ${reason}</p><p><a href="${disputeUrl}">View Dispute Details</a></p>`,
  };
}

export function buildDisputeResolvedEmail(
  paymentId: string,
  resolution: string,
  language?: string
): EmailContent {
  if (resolveLanguage(language) === 'fr') {
    return {
      subject: 'Litige résolu',
      text: `Le litige pour le paiement ${paymentId} a été résolu.\n\nRésolution : ${resolution}`,
      html: `<h3>Litige résolu</h3><p>Le litige pour le paiement <strong>${paymentId}</strong> a été résolu.</p><p><strong>Résolution :</strong> ${resolution}</p>`,
    };
  }

  return {
    subject: 'Dispute Resolved',
    text: `The dispute for payment ${paymentId} has been resolved.\n\nResolution: ${resolution}`,
    html: `<h3>Dispute Resolved</h3><p>The dispute for payment <strong>${paymentId}</strong> has been resolved.</p><p><strong>Resolution:</strong> ${resolution}</p>`,
  };
}

export function buildDataExportReadyEmail(downloadUrl: string, expiresAt: Date, language?: string): EmailContent {
  const expiresStr = expiresAt.toLocaleString(resolveLanguage(language) === 'fr' ? 'fr-FR' : 'en-US');
  if (resolveLanguage(language) === 'fr') {
    return {
      subject: 'Votre export de données est prêt',
      text: `Votre export de données patient est prêt à être téléchargé.\n\nLe lien expire le : ${expiresStr}`,
      html: `<h3>Export de données prêt</h3><p>Votre export de données patient est prêt à être téléchargé.</p><p><a href="${downloadUrl}">Télécharger mon export</a></p><p><em>Expire le ${expiresStr}</em></p>`,
    };
  }

  return {
    subject: 'Your Data Export Is Ready',
    text: `Your patient data export is ready to download.\n\nLink expires: ${expiresStr}`,
    html: `<h3>Data Export Ready</h3><p>Your patient data export is ready to download.</p><p><a href="${downloadUrl}">Download My Export</a></p><p><em>Expires ${expiresStr}</em></p>`,
  };
}

export function buildConsentNotificationEmail(
  consentType: string,
  action: 'accepted' | 'rejected' | 'updated',
  language?: string
): EmailContent {
  const locale = resolveLanguage(language);
  const actionText = {
    accepted: { fr: 'accepté', en: 'accepted' },
    rejected: { fr: 'rejeté', en: 'rejected' },
    updated: { fr: 'mis à jour', en: 'updated' },
  }[action];

  if (locale === 'fr') {
    return {
      subject: `Consentement ${actionText.fr}`,
      text: `Votre consentement pour « ${consentType} » a été ${actionText.fr}.`,
      html: `<h3>Consentement ${actionText.fr}</h3><p>Votre consentement pour <strong>${consentType}</strong> a été ${actionText.fr}.</p>`,
    };
  }

  return {
    subject: `Consent ${actionText.en}`,
    text: `Your consent for "${consentType}" has been ${actionText.en}.`,
    html: `<h3>Consent ${actionText.en}</h3><p>Your consent for <strong>${consentType}</strong> has been ${actionText.en}.</p>`,
  };
}
