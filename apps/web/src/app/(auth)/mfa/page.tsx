'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { OtpInput } from '@/components/ui/OtpInput';
import { useAuth } from '@/context/AuthContext';

function mapUserData(data: Record<string, unknown>) {
  const name = (data.fullName as string) ?? '';
  return {
    userId: (data.userId as string) ?? '',
    name,
    email: data.email as string,
    role: data.role as import('@/context/AuthContext').AppRole,
    clinicId: data.clinic as string,
    clinicName: (data.clinicName as string | null) ?? null,
    avatarInitials: name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((n: string) => n[0].toUpperCase())
      .join(''),
    mfaEnabled: (data.mfaEnabled as boolean) ?? false,
  };
}

export default function MfaPage() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [code, setCode] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('mfa_temp_token');
    if (!stored) {
      // No temp token means user navigated here directly — send back to login
      router.replace('/login');
      return;
    }
    setTempToken(stored);
  }, [router]);

  const submit = async (value: string) => {
    if (value.length !== 6 || !tempToken) return;
    setServerError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/mfa/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tempToken, totp: value }),
      });

      const json = await res.json();

      if (!res.ok) {
        setServerError(json?.message ?? 'Invalid code. Please try again.');
        return;
      }

      // Clear the temp token now that we have real tokens
      sessionStorage.removeItem('mfa_temp_token');

      // Fetch user profile now that cookies are set
      const meRes = await fetch('/api/settings/me', { credentials: 'include' });
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData?.data) {
          setUser(mapUserData(meData.data));
        }
      }

      router.push('/');
    } catch {
      setServerError('Something went wrong. Please try again.');
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

  return (
    <Card padding="lg" className="w-full max-w-[400px]">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-800">Two-factor authentication</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Enter the 6-digit code from your authenticator app.
        </p>
      </div>

      {serverError && (
        <p role="alert" className="mb-4 rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {serverError}
        </p>
      )}

      <div className="flex flex-col gap-6">
        <OtpInput value={code} onChange={handleChange} disabled={isSubmitting || !tempToken} />

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
      </div>
    </Card>
  );
}
