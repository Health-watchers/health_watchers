import nodemailer from 'nodemailer';
import logger from '@api/utils/logger';

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST ?? 'localhost',
  port:   Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth:   process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

export async function sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
  const resetUrl = `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/reset-password?token=${resetToken}`;

  try {
    await transporter.sendMail({
      from:    process.env.SMTP_FROM ?? 'no-reply@health-watchers.app',
      to,
      subject: 'Password Reset Request',
      text:    `You requested a password reset. Use the link below (valid for 1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
      html:    `<p>You requested a password reset. Click the link below (valid for 1 hour):</p>
               <p><a href="${resetUrl}">${resetUrl}</a></p>
               <p>If you did not request this, ignore this email.</p>`,
    });
  } catch (err) {
    // Log but don't surface — caller always returns generic response
    logger.error({ err, to }, 'Failed to send password reset email');
  }
}

export async function sendVerificationEmail(to: string, verificationToken: string): Promise<void> {
  const verifyUrl = `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/verify-email?token=${verificationToken}`;

  try {
    await transporter.sendMail({
      from:    process.env.SMTP_FROM ?? 'no-reply@health-watchers.app',
      to,
      subject: 'Verify your Health Watchers account',
      text:    `Welcome! Please verify your email address by clicking the link below:\n\n${verifyUrl}\n\nIf you did not create this account, ignore this email.`,
      html:    `<p>Welcome! Please verify your email address:</p>
               <p><a href="${verifyUrl}">${verifyUrl}</a></p>
               <p>If you did not create this account, ignore this email.</p>`,
    });
  } catch (err) {
    logger.error({ err, to }, 'Failed to send verification email');
  }
}
