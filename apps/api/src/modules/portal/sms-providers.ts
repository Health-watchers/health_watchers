/**
 * SMS Provider abstraction (Issue #1430)
 *
 * Defines a common interface for SMS delivery, with three concrete implementations:
 *   - ConsoleSmsProvider  – logs to stdout (local development / test)
 *   - TwilioSmsProvider   – uses the Twilio REST API (requires twilio SDK)
 *   - SnsSmsProvider      – uses AWS SNS HTTP API via @aws-sdk/client-sns
 *
 * Provider selection is driven by the SMS_PROVIDER env var.
 */

import logger from '@api/utils/logger';

// ── Interface ─────────────────────────────────────────────────────────────────

export interface SmsDeliveryResult {
  messageId: string;
  status: 'sent' | 'failed';
  rawResponse?: unknown;
}

export interface SmsProvider {
  /**
   * Send an SMS message to a phone number.
   * @param to   E.164 format phone number, e.g. +15551234567
   * @param body Message text (≤ 160 chars for single SMS)
   */
  send(to: string, body: string): Promise<SmsDeliveryResult>;
}

// ── Console provider (local dev / CI) ─────────────────────────────────────────

export class ConsoleSmsProvider implements SmsProvider {
  async send(to: string, body: string): Promise<SmsDeliveryResult> {
    const messageId = `console_${Date.now()}`;
    logger.info({ to, body, messageId }, '[SMS:console] Sending SMS (development)');
    // eslint-disable-next-line no-console
    console.log(`\n📱 [SMS] To: ${to}\n   Body: ${body}\n   ID: ${messageId}\n`);
    return { messageId, status: 'sent' };
  }
}

// ── Twilio provider ───────────────────────────────────────────────────────────

/**
 * Twilio SMS provider.
 *
 * Requires env vars:
 *   TWILIO_ACCOUNT_SID   – your Twilio Account SID
 *   TWILIO_AUTH_TOKEN    – your Twilio Auth Token
 *   TWILIO_PHONE_NUMBER  – the "from" number in E.164 format
 *
 * Also requires the `twilio` npm package:
 *   npm install twilio --workspace=api
 *
 * The twilio package is an optional peer dependency; a runtime error is thrown
 * if SMS_PROVIDER=twilio but the package is not installed.
 */
export class TwilioSmsProvider implements SmsProvider {
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;

  constructor(accountSid: string, authToken: string, fromNumber: string) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.fromNumber = fromNumber;
  }

  async send(to: string, body: string): Promise<SmsDeliveryResult> {
    // Dynamic import so the module can load without the twilio package installed
    // (other providers will be used in that case).
    let twilio: any;
    try {
      twilio = (await import('twilio')).default;
    } catch {
      throw new Error(
        'Twilio provider selected (SMS_PROVIDER=twilio) but the "twilio" npm package is not installed. ' +
          'Run: npm install twilio --workspace=api'
      );
    }

    const client = twilio(this.accountSid, this.authToken);
    const message = await client.messages.create({
      body,
      from: this.fromNumber,
      to,
    });

    logger.info({ to, messageId: message.sid, status: message.status }, '[SMS:twilio] Sent');
    return {
      messageId: message.sid,
      status: message.status === 'queued' || message.status === 'sent' ? 'sent' : 'failed',
      rawResponse: { status: message.status },
    };
  }
}

// ── AWS SNS provider ──────────────────────────────────────────────────────────

/**
 * AWS SNS SMS provider.
 *
 * Requires env vars:
 *   AWS_REGION           – AWS region (e.g. us-east-1)
 *   AWS_ACCESS_KEY_ID    – AWS access key (optional if using IAM role)
 *   AWS_SECRET_ACCESS_KEY – AWS secret key (optional if using IAM role)
 *
 * Uses @aws-sdk/client-sns which is available via the @aws-sdk/client-s3 peer.
 * If not installed, install it with:
 *   npm install @aws-sdk/client-sns --workspace=api
 */
export class SnsSmsProvider implements SmsProvider {
  private readonly region: string;

  constructor(region: string) {
    this.region = region;
  }

  async send(to: string, body: string): Promise<SmsDeliveryResult> {
    let SNSClient: any, PublishCommand: any;
    try {
      const sns = await import('@aws-sdk/client-sns' as any);
      SNSClient = sns.SNSClient;
      PublishCommand = sns.PublishCommand;
    } catch {
      throw new Error(
        'SNS provider selected (SMS_PROVIDER=sns) but @aws-sdk/client-sns is not installed. ' +
          'Run: npm install @aws-sdk/client-sns --workspace=api'
      );
    }

    const client = new SNSClient({ region: this.region });
    const command = new PublishCommand({
      PhoneNumber: to,
      Message: body,
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional',
        },
      },
    });

    const response = await client.send(command);
    const messageId = response.MessageId ?? `sns_${Date.now()}`;
    logger.info({ to, messageId }, '[SMS:sns] Sent');
    return { messageId, status: 'sent', rawResponse: response };
  }
}
