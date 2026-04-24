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
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });

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
    <Card padding="lg" className="w-full max-w-[400px]">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-800">Reset your password</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      {success ? (
        <p className="bg-success-50 text-success-700 rounded-md px-3 py-2 text-sm">
          Check your email for a reset link.
        </p>
      ) : (
        <>
          {serverError && (
            <p
              role="alert"
              className="bg-danger-50 text-danger-700 mb-4 rounded-md px-3 py-2 text-sm"
            >
              {serverError}
            </p>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input
              label="Email"
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
              Send reset link
            </Button>
          </form>
        </>
      )}

      <div className="mt-4 text-center">
        <Link
          href="/login"
          className="text-primary-600 text-sm hover:underline focus:underline focus:outline-none"
        >
          Back to login
        </Link>
      </div>
    </Card>
  );
}
