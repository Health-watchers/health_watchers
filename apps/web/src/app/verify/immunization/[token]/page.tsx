'use client';

import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CertificateData {
  patientInitials: string;
  vaccineName: string;
  administeredDate: string;
  nextDueDate: string | null;
  issuingClinicName: string;
  issuingClinicPhone: string | null;
  certificateId: string;
}

type VerifyStatus = 'loading' | 'valid' | 'not_found' | 'revoked' | 'expired' | 'error';

interface VerifyResponse {
  valid: boolean;
  status: 'valid' | 'not_found' | 'revoked' | 'expired';
  data?: CertificateData;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-neutral-200 border-t-blue-600" />
      <p className="text-neutral-500">Verifying certificate…</p>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      {/* Lock icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
        <svg
          className="h-8 w-8 text-neutral-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-neutral-800 dark:text-neutral-100">
        Certificate not found
      </h2>
      <p className="max-w-xs text-sm text-neutral-500 dark:text-neutral-400">
        This verification link is invalid or the certificate does not exist. Please check the
        link and try again.
      </p>
    </div>
  );
}

function RevokedState() {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
        <svg
          className="h-8 w-8 text-red-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-red-700 dark:text-red-400">
        Certificate revoked
      </h2>
      <p className="max-w-xs text-sm text-neutral-500 dark:text-neutral-400">
        This certificate has been revoked by the issuing clinic and is no longer valid.
      </p>
    </div>
  );
}

function ExpiredState() {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
        <svg
          className="h-8 w-8 text-amber-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-amber-700 dark:text-amber-400">
        Certificate expired
      </h2>
      <p className="max-w-xs text-sm text-neutral-500 dark:text-neutral-400">
        This certificate has expired. Please contact the issuing clinic for an updated
        certificate.
      </p>
    </div>
  );
}

function ValidState({ data }: { data: CertificateData }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Status banner */}
      <div className="flex items-center gap-3 rounded-lg bg-green-50 px-4 py-3 dark:bg-green-900/20">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
          <svg
            className="h-6 w-6 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-green-800 dark:text-green-300">Certificate Valid</p>
          <p className="text-sm text-green-700 dark:text-green-400">
            This immunization certificate is authentic and has not expired.
          </p>
        </div>
      </div>

      {/* Certificate details */}
      <dl className="divide-y divide-neutral-100 dark:divide-neutral-700">
        <DetailRow label="Patient" value={data.patientInitials} />
        <DetailRow label="Vaccine" value={data.vaccineName} />
        <DetailRow label="Date administered" value={formatDate(data.administeredDate)} />
        <DetailRow
          label="Next dose / expiry"
          value={data.nextDueDate ? formatDate(data.nextDueDate) : 'Not applicable'}
        />
        <DetailRow label="Issuing clinic" value={data.issuingClinicName} />
        <DetailRow label="Certificate ID" value={data.certificateId} mono />
      </dl>

      {/* Clinic note */}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-400">
        This certificate was issued by{' '}
        <span className="font-medium text-neutral-800 dark:text-neutral-200">
          {data.issuingClinicName}
        </span>
        . For questions, contact{' '}
        {data.issuingClinicPhone ? (
          <a
            href={`tel:${data.issuingClinicPhone}`}
            className="font-medium text-blue-600 underline dark:text-blue-400"
          >
            {data.issuingClinicPhone}
          </a>
        ) : (
          'the clinic directly'
        )}
        .
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between">
      <dt className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd
        className={`text-sm text-neutral-900 dark:text-neutral-100 sm:text-right ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
        <svg
          className="h-8 w-8 text-red-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-neutral-800 dark:text-neutral-100">
        Verification unavailable
      </h2>
      <p className="max-w-xs text-sm text-neutral-500 dark:text-neutral-400">
        An error occurred while verifying this certificate. Please try again later.
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VerifyImmunizationPage({
  params,
}: {
  params: { token: string };
}) {
  const { token } = params;
  const [status, setStatus] = useState<VerifyStatus>('loading');
  const [certData, setCertData] = useState<CertificateData | null>(null);

  useEffect(() => {
    // Single fetch on mount — no automatic retries (rate-limit-friendly).
    const apiBase =
      process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    const url = `${apiBase}/api/v1/verify/immunization/${encodeURIComponent(token)}`;

    fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
      .then(async (res) => {
        if (!res.ok) {
          setStatus('error');
          return;
        }
        const json: VerifyResponse = await res.json();
        if (json.valid && json.data) {
          setCertData(json.data);
          setStatus('valid');
        } else {
          setStatus(
            (json.status as VerifyStatus) === 'not_found' ||
              (json.status as VerifyStatus) === 'revoked' ||
              (json.status as VerifyStatus) === 'expired'
              ? (json.status as VerifyStatus)
              : 'not_found'
          );
        }
      })
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div className="flex min-h-screen items-start justify-center bg-neutral-50 px-4 py-12 dark:bg-neutral-900">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-3 flex justify-center">
            <span
              className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-2xl dark:bg-blue-900/30"
              aria-hidden="true"
            >
              ⚕️
            </span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
            Immunization Certificate Verification
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Health Watchers · Secure verification portal
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
          {status === 'loading' && <LoadingState />}
          {status === 'not_found' && <NotFoundState />}
          {status === 'revoked' && <RevokedState />}
          {status === 'expired' && <ExpiredState />}
          {status === 'error' && <ErrorState />}
          {status === 'valid' && certData && <ValidState data={certData} />}
        </div>

        {/* Footer note */}
        <p className="mt-6 text-center text-xs text-neutral-400 dark:text-neutral-500">
          This page is publicly accessible. Patient identity is protected — only initials are
          shown.
        </p>
      </div>
    </div>
  );
}
