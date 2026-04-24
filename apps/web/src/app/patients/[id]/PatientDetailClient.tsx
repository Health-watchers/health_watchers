'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type Patient, formatDate } from '@health-watchers/types';
import {
  Badge,
  Button,
  DetailSkeleton,
  EmptyState,
  ErrorMessage,
  PageWrapper,
  SlideOver,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toast,
} from '@/components/ui';
import { StellarAddressDisplay } from '@/components/ui/StellarAddressDisplay';
import { CreatePaymentIntentForm, type CreatePaymentData } from '@/components/forms/CreatePaymentIntentForm';
import { queryKeys } from '@/lib/queryKeys';
import { API_V1 } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const VitalSignsCharts = dynamic(() => import('@/components/patients/VitalSignsCharts'), { ssr: false });
const LabResultsTab = dynamic(() => import('@/components/patients/LabResultsTab'), { ssr: false });

interface EncounterResponse {
  id: string;
  patientId: string;
  chiefComplaint: string;
  status: string;
  notes?: string;
  diagnosis?: { code: string; description: string; isPrimary?: boolean }[];
  vitalSigns?: Record<string, unknown>;
  aiSummary?: string;
  createdAt: string;
}

interface PaymentResponse {
  id: string;
  amount: string;
  assetCode?: string;
  status: string;
  txHash?: string;
  createdAt?: string;
}

const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
const EDIT_ROLES = new Set(['DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN']);

function calcAge(dob: string): number {
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

function statusVariant(status: string) {
  if (status === 'open') return 'primary';
  if (status === 'closed') return 'success';
  if (status === 'follow-up') return 'warning';
  return 'default';
}

function paymentVariant(status: string) {
  if (status === 'confirmed') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'failed') return 'danger';
  return 'default';
}

interface Labels {
  back: string;
  loading: string;
  error: string;
  notFound: string;
  demographics: string;
  encounters: string;
  payments: string;
  aiInsights: string;
  noEncounters: string;
  noPayments: string;
  newEncounter: string;
  initiatePayment: string;
  editPatient: string;
  generateSummary: string;
  aiSummaryPlaceholder: string;
  lastAnalysis: string;
  active: string;
  inactive: string;
  registeredOn: string;
  age: string;
  dob: string;
  sex: string;
  contact: string;
  address: string;
  systemId: string;
}

export default function PatientDetailClient({
  patientId,
  labels,
}: {
  patientId: string;
  labels: Labels;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('encounters');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLastRun, setAiLastRun] = useState<Date | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const {
    data: patient,
    isLoading: patientLoading,
    error: patientError,
  } = useQuery<Patient>({
    queryKey: queryKeys.patients.detail(patientId),
    queryFn: async () => {
      const res = await fetch(`${API_V1}/patients/${patientId}`);
      if (res.status === 404) throw new Error('404');
      if (!res.ok) throw new Error('Failed to load patient');
      const data = await res.json();
      return data.data;
    },
  });

  const {
    data: encounters = [],
    isLoading: encountersLoading,
    error: encountersError,
  } = useQuery<EncounterResponse[]>({
    queryKey: queryKeys.encounters.byPatient(patientId),
    queryFn: async () => {
      const res = await fetch(`${API_V1}/encounters/patient/${patientId}`);
      if (!res.ok) throw new Error('Failed to load encounters');
      const data = await res.json();
      return data.data ?? [];
    },
  });

  const {
    data: payments = [],
    isLoading: paymentsLoading,
    error: paymentsError,
  } = useQuery<PaymentResponse[]>({
    queryKey: queryKeys.payments.byPatient(patientId),
    queryFn: async () => {
      const res = await fetch(`${API_V1}/payments?patientId=${patientId}`);
      if (!res.ok) throw new Error('Failed to load payments');
      const data = await res.json();
      return data.data ?? [];
    },
  });

  const { data: vitals = [], isLoading: vitalsLoading } = useQuery({
    queryKey: ['vitals', patientId],
    queryFn: async () => {
      const res = await fetch(`${API_V1}/patients/${patientId}/vitals`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.data ?? [];
    },
    staleTime: 5 * 60 * 1000, // cache 5 minutes
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['analytics', patientId],
    queryFn: async () => {
      const res = await fetch(`${API_V1}/patients/${patientId}/analytics`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.data ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const canEdit = user && EDIT_ROLES.has(user.role);

  const handleCreatePayment = async (data: CreatePaymentData) => {
    const res = await fetch(`${API_V1}/payments/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? `Error ${res.status}`);
    }
    setShowPaymentForm(false);
    setToast({ message: 'Payment intent created.', type: 'success' });
    queryClient.invalidateQueries({ queryKey: queryKeys.payments.byPatient(patientId) });
  };

  const handleGenerateAI = async () => {
    if (!encounters.length) return;
    setAiLoading(true);
    try {
      const res = await fetch(`${API_V1.replace('/api/v1', '')}/api/v1/ai/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encounterId: encounters[0].id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? 'AI unavailable');
      setAiSummary(body.summary);
      setAiLastRun(new Date());
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'AI generation failed', type: 'error' });
    } finally {
      setAiLoading(false);
    }
  };

  if (patientLoading) {
    return (
      <PageWrapper className="py-8">
        <DetailSkeleton />
      </PageWrapper>
    );
  }

  if (patientError) {
    const is404 = patientError instanceof Error && patientError.message === '404';
    if (is404) {
      return (
        <PageWrapper className="py-8">
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-6xl font-bold text-neutral-200">404</p>
            <p className="mt-4 text-lg font-semibold text-neutral-700">{labels.notFound}</p>
            <Link href="/patients" className="mt-6 text-sm text-primary-600 hover:underline">
              ← {labels.back}
            </Link>
          </div>
        </PageWrapper>
      );
    }
    return (
      <PageWrapper className="py-8">
        <ErrorMessage
          message={patientError instanceof Error ? patientError.message : labels.error}
          onRetry={() => queryClient.invalidateQueries({ queryKey: queryKeys.patients.detail(patientId) })}
        />
      </PageWrapper>
    );
  }

  if (!patient) return null;

  return (
    <PageWrapper className="py-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-sm text-neutral-500">
        <Link href="/" className="hover:text-neutral-800">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/patients" className="hover:text-neutral-800">{labels.back.replace('← ', '')}</Link>
        <span aria-hidden="true">/</span>
        <span className="text-neutral-900 font-medium" aria-current="page">
          {patient.firstName} {patient.lastName}
        </span>
      </nav>

      {/* Demographics card */}
      <section
        aria-labelledby="demographics-heading"
        className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm mb-8"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h1 id="demographics-heading" className="text-2xl font-bold text-neutral-900">
              {patient.firstName} {patient.lastName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant={patient.gender === 'inactive' ? 'danger' : 'success'}>
                {labels.active}
              </Badge>
              <span className="text-xs text-neutral-400">
                {labels.registeredOn}: {formatDate((patient as any).createdAt)}
              </span>
            </div>
          </div>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/patients/${patientId}/edit`)}
            >
              {labels.editPatient}
            </Button>
          )}
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{labels.systemId}</dt>
            <dd className="mt-0.5 text-neutral-900 font-mono">{patient.systemId}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{labels.dob}</dt>
            <dd className="mt-0.5 text-neutral-900">{formatDate(patient.dateOfBirth)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{labels.age}</dt>
            <dd className="mt-0.5 text-neutral-900">{calcAge(patient.dateOfBirth)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{labels.sex}</dt>
            <dd className="mt-0.5 text-neutral-900">{patient.sex}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{labels.contact}</dt>
            <dd className="mt-0.5 text-neutral-900">{patient.contactNumber || 'N/A'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{labels.address}</dt>
            <dd className="mt-0.5 text-neutral-900">{patient.address || 'N/A'}</dd>
          </div>
        </dl>
      </section>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="encounters">{labels.encounters}</TabsTrigger>
          <TabsTrigger value="payments">{labels.payments}</TabsTrigger>
          <TabsTrigger value="lab-results">Lab Results</TabsTrigger>
          <TabsTrigger value="vitals">Vitals & Analytics</TabsTrigger>
          <TabsTrigger value="ai">{labels.aiInsights}</TabsTrigger>
        </TabsList>

        {/* Encounters tab */}
        <TabsContent value="encounters">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-neutral-500">{encounters.length} record(s)</p>
            <Button size="sm" variant="primary" onClick={() => router.push(`/encounters/new?patientId=${patientId}`)}>
              + {labels.newEncounter}
            </Button>
          </div>

          {encountersLoading ? (
            <div className="space-y-3" aria-busy="true" aria-label={labels.loading}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-neutral-100" />
              ))}
            </div>
          ) : encountersError ? (
            <ErrorMessage
              message={encountersError instanceof Error ? encountersError.message : labels.error}
              onRetry={() => queryClient.invalidateQueries({ queryKey: queryKeys.encounters.byPatient(patientId) })}
            />
          ) : encounters.length === 0 ? (
            <EmptyState title={labels.noEncounters} icon="📋" />
          ) : (
            <ol className="space-y-3" aria-label={labels.encounters}>
              {encounters.map((enc) => (
                <li
                  key={enc.id}
                  className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-neutral-900">{enc.chiefComplaint}</p>
                      <p className="text-xs text-neutral-400 mt-0.5">{formatDate(enc.createdAt)}</p>
                    </div>
                    <Badge variant={statusVariant(enc.status)}>{enc.status}</Badge>
                  </div>
                  {enc.notes && (
                    <p className="mt-2 text-sm text-neutral-600 line-clamp-2">{enc.notes}</p>
                  )}
                  {enc.diagnosis && enc.diagnosis.length > 0 && (
                    <p className="mt-1 text-xs text-neutral-500">
                      Dx: {enc.diagnosis.map((d) => d.description).join(', ')}
                    </p>
                  )}
                  {enc.aiSummary && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-primary-600 hover:underline">
                        AI Summary
                      </summary>
                      <p className="mt-1 text-sm text-neutral-600">{enc.aiSummary}</p>
                    </details>
                  )}
                </li>
              ))}
            </ol>
          )}
        </TabsContent>

        {/* Payments tab */}
        <TabsContent value="payments">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-neutral-500">{payments.length} record(s)</p>
            <Button size="sm" variant="primary" onClick={() => setShowPaymentForm(true)}>
              + {labels.initiatePayment}
            </Button>
          </div>

          {paymentsLoading ? (
            <div className="space-y-3" aria-busy="true" aria-label={labels.loading}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-neutral-100" />
              ))}
            </div>
          ) : paymentsError ? (
            <ErrorMessage
              message={paymentsError instanceof Error ? paymentsError.message : labels.error}
              onRetry={() => queryClient.invalidateQueries({ queryKey: queryKeys.payments.byPatient(patientId) })}
            />
          ) : payments.length === 0 ? (
            <EmptyState title={labels.noPayments} icon="💳" />
          ) : (
            <ol className="space-y-3" aria-label={labels.payments}>
              {payments.map((p) => (
                <li
                  key={p.id}
                  className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-neutral-900">
                        {p.amount}{' '}
                        <span className="text-neutral-400 font-normal">{p.assetCode ?? 'XLM'}</span>
                      </p>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
                      </p>
                    </div>
                    <Badge variant={paymentVariant(p.status)}>{p.status}</Badge>
                  </div>
                  {p.txHash && (
                    <div className="mt-2">
                      <StellarAddressDisplay value={p.txHash} type="tx" network={NETWORK} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </TabsContent>

        {/* Lab Results tab */}
        <TabsContent value="lab-results">
          <LabResultsTab patientId={patientId} />
        </TabsContent>

        {/* Vitals & Analytics tab */}
        <TabsContent value="vitals">
          {vitalsLoading || analyticsLoading ? (
            <div className="space-y-3" aria-busy="true">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-neutral-100" />
              ))}
            </div>
          ) : (
            <VitalSignsCharts vitals={vitals} analytics={analytics} />
          )}
        </TabsContent>

        {/* AI Insights tab */}
        <TabsContent value="ai">
          <div className="rounded-xl border border-blue-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold tracking-widest text-white">
                  CLINICAL AI
                </span>
                <span className="text-sm font-semibold text-neutral-800">{labels.aiInsights}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerateAI}
                disabled={aiLoading || encounters.length === 0}
                aria-busy={aiLoading}
              >
                {aiLoading ? 'Generating…' : labels.generateSummary}
              </Button>
            </div>

            {aiLoading ? (
              <div className="space-y-2.5" aria-busy="true">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-3.5 animate-pulse rounded bg-neutral-200" style={{ width: `${70 + i * 7}%` }} />
                ))}
              </div>
            ) : aiSummary ? (
              <>
                <p className="text-sm leading-relaxed text-neutral-600">{aiSummary}</p>
                {aiLastRun && (
                  <p className="mt-3 text-xs text-neutral-400">
                    {labels.lastAnalysis}: {aiLastRun.toLocaleString()}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-neutral-400">{labels.aiSummaryPlaceholder}</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* New Payment slide-over */}
      <SlideOver
        isOpen={showPaymentForm}
        onClose={() => setShowPaymentForm(false)}
        title={labels.initiatePayment}
      >
        <CreatePaymentIntentForm
          onSubmit={handleCreatePayment}
          onCancel={() => setShowPaymentForm(false)}
          defaultPatientId={patientId}
        />
      </SlideOver>
    </PageWrapper>
  );
}
