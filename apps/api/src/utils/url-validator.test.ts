/**
 * Unit tests for url-validator.ts
 */
import { isBlockedHost, validateWebhookUrl } from './url-validator';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function setNodeEnv(value: string) {
  process.env.NODE_ENV = value;
}

afterAll(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('isBlockedHost', () => {
  it.each([
    ['10.0.0.1', true],
    ['172.16.5.4', true],
    ['172.31.255.255', true],
    ['192.168.1.10', true],
    ['127.0.0.1', true],
    ['169.254.1.1', true],
    ['0.0.0.0', true],
    ['::1', true],
    ['fc00::1', true],
    ['fe80::1', true],
    ['93.184.216.34', false],
    ['8.8.8.8', false],
    ['example.com', false],
    ['api.stripe.com', false],
  ])('%s → blocked=%j', (hostname, expected) => {
    expect(isBlockedHost(hostname)).toBe(expected);
  });

  it('does not block 172.15.x.x (outside 172.16–172.31 range)', () => {
    expect(isBlockedHost('172.15.0.1')).toBe(false);
  });

  it('does not block 172.32.x.x', () => {
    expect(isBlockedHost('172.32.0.1')).toBe(false);
  });
});

describe('validateWebhookUrl', () => {
  it('rejects a malformed URL', () => {
    expect(validateWebhookUrl('not a url')).toEqual({
      valid: false,
      reason: 'Invalid URL',
    });
  });

  it('accepts a valid https URL in production', () => {
    setNodeEnv('production');
    expect(validateWebhookUrl('https://hooks.example.com/callback')).toEqual({ valid: true });
  });

  it('rejects http URLs in production', () => {
    setNodeEnv('production');
    expect(validateWebhookUrl('http://hooks.example.com/callback')).toEqual({
      valid: false,
      reason: 'Only HTTPS URLs are allowed',
    });
  });

  it('allows http URLs outside production', () => {
    setNodeEnv('test');
    expect(validateWebhookUrl('http://hooks.example.com/callback')).toEqual({ valid: true });
  });

  it('blocks private IP hostnames (SSRF guard)', () => {
    setNodeEnv('development');
    expect(validateWebhookUrl('https://169.254.169.254/latest/meta-data/')).toEqual({
      valid: false,
      reason: 'URL resolves to a blocked IP range',
    });
  });

  it('blocks localhost hostname', () => {
    setNodeEnv('test');
    expect(validateWebhookUrl('https://localhost:3000/hook')).toEqual({
      valid: false,
      reason: 'URL resolves to a blocked IP range',
    });
  });
});
