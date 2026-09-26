'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PasswordStrengthIndicator } from '@/components/ui/PasswordStrengthIndicator';

const registerSchema = z
  .object({
    email: z.string().min(1, 'Email is required').email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[a-z]/, 'Must contain a lowercase letter')
      .regex(/[0-9]/, 'Must contain a number')
      .regex(/[^A-Za-z0-9]/, 'Must contain a special character'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterClient() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'verify'>('form');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    mode: 'onChange',
  });

  const passwordValue = watch('password');

  const onSubmit = async (data: RegisterFormValues) => {
    setServerError(null);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Registration failed');
      }

      setStep('verify');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    }
  };

  if (step === 'verify') {
    return (
      <div className="w-full max-w-md">
        <Card padding="lg" className="rounded-2xl shadow-lg">
          <div className="mb-8 flex flex-col items-center gap-4">
            <div className="bg-success-100 flex h-12 w-12 items-center justify-center rounded-full">
              <span className="text-2xl">✓</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
                Verify Your Email
              </h1>
              <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
                We've sent a verification link to your email address. Click the link to activate
                your account.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
              Didn't receive the email? Check your spam folder or{' '}
              <button
                type="button"
                onClick={() => setStep('form')}
                className="dark:text-primary-400 font-medium text-primary-600 hover:underline"
              >
                try again
              </button>
              .
            </p>

            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/login')}
              className="w-full"
            >
              Back to sign in
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <Card padding="lg" className="rounded-2xl shadow-lg">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100">
            <span className="text-2xl">⚕️</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
            Create Account
          </h1>
          <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
            Join Health Watchers to manage your healthcare
          </p>
        </div>

        {serverError && (
          <div
            role="alert"
            className="border-danger-200 bg-danger-50 text-danger-700 dark:border-danger-900 dark:bg-danger-900/30 dark:text-danger-400 mb-4 rounded-lg border px-4 py-3 text-sm"
          >
            <p className="font-medium">Registration Error</p>
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

          <div className="space-y-2">
            <PasswordInput
              label="Password"
              placeholder="••••••••"
              autoComplete="new-password"
              error={errors.password?.message}
              {...register('password')}
            />
            <PasswordStrengthIndicator password={passwordValue} />
          </div>

          <PasswordInput
            label="Confirm Password"
            placeholder="••••••••"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={isSubmitting}
            className="w-full"
          >
            Create Account
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="flex-1 border-t border-neutral-200 dark:border-neutral-700" />
          <span className="text-xs text-neutral-500 dark:text-neutral-400">Or sign up with</span>
          <div className="flex-1 border-t border-neutral-200 dark:border-neutral-700" />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
            title="Social login not yet implemented"
          >
            Google
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
            title="Social login not yet implemented"
          >
            Apple
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-400">
          Already have an account?{' '}
          <Link
            href="/login"
            className="dark:text-primary-400 dark:hover:text-primary-300 font-medium text-primary-600 hover:text-primary-700"
          >
            Sign in
          </Link>
        </p>
      </Card>

      <p className="mt-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
        By signing up, you agree to our Terms of Service and Privacy Policy • HIPAA Compliant
      </p>
    </div>
  );
}
