'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const emailValue = watch('email');

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    setServerError(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const json = await res.json();
        setServerError(json?.message ?? 'Something went wrong. Please try again.');
        return;
      }

      setSuccess(true);
    } catch {
      setServerError('Something went wrong. Please try again.');
    }
  };

  return (
    <div className="w-full max-w-md">
      <Card padding="lg" className="rounded-2xl shadow-lg">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100">
            <span className="text-2xl">🔐</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Reset Password</h1>
          <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
            Enter your email address and we'll send you a secure link to reset your password.
          </p>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-3 dark:border-success-900 dark:bg-success-900/30">
              <p className="font-medium text-success-900 dark:text-success-200">Check your email</p>
              <p className="mt-1 text-sm text-success-700 dark:text-success-300">
                We've sent a password reset link to <span className="font-semibold">{emailValue}</span>.
                The link expires in 1 hour.
              </p>
            </div>
            <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
              Didn't receive an email? Check your spam folder or{' '}
              <button
                type="button"
                onClick={() => setSuccess(false)}
                className="font-medium text-primary-600 hover:underline dark:text-primary-400"
              >
                try again
              </button>
              .
            </p>
          </div>
        ) : (
          <>
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
              <Input
                label="Email Address"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                error={errors.email?.message}
                {...register('email')}
              />

              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={isSubmitting}
                className="w-full"
              >
                Send Reset Link
              </Button>
            </form>
          </>
        )}

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="text-primary-600 text-sm font-medium hover:text-primary-700 focus:outline-none focus:underline dark:text-primary-400 dark:hover:text-primary-300"
          >
            ← Back to sign in
          </Link>
        </div>
      </Card>
    </div>
  );
}
