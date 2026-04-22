'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { OtpInput } from '@/components/ui/OtpInput';

export default function MfaPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (value: string) => {
    if (value.length !== 6) return;
    setServerError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: value }),
      });

      const json = await res.json();

      if (!res.ok) {
        setServerError(json?.message ?? 'Invalid code. Please try again.');
        return;
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
        <OtpInput value={code} onChange={handleChange} disabled={isSubmitting} />

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
