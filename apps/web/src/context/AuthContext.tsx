'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

export type AppRole = 'SUPER_ADMIN' | 'CLINIC_ADMIN' | 'DOCTOR' | 'NURSE' | 'ASSISTANT' | 'READ_ONLY';

interface AuthUser {
  userId: string;
  name: string;
  email: string;
  role: AppRole;
  clinicId: string;
  clinicName: string | null;
  avatarInitials: string;
  mfaEnabled: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  setUser: (user: AuthUser | null) => void;
  login: (email: string, password: string) => Promise<{ mfaRequired: boolean; tempToken?: string }>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  setUser: () => {},
  login: async () => ({ mfaRequired: false }),
  logout: async () => {},
  refreshToken: async () => false,
});

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('');
}

function mapUserData(data: Record<string, unknown>): AuthUser {
  const name = (data.fullName as string) ?? '';
  return {
    userId: (data.userId as string) ?? '',
    name,
    email: data.email as string,
    role: data.role as AppRole,
    clinicId: data.clinic as string,
    clinicName: (data.clinicName as string | null) ?? null,
    avatarInitials: getInitials(name),
    mfaEnabled: (data.mfaEnabled as boolean) ?? false,
  };
}

// Access token expires in 15 min; refresh 1 min before expiry
const REFRESH_INTERVAL_MS = 14 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleRefresh = useCallback(
    (onRefreshFail: () => void) => {
      clearRefreshTimer();
      refreshTimerRef.current = setTimeout(async () => {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (res.ok) {
          // Schedule the next refresh cycle
          scheduleRefresh(onRefreshFail);
        } else {
          onRefreshFail();
        }
      }, REFRESH_INTERVAL_MS);
    },
    [clearRefreshTimer],
  );

  const logout = useCallback(async () => {
    clearRefreshTimer();
    try {
      // Best-effort: tell the backend to invalidate the refresh token stored in the cookie
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // ignore
    }
    setUser(null);
    router.push('/login');
  }, [clearRefreshTimer, router]);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    return res.ok;
  }, []);

  // On mount, try to restore session from the httpOnly cookie via /api/settings/me
  useEffect(() => {
    fetch('/api/settings/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data) {
          setUser(mapUserData(data.data));
          scheduleRefresh(logout);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => clearRefreshTimer();
  }, [scheduleRefresh, logout, clearRefreshTimer]);

  const login = useCallback(
    async (email: string, password: string): Promise<{ mfaRequired: boolean; tempToken?: string }> => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const json = await res.json();

      if (!res.ok) {
        const message = json?.message ?? 'Invalid email or password.';
        throw new Error(message);
      }

      // MFA flow: backend returns status 'mfa_required'
      if (json?.status === 'mfa_required' || json?.data?.mfaRequired) {
        return { mfaRequired: true, tempToken: json?.data?.tempToken };
      }

      // Fetch user profile now that cookies are set
      const meRes = await fetch('/api/settings/me', { credentials: 'include' });
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData?.data) {
          setUser(mapUserData(meData.data));
          scheduleRefresh(logout);
        }
      }

      return { mfaRequired: false };
    },
    [scheduleRefresh, logout],
  );

  return (
    <AuthContext.Provider value={{ user, loading, setUser, login, logout, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
