import { logCommunicationSchema, listCommunicationsSchema } from '../communication.validation';

describe('logCommunicationSchema', () => {
  const valid = {
    channel: 'sms',
    direction: 'outbound',
    content: 'Hello',
    status: 'sent',
    sentAt: '2026-01-01T00:00:00.000Z',
  };

  it('accepts a valid payload', () => {
    expect(logCommunicationSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects empty content', () => {
    expect(logCommunicationSchema.safeParse({ ...valid, content: '' }).success).toBe(false);
  });

  it('rejects an invalid channel', () => {
    expect(logCommunicationSchema.safeParse({ ...valid, channel: 'fax' }).success).toBe(false);
  });

  it('coerces sentAt into a Date', () => {
    const result = logCommunicationSchema.parse(valid);
    expect(result.sentAt).toBeInstanceOf(Date);
  });
});

describe('listCommunicationsSchema', () => {
  it('applies default pagination values', () => {
    const result = listCommunicationsSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('rejects a limit above 100', () => {
    expect(listCommunicationsSchema.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('coerces string page/limit query params to numbers', () => {
    const result = listCommunicationsSchema.parse({ page: '2', limit: '10' });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
  });
});
