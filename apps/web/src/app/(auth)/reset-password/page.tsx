'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PasswordStrengthIndicator } from '@/components/ui/PasswordStrengthIndicator';

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(12, 'At least 12 characters')
      .regex(/[A-Z]/, 'One uppercase letter required')
      .regex(/[a-z]/, 'One lowercase letter required')
      .regex(/[0-9]/, 'One digit required')
      .regex(/[^A-Za-z0-9]/, 'One special character required'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const passwordValue = useWatch({ control, name: 'password', defaultValue: '' });

  if (!token) {
    return (
      <Card padding="lg" className="w-full max-w-[400px]">
        <p role="alert" className="mb-4 rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
          Invalid or missing reset token.
        </p>
        <Link
          href="/forgot-password"
          className="text-sm text-primary-600 hover:underline focus:outline-none focus:underline"
        >
          Request a new reset link
        </Link>
      </Card>
    );
  }

  const onSubmit = async (data: ResetPasswordFormValues) => {
    setServerError(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: data.password }),
      });

      if (!res.ok) {
        const json = await res.json();
        setServerError(json?.message ?? 'Something went wrong. Please try again.');
        return;
      }

      router.push('/login?reset=success');
    } catch {
      setServerError('Something went wrong. Please try again.');
    }
  };

  return (
    <Card padding="lg" className="w-full max-w-[400px]">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-800">Set new password</h1>
        <p className="mt-1 text-sm text-neutral-500">Choose a strong password for your account.</p>
      </div>

      {serverError && (
        <p role="alert" className="mb-4 rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {serverError}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <div>
          <PasswordInput
            label="New password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <PasswordStrengthIndicator password={passwordValue} />
        </div>

        <PasswordInput
          label="Confirm password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button type="submit" variant="primary" size="md" loading={isSubmitting} className="w-full">
          Reset password
        </Button>
      </form>
    </Card>
  );
}
