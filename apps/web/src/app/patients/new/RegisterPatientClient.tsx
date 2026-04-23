'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PatientSchema, type PatientInput } from '@health-watchers/types';
import { Button, Input, Textarea, Spinner, toast } from '@/components/ui';
import { fetchWithAuth } from '@/lib/auth';
import { API_URL } from '@/lib/api';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RegisterPatientLabels {
  title: string;
  subtitle: string;
  back: string;
  firstName: string;
  firstNamePlaceholder: string;
  lastName: string;
  lastNamePlaceholder: string;
  dateOfBirth: string;
  sex: string;
  sexMale: string;
  sexFemale: string;
  sexOther: string;
  contactNumber: string;
  contactNumberPlaceholder: string;
  address: string;
  addressPlaceholder: string;
  submit: string;
  submitting: string;
  cancel: string;
  successToast: string;
  errorFallback: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function RegisterPatientClient({
  labels,
}: {
  labels: RegisterPatientLabels;
}) {
  const router = useRouter();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting, isValid, isDirty },
  } = useForm<PatientInput>({
    resolver: zodResolver(PatientSchema),
    mode: 'onChange',
    defaultValues: {
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      sex: 'M',
      contactNumber: '',
      address: '',
    },
  });

  const sexValue = watch('sex');
  const isDisabled = isSubmitting;

  const onSubmit = async (data: PatientInput) => {
    setApiError(null);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/v1/patients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        let msg = labels.errorFallback;
        try {
          const body = await res.json();
          msg = body?.message ?? body?.error ?? msg;
        } catch {
          // ignore parse error
        }
        setApiError(msg);
        return;
      }

      const result = await res.json();
      const newId: string = result?.data?._id ?? result?._id ?? '';

      toast.success(labels.successToast);

      if (newId) {
        router.push(`/patients/${newId}`);
      } else {
        router.push('/patients');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : labels.errorFallback;
      setApiError(msg);
    }
  };

  // Max date = today (DOB must be in the past)
  const today = new Date().toISOString().split('T')[0];

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-10">
      {/* ── Back link ─────────────────────────────────────────────────────── */}
      <Link
        href="/patients"
        className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 mb-8 group"
        aria-label={labels.back}
      >
        <span
          aria-hidden="true"
          className="transition-transform group-hover:-translate-x-0.5"
        >
          ←
        </span>
        {labels.back}
      </Link>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">
          {labels.title}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">{labels.subtitle}</p>
      </div>

      {/* ── Card ──────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6 sm:p-8">
        {/* API-level error banner */}
        {apiError && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <span className="mt-0.5 font-bold shrink-0">✕</span>
            <p>{apiError}</p>
            <button
              aria-label="Dismiss error"
              onClick={() => setApiError(null)}
              className="ml-auto shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >
              ×
            </button>
          </div>
        )}

        <form
          id="register-patient-form"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          aria-label={labels.title}
          className="space-y-6"
        >
          {/* ── Name row ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="firstName"
              label={labels.firstName}
              placeholder={labels.firstNamePlaceholder}
              autoComplete="given-name"
              required
              disabled={isDisabled}
              {...register('firstName')}
              error={errors.firstName?.message}
            />
            <Input
              id="lastName"
              label={labels.lastName}
              placeholder={labels.lastNamePlaceholder}
              autoComplete="family-name"
              required
              disabled={isDisabled}
              {...register('lastName')}
              error={errors.lastName?.message}
            />
          </div>

          {/* ── DOB ──────────────────────────────────────────────────────── */}
          <Input
            id="dateOfBirth"
            label={labels.dateOfBirth}
            type="date"
            max={today}
            required
            disabled={isDisabled}
            {...register('dateOfBirth')}
            error={errors.dateOfBirth?.message}
          />

          {/* ── Sex (radio group) ─────────────────────────────────────────── */}
          <fieldset>
            <legend className="text-sm font-medium text-neutral-700 mb-2">
              {labels.sex}
              <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
            </legend>
            <div
              role="radiogroup"
              aria-label={labels.sex}
              className="flex flex-wrap gap-3"
            >
              {(
                [
                  { value: 'M', label: labels.sexMale },
                  { value: 'F', label: labels.sexFemale },
                  { value: 'O', label: labels.sexOther },
                ] as const
              ).map(({ value, label }) => {
                const checked = sexValue === value;
                return (
                  <label
                    key={value}
                    className={[
                      'flex items-center gap-2 cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors select-none',
                      checked
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50',
                      isDisabled ? 'opacity-50 pointer-events-none' : '',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      value={value}
                      disabled={isDisabled}
                      {...register('sex')}
                      className="sr-only"
                      aria-label={label}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
            {errors.sex && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {errors.sex.message}
              </p>
            )}
          </fieldset>

          {/* ── Contact Number ────────────────────────────────────────────── */}
          <Input
            id="contactNumber"
            label={labels.contactNumber}
            type="tel"
            placeholder={labels.contactNumberPlaceholder}
            autoComplete="tel"
            required
            disabled={isDisabled}
            {...register('contactNumber')}
            error={errors.contactNumber?.message}
          />

          {/* ── Address ──────────────────────────────────────────────────── */}
          <Textarea
            id="address"
            label={labels.address}
            placeholder={labels.addressPlaceholder}
            autoComplete="street-address"
            rows={3}
            required
            disabled={isDisabled}
            {...register('address')}
            error={errors.address?.message}
          />

          {/* ── Actions ──────────────────────────────────────────────────── */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="md"
              disabled={isDisabled}
              onClick={() => router.push('/patients')}
              className="flex-1"
              id="cancel-register-patient"
            >
              {labels.cancel}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={isSubmitting}
              disabled={isDisabled || !isDirty || !isValid}
              className="flex-1"
              id="submit-register-patient"
              aria-busy={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Spinner size="sm" className="text-white" />
                  {labels.submitting}
                </>
              ) : (
                labels.submit
              )}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
