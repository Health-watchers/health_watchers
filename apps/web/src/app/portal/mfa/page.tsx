'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function PortalMFAVerification() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mfaMethod, setMfaMethod] = useState<'totp' | 'sms' | null>(null);
  const [useBackupCode, setUseBackupCode] = useState(false);

  useEffect(() => {
    const method = searchParams.get('method') as 'totp' | 'sms' | null;
    setMfaMethod(method);
  }, [searchParams]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const tempToken = localStorage.getItem('portalMfaTempToken');
      if (!tempToken) {
        setError('Session expired. Please log in again.');
        router.push('/portal/login');
        return;
      }

      const response = await fetch('/api/v1/portal/auth/mfa/verify-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.replace(/\D/g, ''),
          tempToken,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Invalid verification code');
        setLoading(false);
        return;
      }

      const data = await response.json();
      localStorage.setItem('portalAccessToken', data.data.accessToken);
      localStorage.setItem('portalRefreshToken', data.data.refreshToken);
      localStorage.removeItem('portalMfaTempToken');

      router.push('/portal/dashboard');
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error(err);
      setLoading(false);
    }
  };

  const handleBackupCodeToggle = () => {
    setUseBackupCode(!useBackupCode);
    setCode('');
    setError(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">Verify Your Identity</h1>
          <p className="text-gray-600">
            {useBackupCode
              ? 'Enter one of your backup codes'
              : mfaMethod === 'sms'
                ? 'Enter the code sent to your phone'
                : 'Enter the code from your authenticator app'}
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-6">
          <div>
            <label htmlFor="code" className="mb-2 block text-sm font-medium text-gray-700">
              {useBackupCode ? 'Backup Code' : 'Verification Code'}
            </label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                setCode(useBackupCode ? val.slice(0, 32) : val.slice(0, 6));
              }}
              placeholder={useBackupCode ? 'Enter backup code' : '000000'}
              maxLength={useBackupCode ? 32 : 6}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center font-mono text-2xl tracking-widest focus:ring-2 focus:ring-blue-500 focus:outline-none"
              autoFocus
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading || code.length < (useBackupCode ? 8 : 6)}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>

        <div className="mt-6 border-t border-gray-200 pt-6">
          <button
            onClick={handleBackupCodeToggle}
            className="w-full text-center text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            {useBackupCode ? 'Use verification code instead' : 'Use backup code instead'}
          </button>
        </div>

        <div className="mt-4 text-center">
          <Link href="/portal/login" className="text-sm text-gray-600 hover:text-gray-900">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
