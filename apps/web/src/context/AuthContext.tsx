'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

export type AppRole = 'SUPER_ADMIN' | 'CLINIC_ADMIN' | 'DOCTOR' | 'NURSE' | 'ASSISTANT' | 'READ_ONLY';

interface AuthUser {
  userId: string;
  name: string;
  role: AppRole;
  clinicName: string;
  avatarInitials: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
}

const AuthContext = createContext<AuthContextValue>({ user: null, setUser: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  // Stub: replace with real session/JWT logic
  const [user, setUser] = useState<AuthUser | null>({
    userId: '1',
    name: 'Dr. Mitchell',
    role: 'DOCTOR',
    clinicName: 'Health Watchers Clinic',
    avatarInitials: 'DM',
  });

  return <AuthContext.Provider value={{ user, setUser }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
