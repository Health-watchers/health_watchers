'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { mapUserData, useAuth } from '@/context/AuthContext';
import { passkeyErrorMessage, passkeysSupported, signInWithPasskey } from '@/lib/passkeys';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, setUser } = useAuth();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') ?? '/';
  const sessionExpired = searchParams.get('session') === 'expired';
  const [serverError, setServerError] = useState<string | null>(null);
  const [passkeyPending, setPasskeyPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setServerError(null);
    try {
      const result = await login(data.email, data.password);

      if (result.mfaRequired) {
        if (result.tempToken) {
          sessionStorage.setItem('mfa_temp_token', result.tempToken);
        }
        sessionStorage.setItem('mfa_methods', JSON.stringify(result.methods ?? ['totp']));
        router.push('/mfa');
        return;
      }

      router.push(returnTo);
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : 'Invalid email or password. Please try again.'
      );
    }
  };

  const handlePasskeyLogin = async () => {
    if (!passkeysSupported()) {
      setServerError('Passkeys are not supported on this device.');
      return;
    }

    setServerError(null);
    setPasskeyPending(true);
    try {
      const result = await signInWithPasskey();

      if (result.status === 'mfa_required') {
        sessionStorage.setItem('mfa_temp_token', result.tempToken);
        sessionStorage.setItem('mfa_methods', JSON.stringify(result.methods));
        router.push('/mfa');
        return;
      }

      const meRes = await fetch('/api/settings/me', { credentials: 'include' });
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData?.data) setUser(mapUserData(meData.data));
      }
      router.push(returnTo);
    } catch (err) {
      setServerError(passkeyErrorMessage(err));
    } finally {
      setPasskeyPending(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <Card padding="lg" className="rounded-2xl shadow-lg">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100">
            <span className="text-2xl">⚕️</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
            Health Watchers
          </h1>
          <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
            Secure access to your healthcare records
          </p>
        </div>

        {sessionExpired && !serverError && (
          <div
            role="status"
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            You were signed out after a period of inactivity. Please sign in again.
          </div>
        )}

        {serverError && (
          <div
            role="alert"
            className="border-danger-200 bg-danger-50 text-danger-700 dark:border-danger-900 dark:bg-danger-900/30 dark:text-danger-400 mb-4 rounded-lg border px-4 py-3 text-sm"
          >
            <p className="font-medium">Authentication Error</p>
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

          <PasswordInput
            label="Password"
            placeholder="••••••••"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-primary-600" defaultChecked={false} />
              <span className="text-neutral-700 dark:text-neutral-300">Keep me signed in</span>
            </label>
            <Link
              href="/forgot-password"
              className="dark:text-primary-400 dark:hover:text-primary-300 font-medium text-primary-600 hover:text-primary-700 focus:underline focus:outline-none"
            >
              Forgot password?
            </Link>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={isSubmitting}
            className="w-full"
          >
            Sign in
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="flex-1 border-t border-neutral-200 dark:border-neutral-700" />
          <span className="text-xs text-neutral-500 dark:text-neutral-400">Or continue with</span>
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
          <button
            type="button"
            onClick={handlePasskeyLogin}
            disabled={passkeyPending}
            aria-busy={passkeyPending}
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
            title="Use your device's fingerprint, face, PIN or a security key"
          >
            🔐 Passkey
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-400">
          Don't have an account?{' '}
          <Link
            href="/register"
            className="dark:text-primary-400 dark:hover:text-primary-300 font-medium text-primary-600 hover:text-primary-700"
          >
            Create one
          </Link>
        </p>
      </Card>

      <p className="mt-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
        Protected by industry-standard encryption • HIPAA Compliant
      </p>
    </div>
  );
}
