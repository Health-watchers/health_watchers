import { apiFetch } from '../api';

describe('apiFetch', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    document.cookie = '';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success' }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends requests with credentials: "include" so the CSRF/session cookie reaches a cross-origin API', async () => {
    await apiFetch('/patients');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('attaches X-CSRF-Token from the csrf-token cookie on mutating requests', async () => {
    document.cookie = 'csrf-token=abc123';

    await apiFetch('/patients', { method: 'POST', body: JSON.stringify({}) });

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers['X-CSRF-Token']).toBe('abc123');
    expect(options.credentials).toBe('include');
  });

  it('does not attach X-CSRF-Token on GET requests', async () => {
    document.cookie = 'csrf-token=abc123';

    await apiFetch('/patients');

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers['X-CSRF-Token']).toBeUndefined();
  });
});
