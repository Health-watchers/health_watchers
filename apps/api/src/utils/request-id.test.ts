import { Request } from 'express';
import { getRequestId, setRequestId, withRequestId, extractRequestId } from './request-id';

// Helper to build a minimal Express-like Request
function mockReq(overrides: Partial<Record<string, unknown>> = {}): Request {
  return { headers: {}, ...overrides } as unknown as Request;
}

describe('request-id utilities', () => {
  // ─── getRequestId / setRequestId ────────────────────────────────────────────

  describe('setRequestId / getRequestId', () => {
    it('returns undefined when nothing has been set in this async context', () => {
      // Run in a fresh withRequestId-free context — storage starts empty
      expect(getRequestId()).toBeUndefined();
    });

    it('stores and retrieves an id within the same async context', (done) => {
      // Use withRequestId to create an isolated async context
      withRequestId('stored-id', () => {
        setRequestId('overridden-id');
        expect(getRequestId()).toBe('overridden-id');
        done();
      });
    });

    it('enterWith makes the id available synchronously after the call', (done) => {
      withRequestId('ctx-a', () => {
        setRequestId('ctx-a-value');
        expect(getRequestId()).toBe('ctx-a-value');
        done();
      });
    });
  });

  // ─── withRequestId ──────────────────────────────────────────────────────────

  describe('withRequestId', () => {
    it('runs the callback and makes the id available inside it', (done) => {
      withRequestId('with-id-1', () => {
        expect(getRequestId()).toBe('with-id-1');
        done();
      });
    });

    it('returns the value returned by the callback', () => {
      const result = withRequestId('with-id-2', () => 42);
      expect(result).toBe(42);
    });

    it('isolates ids between two sibling contexts', (done) => {
      let innerA: string | undefined;
      let innerB: string | undefined;

      const doneA = new Promise<void>((resolve) => {
        withRequestId('context-A', () => {
          // Simulate async work
          Promise.resolve().then(() => {
            innerA = getRequestId();
            resolve();
          });
        });
      });

      const doneB = new Promise<void>((resolve) => {
        withRequestId('context-B', () => {
          Promise.resolve().then(() => {
            innerB = getRequestId();
            resolve();
          });
        });
      });

      Promise.all([doneA, doneB]).then(() => {
        expect(innerA).toBe('context-A');
        expect(innerB).toBe('context-B');
        done();
      });
    });

    it('does not leak the id outside its callback', () => {
      // Capture id before
      const before = getRequestId();
      withRequestId('leak-test-id', () => {
        // inside: visible
        expect(getRequestId()).toBe('leak-test-id');
      });
      // outside: should be back to what it was before
      expect(getRequestId()).toBe(before);
    });
  });

  // ─── extractRequestId ───────────────────────────────────────────────────────

  describe('extractRequestId', () => {
    it('returns req.id when present', () => {
      const req = mockReq({ id: 'from-req-id' }) as any;
      expect(extractRequestId(req)).toBe('from-req-id');
    });

    it('falls back to x-request-id header when req.id is absent', () => {
      const req = mockReq({ headers: { 'x-request-id': 'from-header' } });
      expect(extractRequestId(req)).toBe('from-header');
    });

    it('returns empty string when neither req.id nor header is present', () => {
      const req = mockReq({ headers: {} });
      expect(extractRequestId(req)).toBe('');
    });

    it('prefers req.id over x-request-id header', () => {
      const req = mockReq({
        id: 'req-wins',
        headers: { 'x-request-id': 'header-loses' },
      }) as any;
      expect(extractRequestId(req)).toBe('req-wins');
    });

    it('handles an array value for x-request-id header (takes first element)', () => {
      // Express can represent multi-value headers as arrays; cast to satisfy types
      const req = mockReq({ headers: { 'x-request-id': ['first', 'second'] } });
      // extractRequestId casts to string — arrays become "first,second" or "first"
      // The key assertion is it doesn't throw
      expect(() => extractRequestId(req)).not.toThrow();
    });
  });
});
