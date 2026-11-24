/**
 * Unit tests for mailer.ts
 *
 * nodemailer is replaced with a mock so no SMTP connection is attempted. The
 * module caches `_transporter` after the first send, so `createTransport` is
 * invoked exactly once across the whole file — the first test creates it and
 * later tests must observe it being reused.
 */
jest.mock('nodemailer', () => {
  const sendMail = jest.fn().mockResolvedValue({ messageId: 'm1' });
  const createTransport = jest.fn().mockReturnValue({ sendMail });
  // No `__esModule` marker: ts-jest compiles `import nodemailer from 'nodemailer'`
  // to `__importDefault(require(...)).default`, and with `__esModule: true` that
  // resolves to `mod.default` (undefined) instead of the module itself.
  return { createTransport, _sendMail: sendMail };
});

jest.mock('@health-watchers/config', () => ({
  config: {
    email: {
      smtp: {
        host: 'smtp.example.com',
        port: 587,
        user: 'user',
        pass: 'pass',
      },
      from: 'noreply@example.com',
    },
  },
}));

import nodemailer, { createTransport } from 'nodemailer';
import { sendMail } from './mailer';

const mockCreateTransport = createTransport as jest.Mock;
const mockSendMail = (nodemailer as unknown as { _sendMail: jest.Mock })._sendMail;

beforeEach(() => {
  mockCreateTransport.mockClear();
  mockSendMail.mockClear();
});

describe('mailer', () => {
  it('creates the transport on first send using config credentials', async () => {
    await sendMail({ to: 'a@b.co', subject: 'Hi', html: '<p>Hi</p>' });

    expect(mockCreateTransport).toHaveBeenCalledTimes(1);
    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'user', pass: 'pass' },
    });
    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'noreply@example.com',
      to: 'a@b.co',
      subject: 'Hi',
      html: '<p>Hi</p>',
    });
  });

  it('reuses the cached transporter on subsequent sends', async () => {
    await sendMail({ to: 'a@b.co', subject: '1', html: '' });
    await sendMail({ to: 'b@c.co', subject: '2', html: '' });
    expect(mockCreateTransport).toHaveBeenCalledTimes(0); // already created + cached
    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });

  it('propagates send failures to the caller', async () => {
    const err = new Error('smtp down');
    mockSendMail.mockRejectedValueOnce(err);
    await expect(sendMail({ to: 'a@b.co', subject: 'x', html: '' })).rejects.toBe(err);
    expect(mockCreateTransport).toHaveBeenCalledTimes(0);
  });
});
