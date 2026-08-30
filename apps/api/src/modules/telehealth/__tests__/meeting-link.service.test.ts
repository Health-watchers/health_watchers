import { createMeetingLink, verifyMeetingLink, MeetingLinkError } from '../meeting-link.service';

describe('meeting link service', () => {
  const base = {
    sessionId: '507f1f77bcf86cd799439011',
    identity: 'user-123',
    role: 'patient',
  };

  it('creates a token that round-trips through verification', () => {
    const link = createMeetingLink({ ...base, ttlSeconds: 3600 });
    expect(link.url).toContain(`token=${link.token}`);

    const payload = verifyMeetingLink(link.token);
    expect(payload.sessionId).toBe(base.sessionId);
    expect(payload.identity).toBe(base.identity);
    expect(payload.role).toBe('patient');
    expect(payload.jti).toBe(link.jti);
  });

  it('rejects an expired token', () => {
    const past = new Date(Date.now() - 10 * 60_000);
    const link = createMeetingLink({ ...base, ttlSeconds: 60, now: past });
    expect(() => verifyMeetingLink(link.token)).toThrow(MeetingLinkError);
    expect(() => verifyMeetingLink(link.token)).toThrow(/expired/i);
  });

  it('rejects a tampered payload (role escalation)', () => {
    const link = createMeetingLink({ ...base, ttlSeconds: 3600 });
    const [encoded, sig] = link.token.split('.');
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    decoded.role = 'provider';
    const forged = Buffer.from(JSON.stringify(decoded)).toString('base64url') + '.' + sig;
    expect(() => verifyMeetingLink(forged)).toThrow(/signature/i);
  });

  it('rejects a malformed token', () => {
    expect(() => verifyMeetingLink('not-a-token')).toThrow(MeetingLinkError);
  });
});
