'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function PortalLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') ?? '/portal/dashboard';
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * Validates and sanitises a returnTo URL so portal deep links can never
   * redirect to admin/staff routes. Only /portal/* paths are allowed.
   */
  function getSafeReturnTo(raw: string): string {
    if (raw && raw.startsWith('/portal/') && !raw.startsWith('/portal/login') && !raw.startsWith('/portal/mfa')) {
      return raw;
    }
    return '/portal/dashboard';
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/v1/portal/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, dateOfBirth }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.message ?? 'Invalid credentials. Please try again.');
        setLoading(false);
        return;
      }

      // Check if MFA is required
      if (json.data.mfaRequired) {
        localStorage.setItem('portalMfaTempToken', json.data.tempToken);
        localStorage.setItem('portalReturnTo', getSafeReturnTo(returnTo));
        router.push(`/portal/mfa?method=${json.data.mfaMethod}`);
        return;
      }

      // No MFA, set tokens and redirect
      localStorage.setItem('portalAccessToken', json.data.accessToken);
      localStorage.setItem('portalRefreshToken', json.data.refreshToken);
      router.push(getSafeReturnTo(returnTo));
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-center text-2xl font-bold text-blue-600">Patient Portal</h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          Sign in with your email and date of birth
        </p>

        {error && (
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="dob" className="mb-1 block text-sm font-medium text-gray-700">
              Date of birth
            </label>
            <input
              id="dob"
              type="date"
              required
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-md bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
