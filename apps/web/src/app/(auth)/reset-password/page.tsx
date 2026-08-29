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
      .min(8, 'At least 8 characters')
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
      <div className="w-full max-w-md">
        <Card padding="lg" className="rounded-2xl shadow-lg">
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-danger-100">
              <span className="text-2xl">⚠️</span>
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Invalid Link</h1>
          </div>
          <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
            This password reset link is invalid or has expired.
          </p>
          <Link
            href="/forgot-password"
            className="mt-6 block rounded-lg bg-primary-600 px-4 py-2 text-center font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:hover:bg-primary-500"
          >
            Request a new reset link
          </Link>
        </Card>
      </div>
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
    <div className="w-full max-w-md">
      <Card padding="lg" className="rounded-2xl shadow-lg">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100">
            <span className="text-2xl">🔑</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Set New Password</h1>
          <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
            Create a strong password to secure your account
          </p>
        </div>

        {serverError && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700 dark:border-danger-900 dark:bg-danger-900/30 dark:text-danger-400"
          >
            <p className="font-medium">Error</p>
            <p className="mt-1">{serverError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div className="space-y-2">
            <PasswordInput
              label="New Password"
              autoComplete="new-password"
              error={errors.password?.message}
              {...register('password')}
            />
            <PasswordStrengthIndicator password={passwordValue} />
          </div>

          <PasswordInput
            label="Confirm Password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <Button type="submit" variant="primary" size="md" loading={isSubmitting} className="w-full">
            Update Password
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-neutral-600 dark:text-neutral-400">
          Remember your password?{' '}
          <Link
            href="/login"
            className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
