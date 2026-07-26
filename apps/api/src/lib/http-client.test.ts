import { fetchWithCorrelation } from './http-client';
import { withRequestId } from '../utils/request-id';
import { CORRELATION_HEADER } from '../middlewares/correlation.middleware';

const fetchSpy = jest.spyOn(global, 'fetch');

function mockFetchOk(body: unknown = {}): void {
  fetchSpy.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response);
}

describe('fetchWithCorrelation', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── Header forwarding ───────────────────────────────────────────────────────

  it('forwards the AsyncLocalStorage requestId as X-Request-ID', async () => {
    mockFetchOk();
    await withRequestId('async-req-id', async () => {
      await fetchWithCorrelation('http://stellar-service/health');
      const [, init] = fetchSpy.mock.calls[0];
      expect((init?.headers as Record<string, string>)[CORRELATION_HEADER]).toBe('async-req-id');
    });
  });

  it('uses an explicit requestId option over the stored one', async () => {
    mockFetchOk();
    await withRequestId('stored-id', async () => {
      await fetchWithCorrelation('http://stellar-service/health', { requestId: 'explicit-id' });
      const [, init] = fetchSpy.mock.calls[0];
      expect((init?.headers as Record<string, string>)[CORRELATION_HEADER]).toBe('explicit-id');
    });
  });

  it('omits X-Request-ID when no id is available', async () => {
    mockFetchOk();
    // called outside any withRequestId context — storage returns undefined
    await fetchWithCorrelation('http://stellar-service/health');
    const [, init] = fetchSpy.mock.calls[0];
    expect((init?.headers as Record<string, string>)[CORRELATION_HEADER]).toBeUndefined();
  });

  // ─── Default headers ─────────────────────────────────────────────────────────

  it('sets Content-Type: application/json by default', async () => {
    mockFetchOk();
    await fetchWithCorrelation('http://stellar-service/health');
    const [, init] = fetchSpy.mock.calls[0];
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('merges caller-supplied headers with defaults', async () => {
    mockFetchOk();
    await fetchWithCorrelation('http://stellar-service/health', {
      headers: { Authorization: 'Bearer token-xyz' },
    });
    const [, init] = fetchSpy.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Authorization']).toBe('Bearer token-xyz');
  });

  it('caller-supplied Content-Type overrides the default', async () => {
    mockFetchOk();
    await fetchWithCorrelation('http://stellar-service/health', {
      headers: { 'Content-Type': 'text/plain' },
    });
    const [, init] = fetchSpy.mock.calls[0];
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('text/plain');
  });

  // ─── URL / method / body passthrough ─────────────────────────────────────────

  it('calls fetch with the provided URL', async () => {
    mockFetchOk();
    await fetchWithCorrelation('http://stellar-service/verify/abc123');
    expect(fetchSpy).toHaveBeenCalledWith('http://stellar-service/verify/abc123', expect.any(Object));
  });

  it('forwards the HTTP method', async () => {
    mockFetchOk();
    await fetchWithCorrelation('http://stellar-service/fund', { method: 'POST' });
    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.method).toBe('POST');
  });

  it('forwards the request body', async () => {
    mockFetchOk();
    const body = JSON.stringify({ publicKey: 'GABC' });
    await fetchWithCorrelation('http://stellar-service/fund', { method: 'POST', body });
    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.body).toBe(body);
  });

  // ─── Return value / error handling ───────────────────────────────────────────

  it('returns the Response object from fetch', async () => {
    const fakeResponse = { ok: true, status: 200 } as unknown as Response;
    fetchSpy.mockResolvedValueOnce(fakeResponse);
    const result = await fetchWithCorrelation('http://stellar-service/health');
    expect(result).toBe(fakeResponse);
  });

  it('propagates fetch errors', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network failure'));
    await expect(fetchWithCorrelation('http://stellar-service/health')).rejects.toThrow('network failure');
  });

  // ─── No leakage between calls ────────────────────────────────────────────────

  it('does not leak requestId from one call to the next', async () => {
    mockFetchOk();
    mockFetchOk();

    await withRequestId('first-call-id', async () => {
      await fetchWithCorrelation('http://stellar-service/health');
    });

    // Second call is outside any context — no requestId header expected
    await fetchWithCorrelation('http://stellar-service/health');
    const [, secondInit] = fetchSpy.mock.calls[1];
    expect((secondInit?.headers as Record<string, string>)[CORRELATION_HEADER]).toBeUndefined();
  });
});
