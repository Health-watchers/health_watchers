'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true, setUser: () => {} });

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/settings/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data) {
          const name = data.data.fullName ?? '';
          setUser({
            userId: data.data.userId ?? '',
            name,
            email: data.data.email,
            role: data.data.role,
            clinicId: data.data.clinic,
            clinicName: data.data.clinicName ?? null,
            avatarInitials: getInitials(name),
            mfaEnabled: data.data.mfaEnabled ?? false,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return <AuthContext.Provider value={{ user, loading, setUser }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
