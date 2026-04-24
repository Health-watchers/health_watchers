'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const mfaVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Must be a 6-digit code'),
});

type MfaVerifyFormData = z.infer<typeof mfaVerifySchema>;

export interface MfaSetupModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  qrCodeUrl: string;
  secret: string;
}

export function MfaSetupModal({ open, onClose, onSuccess, qrCodeUrl, secret }: MfaSetupModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MfaVerifyFormData>({
    resolver: zodResolver(mfaVerifySchema),
  });

  useEffect(() => {
    if (!open) {
      reset();
      setServerError(null);
    }
  }, [open, reset]);

  const onSubmit = async (data: MfaVerifyFormData) => {
    setServerError(null);
    try {
      const res = await fetch('/api/settings/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: data.code }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setServerError(body?.message ?? 'Invalid verification code. Please try again.');
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setServerError('Something went wrong. Please try again.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Set up two-factor authentication" size="md">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <p className="text-sm text-neutral-600">
          Scan the QR code below with your authenticator app (e.g. Google Authenticator, Authy).
        </p>

        <div className="flex justify-center">
          <img
            src={qrCodeUrl}
            alt="Scan this QR code with your authenticator app"
            className="h-48 w-48 rounded-md border border-neutral-200"
          />
        </div>

        <div className="rounded-md bg-neutral-50 p-3 text-sm text-neutral-700">
          <p className="mb-1 font-medium">Can&apos;t scan? Enter this code manually:</p>
          <code className="font-mono text-xs break-all text-neutral-800">{secret}</code>
        </div>

        <Input
          label="Verification code"
          placeholder="000000"
          inputMode="numeric"
          maxLength={6}
          autoComplete="one-time-code"
          error={errors.code?.message}
          {...register('code')}
        />

        {serverError && (
          <p role="alert" className="text-danger-500 text-sm">
            {serverError}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Verify &amp; Enable
          </Button>
        </div>
      </form>
    </Modal>
  );
}
