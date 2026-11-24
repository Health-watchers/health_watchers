'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { OtpInput } from '@/components/ui/OtpInput';
import { MfaMethod, mapUserData, useAuth } from '@/context/AuthContext';
import { passkeyErrorMessage, passkeysSupported, signInWithPasskey } from '@/lib/passkeys';

export default function MfaPage() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [code, setCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [methods, setMethods] = useState<MfaMethod[]>(['totp']);

  useEffect(() => {
    const stored = sessionStorage.getItem('mfa_temp_token');
    if (!stored) {
      // No temp token means user navigated here directly — send back to login
      router.replace('/login');
      return;
    }
    setTempToken(stored);
    try {
      const storedMethods = JSON.parse(sessionStorage.getItem('mfa_methods') ?? 'null');
      if (Array.isArray(storedMethods) && storedMethods.length > 0) setMethods(storedMethods);
    } catch {
      // keep the TOTP default
    }
  }, [router]);

  const finishSignIn = async () => {
    // Clear the temp token now that we have real tokens
    sessionStorage.removeItem('mfa_temp_token');
    sessionStorage.removeItem('mfa_methods');

    // Fetch user profile now that cookies are set
    const meRes = await fetch('/api/settings/me', { credentials: 'include' });
    if (meRes.ok) {
      const meData = await meRes.json();
      if (meData?.data) {
        setUser(mapUserData(meData.data));
      }
    }

    router.push('/');
  };

  const postSecondFactor = async (url: string, body: Record<string, string>) => {
    if (!tempToken) return;
    setServerError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tempToken, ...body }),
      });

      const json = await res.json();

      if (!res.ok) {
        setServerError(json?.message ?? 'Invalid code. Please try again.');
        return;
      }

      await finishSignIn();
    } catch {
      setServerError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submit = async (value: string) => {
    if (value.length !== 6) return;
    await postSecondFactor('/api/auth/mfa/challenge', { totp: value });
  };

  const submitBackupCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupCode.trim()) return;
    await postSecondFactor('/api/auth/mfa/backup', { backupCode: backupCode.trim() });
  };

  const handlePasskey = async () => {
    if (!tempToken) return;
    setServerError(null);
    setIsSubmitting(true);
    try {
      await signInWithPasskey(tempToken);
      await finishSignIn();
    } catch (err) {
      setServerError(passkeyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (value: string) => {
    setCode(value);
    if (value.length === 6) {
      submit(value);
    }
  };

  const hasTotp = methods.includes('totp');
  const hasPasskey = methods.includes('passkey') && passkeysSupported();

  return (
    <Card padding="lg" className="w-full max-w-[400px]">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-800">Two-factor authentication</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {useBackupCode
            ? 'Enter one of your backup codes.'
            : hasTotp
              ? 'Enter the 6-digit code from your authenticator app.'
              : 'Confirm it’s you with your passkey.'}
        </p>
      </div>

      {serverError && (
        <p role="alert" className="bg-danger-50 text-danger-700 mb-4 rounded-md px-3 py-2 text-sm">
          {serverError}
        </p>
      )}

      <div className="flex flex-col gap-6">
        {useBackupCode ? (
          <form onSubmit={submitBackupCode} className="flex flex-col gap-4">
            <input
              aria-label="Backup code"
              autoComplete="one-time-code"
              className="rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm"
              value={backupCode}
              onChange={(e) => setBackupCode(e.target.value)}
              disabled={isSubmitting || !tempToken}
            />
            <Button type="submit" variant="primary" size="md" loading={isSubmitting}>
              Verify backup code
            </Button>
          </form>
        ) : (
          <>
            {hasTotp && (
              <>
                <OtpInput
                  value={code}
                  onChange={handleChange}
                  disabled={isSubmitting || !tempToken}
                />

                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  loading={isSubmitting}
                  className="w-full"
                  onClick={() => submit(code)}
                >
                  Verify
                </Button>
              </>
            )}

            {hasPasskey && (
              <Button
                type="button"
                variant={hasTotp ? 'outline' : 'primary'}
                size="md"
                loading={isSubmitting}
                className="w-full"
                onClick={handlePasskey}
              >
                🔐 Use a passkey
              </Button>
            )}
          </>
        )}

        {methods.includes('backup_code') && (
          <button
            type="button"
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
            onClick={() => {
              setServerError(null);
              setUseBackupCode((v) => !v);
            }}
          >
            {useBackupCode ? 'Use another method' : 'Use a backup code'}
          </button>
        )}
      </div>
    </Card>
  );
}
