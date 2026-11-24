import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../AuthContext';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

function renderWithAuth(queryClient: QueryClient) {
  let auth!: ReturnType<typeof useAuth>;
  function Capture() {
    auth = useAuth();
    return null;
  }
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Capture />
      </AuthProvider>
    </QueryClientProvider>
  );
  return () => auth;
}

beforeEach(() => {
  jest.clearAllMocks();
  // /api/settings/me on mount → not signed in; /api/auth/logout → ok
  global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as jest.Mock;
  sessionStorage.setItem('mfa_temp_token', 'temp');
});

describe('AuthProvider logout', () => {
  it('clears cached protected data and redirects after an idle timeout', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['patients'], [{ firstName: 'Jane' }]);
    const getAuth = renderWithAuth(queryClient);

    await act(async () => {
      await getAuth().logout({ reason: 'idle_timeout' });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: 'idle_timeout' }) })
    );
    expect(queryClient.getQueryData(['patients'])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(sessionStorage.getItem('mfa_temp_token')).toBeNull();
    expect(getAuth().user).toBeNull();
    expect(mockRouter.replace).toHaveBeenCalledWith('/login?session=expired');
  });

  it('also clears the cache on a regular sign-out', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['me'], { fullName: 'Dr. Grey' });
    const getAuth = renderWithAuth(queryClient);

    await act(async () => {
      await getAuth().logout();
    });

    expect(queryClient.getQueryData(['me'])).toBeUndefined();
    expect(mockRouter.push).toHaveBeenCalledWith('/login');
  });
});
