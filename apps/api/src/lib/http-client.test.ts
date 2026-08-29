/**
 * Unit tests for lib/http-client.ts
 *
 * global fetch is stubbed so no real network call is made.
 */
import { fetchWithCorrelation } from './http-client';

const ORIGINAL_FETCH = global.fetch;

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  global.fetch = jest.fn(impl) as unknown as typeof fetch;
}

afterAll(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe('fetchWithCorrelation', () => {
  it('forwards the correlation header from the active request id', async () => {
    mockFetch(async (url, init) => new Response(null, { status: 200 }));

    // Establish an active request id via async context.
    const { withRequestId } = await import('@api/utils/request-id');
    await withRequestId('corr-123', async () => {
      await fetchWithCorrelation('https://api.example/stellar/accounts');
    });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.example/stellar/accounts');
    expect((init.headers as Record<string, string>)['x-request-id']).toBe('corr-123');
  });

  it('explicit requestId takes precedence over the active context', async () => {
    mockFetch(async () => new Response(null, { status: 200 }));
    await import('@api/utils/request-id').then(async ({ withRequestId }) => {
      await withRequestId('ctx-id', () =>
        fetchWithCorrelation('https://api.example/x', { requestId: 'explicit-id' })
      );
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect((init.headers as Record<string, string>)['x-request-id']).toBe('explicit-id');
  });

  it('sets a default JSON content-type header', async () => {
    mockFetch(async () => new Response(null, { status: 200 }));
    await fetchWithCorrelation('https://api.example/x');
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('merges caller-supplied headers and passes through other options', async () => {
    mockFetch(async () => new Response(null, { status: 200 }));
    await fetchWithCorrelation('https://api.example/x', {
      method: 'POST',
      body: '{}',
      headers: { Authorization: 'Bearer t' } as unknown as HeadersInit,
    });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer t');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
  });

  it('omits the correlation header when no request id is available', async () => {
    mockFetch(async () => new Response(null, { status: 200 }));
    // Clear any ambient context by running without withRequestId wrapper.
    await fetchWithCorrelation('https://api.example/x');
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-request-id']).toBeUndefined();
  });
});
