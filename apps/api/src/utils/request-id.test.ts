/**
 * Unit tests for request-id.ts
 */
import { setRequestId, getRequestId, withRequestId, extractRequestId } from './request-id';
import type { Request } from 'express';

describe('AsyncLocalStorage request id helpers', () => {
  it('returns undefined when no request id is active', () => {
    expect(getRequestId()).toBeUndefined();
  });

  it('provides the id inside withRequestId scope', () => {
    const id = withRequestId('abc-123', () => getRequestId());
    expect(id).toBe('abc-123');
  });

  it('restores the outer id after nested scopes', () => {
    withRequestId('outer', () => {
      const inner = withRequestId('inner', () => getRequestId());
      expect(inner).toBe('inner');
      expect(getRequestId()).toBe('outer');
    });
  });

  it('async code inside the scope still sees the id', async () => {
    const value = await withRequestId('abc', async () => {
      await Promise.resolve();
      return getRequestId();
    });
    expect(value).toBe('abc');
  });
});

describe('setRequestId', () => {
  it('sets the request id for code that runs after it', () => {
    setRequestId('set-id');
    expect(getRequestId()).toBe('set-id');
  });
});

describe('extractRequestId', () => {
  it('prefers express res.locals id if present', () => {
    const req = { id: 'req-id', headers: { 'x-request-id': 'header-id' } } as unknown as Request;
    expect(extractRequestId(req)).toBe('req-id');
  });

  it('falls back to the x-request-id header', () => {
    const req = { headers: { 'x-request-id': 'header-id' } } as unknown as Request;
    expect(extractRequestId(req)).toBe('header-id');
  });

  it('returns empty string when neither is present', () => {
    const req = { headers: {} } as unknown as Request;
    expect(extractRequestId(req)).toBe('');
  });
});
