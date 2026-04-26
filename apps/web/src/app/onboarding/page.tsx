'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { API_V1 } from '@/lib/api';

// ── Step schemas ──────────────────────────────────────────────────────────────

const step1Schema = z.object({
  name: z.string().min(2, 'Clinic name is required'),
  address: z.string().min(5, 'Address is required'),
  phone: z.string().min(7, 'Phone number is required'),
  email: z.string().email('Valid email is required'),
  specialty: z.string().optional(),
});

const step2Schema = z
  .object({
    action: z.enum(['generate', 'import']),
    publicKey: z.string().optional(),
  })
  .refine((d) => d.action === 'generate' || (d.action === 'import' && !!d.publicKey), {
    message: 'Public key is required when importing',
    path: ['publicKey'],
  });

const step3Schema = z.object({
  inviteEmail: z.string().email('Valid email is required'),
  inviteName: z.string().optional(),
});

const step4Schema = z.object({
  timezone: z.string().min(1, 'Timezone is required'),
  appointmentDuration: z.coerce.number().min(5).max(240),
});

type Step1Values = z.infer<typeof step1Schema>;
type Step2Values = z.infer<typeof step2Schema>;
type Step3Values = z.infer<typeof step3Schema>;
type Step4Values = z.infer<typeof step4Schema>;

// ── Types ─────────────────────────────────────────────────────────────────────

interface OnboardingStatus {
  onboardingStep: number;
  onboardingCompleted: boolean;
  clinic: {
    name: string;
    address: string;
    phone: string;
    email: string;
    stellarPublicKey?: string;
  };
  settings: {
    workingHours: Record<string, unknown>;
    appointmentDuration: number;
    timezone: string;
  } | null;
}

// ── Progress indicator ────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Clinic Info' },
  { label: 'Wallet' },
  { label: 'Staff' },
  { label: 'Settings' },
  { label: 'Review' },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <nav aria-label="Onboarding progress" className="mb-8">
      <ol className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const stepNum = i + 1;
          const done = stepNum < current;
          const active = stepNum === current;
          return (
            <li key={step.label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                    done
                      ? 'bg-green-500 text-white'
                      : active
                        ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                        : 'bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'
                  }`}
                  aria-current={active ? 'step' : undefined}
                >
                  {done ? '✓' : stepNum}
                </div>
                <span
                  className={`text-xs ${active ? 'font-semibold text-blue-600' : 'text-neutral-500'}`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-1 h-0.5 flex-1 ${done ? 'bg-green-400' : 'bg-neutral-200 dark:bg-neutral-700'}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ── Step 1: Clinic Information ────────────────────────────────────────────────

function Step1({
  onNext,
  defaultValues,
}: {
  onNext: (data: Step1Values) => Promise<void>;
  defaultValues?: Partial<Step1Values>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onNext)} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">
        Clinic Information
      </h2>
      <p className="text-sm text-neutral-500">Tell us about your clinic to get started.</p>

      <Input
        label="Clinic Name"
        placeholder="City Medical Center"
        error={errors.name?.message}
        {...register('name')}
      />
      <Input
        label="Address"
        placeholder="123 Main St, City, State"
        error={errors.address?.message}
        {...register('address')}
      />
      <Input
        label="Phone"
        type="tel"
        placeholder="+1 555 000 0000"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <Input
        label="Email"
        type="email"
        placeholder="clinic@example.com"
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        label="Specialty (optional)"
        placeholder="General Practice, Cardiology…"
        error={errors.specialty?.message}
        {...register('specialty')}
      />

      <div className="flex justify-end pt-2">
        <Button type="submit" loading={isSubmitting}>
          Next →
        </Button>
      </div>
    </form>
  );
}

// ── Step 2: Stellar Wallet ────────────────────────────────────────────────────

function Step2({
  onNext,
  onBack,
  existingKey,
}: {
  onNext: (data: Step2Values) => Promise<void>;
  onBack: () => void;
  existingKey?: string;
}) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: { action: existingKey ? 'import' : 'generate', publicKey: existingKey ?? '' },
  });
  const action = watch('action');

  return (
    <form onSubmit={handleSubmit(onNext)} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">
        Stellar Wallet
      </h2>
      <p className="text-sm text-neutral-500">
        A Stellar wallet is required for blockchain-based payment processing.
        {existingKey && (
          <span className="ml-1 text-green-600">A wallet is already configured.</span>
        )}
      </p>

      <fieldset className="flex gap-4">
        <legend className="sr-only">Wallet option</legend>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            value="generate"
            {...register('action')}
            className="accent-blue-600"
          />
          <span className="text-sm font-medium">Generate new keypair</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="radio" value="import" {...register('action')} className="accent-blue-600" />
          <span className="text-sm font-medium">Import existing key</span>
        </label>
      </fieldset>

      {action === 'generate' && (
        <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          A new Stellar keypair will be generated and securely stored. The testnet account will be
          funded automatically.
        </div>
      )}

      {action === 'import' && (
        <Input
          label="Stellar Public Key"
          placeholder="G…"
          error={errors.publicKey?.message}
          {...register('publicKey')}
        />
      )}

      <div className="flex justify-between pt-2">
        <Button type="button" variant="secondary" onClick={onBack}>
          ← Back
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Next →
        </Button>
      </div>
    </form>
  );
}

// ── Step 3: Staff Setup ───────────────────────────────────────────────────────

function Step3({
  onNext,
  onBack,
}: {
  onNext: (data: Step3Values) => Promise<void>;
  onBack: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Step3Values>({
    resolver: zodResolver(step3Schema),
  });

  return (
    <form onSubmit={handleSubmit(onNext)} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">Staff Setup</h2>
      <p className="text-sm text-neutral-500">
        Invite your first clinic administrator to manage the account.
      </p>

      <Input
        label="Admin Email"
        type="email"
        placeholder="admin@clinic.com"
        error={errors.inviteEmail?.message}
        {...register('inviteEmail')}
      />
      <Input
        label="Admin Name (optional)"
        placeholder="Dr. Jane Smith"
        error={errors.inviteName?.message}
        {...register('inviteName')}
      />

      <div className="flex justify-between pt-2">
        <Button type="button" variant="secondary" onClick={onBack}>
          ← Back
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Next →
        </Button>
      </div>
    </form>
  );
}

// ── Step 4: Settings ──────────────────────────────────────────────────────────

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Africa/Nairobi',
];

function Step4({
  onNext,
  onBack,
  defaultValues,
}: {
  onNext: (data: Step4Values) => Promise<void>;
  onBack: () => void;
  defaultValues?: Partial<Step4Values>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Step4Values>({
    resolver: zodResolver(step4Schema),
    defaultValues: { timezone: 'UTC', appointmentDuration: 30, ...defaultValues },
  });

  return (
    <form onSubmit={handleSubmit(onNext)} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">Settings</h2>
      <p className="text-sm text-neutral-500">Configure your clinic's working preferences.</p>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="timezone"
          className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          Timezone
        </label>
        <select
          id="timezone"
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
          {...register('timezone')}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        {errors.timezone && <p className="text-xs text-red-500">{errors.timezone.message}</p>}
      </div>

      <Input
        label="Default Appointment Duration (minutes)"
        type="number"
        min={5}
        max={240}
        error={errors.appointmentDuration?.message}
        {...register('appointmentDuration')}
      />

      <div className="flex justify-between pt-2">
        <Button type="button" variant="secondary" onClick={onBack}>
          ← Back
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Next →
        </Button>
      </div>
    </form>
  );
}

// ── Step 5: Verification / Summary ───────────────────────────────────────────

function Step5({
  status,
  onComplete,
  onBack,
  completing,
}: {
  status: OnboardingStatus;
  onComplete: () => Promise<void>;
  onBack: () => void;
  completing: boolean;
}) {
  const rows: [string, string][] = [
    ['Clinic Name', status.clinic.name],
    ['Address', status.clinic.address],
    ['Phone', status.clinic.phone],
    ['Email', status.clinic.email],
    [
      'Stellar Wallet',
      status.clinic.stellarPublicKey
        ? `${status.clinic.stellarPublicKey.slice(0, 8)}…`
        : 'Not configured',
    ],
    ['Timezone', status.settings?.timezone ?? 'UTC'],
    ['Appointment Duration', `${status.settings?.appointmentDuration ?? 30} min`],
  ];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">
        Review & Confirm
      </h2>
      <p className="text-sm text-neutral-500">
        Review your settings before activating your clinic.
      </p>

      <dl className="divide-y divide-neutral-100 rounded-md border border-neutral-200 dark:divide-neutral-700 dark:border-neutral-700">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between px-4 py-2 text-sm">
            <dt className="font-medium text-neutral-600 dark:text-neutral-400">{label}</dt>
            <dd className="text-neutral-800 dark:text-neutral-200">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="secondary" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={onComplete} loading={completing} variant="primary">
          Activate Clinic ✓
        </Button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_V1}/onboarding/status`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load onboarding status');
      const data: OnboardingStatus = await res.json();
      setStatus(data);
      if (data.onboardingCompleted) {
        router.replace('/');
        return;
      }
      setCurrentStep(data.onboardingStep ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load onboarding');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const submitStep = async (step: number, data: Record<string, unknown>) => {
    const res = await fetch(`${API_V1}/onboarding/step/${step}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Failed to save step');
    }
    const result = await res.json();
    setCurrentStep(result.onboardingStep ?? step + 1);
    // Refresh status for summary step
    await fetchStatus();
  };

  const handleComplete = async () => {
    setCompleting(true);
    setError(null);
    try {
      const res = await fetch(`${API_V1}/onboarding/complete`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to complete onboarding');
      }
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete onboarding');
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4 py-12 dark:bg-neutral-900">
      <div className="mb-6 text-center">
        <span className="text-2xl font-bold text-blue-600">Health Watchers</span>
        <p className="mt-1 text-sm text-neutral-500">Set up your clinic in a few steps</p>
      </div>

      <Card padding="lg" className="w-full max-w-lg">
        <StepIndicator current={currentStep} />

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          >
            {error}
          </p>
        )}

        {currentStep === 1 && (
          <Step1
            defaultValues={status?.clinic}
            onNext={async (data) => {
              setError(null);
              try {
                await submitStep(1, data);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Error');
              }
            }}
          />
        )}

        {currentStep === 2 && (
          <Step2
            existingKey={status?.clinic.stellarPublicKey}
            onBack={() => setCurrentStep(1)}
            onNext={async (data) => {
              setError(null);
              try {
                await submitStep(2, data);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Error');
              }
            }}
          />
        )}

        {currentStep === 3 && (
          <Step3
            onBack={() => setCurrentStep(2)}
            onNext={async (data) => {
              setError(null);
              try {
                await submitStep(3, data);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Error');
              }
            }}
          />
        )}

        {currentStep === 4 && (
          <Step4
            defaultValues={
              status?.settings
                ? {
                    timezone: status.settings.timezone,
                    appointmentDuration: status.settings.appointmentDuration,
                  }
                : undefined
            }
            onBack={() => setCurrentStep(3)}
            onNext={async (data) => {
              setError(null);
              try {
                await submitStep(4, data);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Error');
              }
            }}
          />
        )}

        {currentStep >= 5 && status && (
          <Step5
            status={status}
            onBack={() => setCurrentStep(4)}
            onComplete={handleComplete}
            completing={completing}
          />
        )}
      </Card>

      <p className="mt-4 text-xs text-neutral-400">Step {Math.min(currentStep, 5)} of 5</p>
    </div>
  );
}
