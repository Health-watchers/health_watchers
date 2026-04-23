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
import { useAuth } from '@/context/AuthContext';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

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
        // Store tempToken in sessionStorage so the MFA page can use it
        if (result.tempToken) {
          sessionStorage.setItem('mfa_temp_token', result.tempToken);
        }
        router.push('/mfa');
        return;
      }

      router.push('/');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <Card padding="lg" className="w-full max-w-[400px]">
      <div className="mb-6 flex flex-col items-center gap-2">
        <span className="text-primary-600 text-2xl font-bold">Health Watchers</span>
        <h1 className="text-xl font-semibold text-neutral-800">Sign in to your account</h1>
      </div>

      {serverError && (
        <p role="alert" className="bg-danger-50 text-danger-700 mb-4 rounded-md px-3 py-2 text-sm">
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

        <PasswordInput
          label="Password"
          placeholder="••••••••"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-primary-600 text-sm hover:underline focus:underline focus:outline-none"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" variant="primary" size="md" loading={isSubmitting} className="w-full">
          Sign in
        </Button>
      </form>
    </Card>
  );
}
