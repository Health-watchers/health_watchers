import nodemailer, { Transporter } from 'nodemailer';
import { config } from '@health-watchers/config';

export interface MailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.port === 465,
      auth: {
        user: config.email.smtp.user,
        pass: config.email.smtp.pass,
      },
    });
  }
  return _transporter;
}

/**
 * Send an email directly (use via queue in production).
 * Throws on failure — callers should catch and log.
 */
export async function sendMail(opts: MailOptions): Promise<void> {
  await getTransporter().sendMail({
    from: config.email.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}
