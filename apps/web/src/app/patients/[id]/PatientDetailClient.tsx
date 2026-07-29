'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDate } from '@health-watchers/types';
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
import { SectionErrorBoundary } from '@/components/ui/SectionErrorBoundary';
import { StellarAddressDisplay } from '@/components/ui/StellarAddressDisplay';
import {
  CreatePaymentIntentForm,
  type CreatePaymentData,
} from '@/components/forms/CreatePaymentIntentForm';
import { API_V1 } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import PhotoUpload from '@/components/patients/PhotoUpload';
import {
  usePatientDetail,
  useAllergyForm,
  useAiSummary,
  type Allergy,
} from '@/hooks/usePatientDetail';
import { ConsentTab } from '@/components/patients/ConsentTab';
import { InsuranceTab } from '@/components/patients/InsuranceTab';
import { HealthLogTab } from '@/components/patients/HealthLogTab';

const VitalSignsCharts = dynamic(() => import('@/components/patients/VitalSignsCharts'), {
  ssr: false,
});
const LabResultsTab = dynamic(() => import('@/components/patients/LabResultsTab'), { ssr: false });
const PatientReferralsTab = dynamic(() => import('@/components/patients/PatientReferralsTab'), {
  ssr: false,
});
const RiskTab = dynamic(() => import('@/components/patients/RiskTab'), { ssr: false });
const PatientDocumentsTab = dynamic(
  () =>
    import('@/components/patients/PatientDocumentsTab').then((m) => ({
      default: m.PatientDocumentsTab,
    })),
  { ssr: false }
);
const CarePlanTab = dynamic(
  () => import('@/components/patients/CarePlanTab').then((m) => ({ default: m.CarePlanTab })),
  { ssr: false }
);
const CommunicationTimeline = dynamic(
  () =>
    import('@/components/patients/communications/CommunicationTimeline').then((m) => ({
      default: m.CommunicationTimeline,
    })),
  { ssr: false }
);

// ── Utility functions ────────────────────────────────────────────────────────

function severityVariant(severity: string) {
  if (severity === 'life-threatening') return 'danger';
  if (severity === 'severe') return 'danger';
  if (severity === 'moderate') return 'warning';
  return 'default';
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

function calcAge(dob: string): number {
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
const EDIT_ROLES = new Set(['DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN']);

// ── Labels type ──────────────────────────────────────────────────────────────

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

// ── Main component ───────────────────────────────────────────────────────────

export default function PatientDetailClient({
  patientId,
  labels,
}: {
  patientId: string;
  labels: Labels;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState('encounters');
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const {
    patient,
    patientLoading,
    patientError,
    encounters,
    encountersLoading,
    encountersError,
    payments,
    paymentsLoading,
    paymentsError,
    vitals,
    vitalsLoading,
    analytics,
    analyticsLoading,
    allergies,
    allergiesLoading,
    refetchAllergies,
    invalidatePatient,
    invalidateEncounters,
    invalidatePayments,
  } = usePatientDetail(patientId);

  const allergyState = useAllergyForm(patientId, refetchAllergies);
  const aiState = useAiSummary(encounters);

  const canEdit = user && EDIT_ROLES.has(user.role);

  // Merge toast state from allergy and AI hooks
  const activeToast = allergyState.toast ?? aiState.toast;
  const clearToast = () => {
    allergyState.setToast(null);
    aiState.setToast(null);
  };

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
    allergyState.setToast({ message: 'Payment intent created.', type: 'success' });
    invalidatePayments();
  };

  // ── Loading / Error / Not Found states ───────────────────────────────────

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
            <Link href="/patients" className="text-primary-600 mt-6 text-sm hover:underline">
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
          onRetry={invalidatePatient}
        />
      </PageWrapper>
    );
  }

  if (!patient) return null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <PageWrapper className="py-8">
      {activeToast && (
        <Toast message={activeToast.message} type={activeToast.type} onClose={clearToast} />
      )}

      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="mb-6 flex items-center gap-2 text-sm text-neutral-500"
      >
        <Link href="/" className="hover:text-neutral-800">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <Link href="/patients" className="hover:text-neutral-800">
          {labels.back.replace('← ', '')}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-neutral-900" aria-current="page">
          {patient.firstName} {patient.lastName}
        </span>
      </nav>

      {/* Demographics card */}
      <DemographicsCard
        patient={patient}
        patientId={patientId}
        canEdit={!!canEdit}
        labels={labels}
        onEdit={() => router.push(`/patients/${patientId}/edit`)}
      />

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="encounters">{labels.encounters}</TabsTrigger>
          <TabsTrigger value="payments">{labels.payments}</TabsTrigger>
          <TabsTrigger value="lab-results">Lab Results</TabsTrigger>
          <TabsTrigger value="vitals">Vitals & Analytics</TabsTrigger>
          <TabsTrigger value="allergies">
            Allergies
            {allergies.some(
              (a) => a.severity === 'life-threatening' || a.severity === 'severe'
            ) && (
              <span
                className="bg-danger-500 ml-1.5 inline-flex h-2 w-2 rounded-full"
                aria-label="Has severe allergies"
              />
            )}
          </TabsTrigger>
          <TabsTrigger value="ai">{labels.aiInsights}</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
          <TabsTrigger value="consent">Consent</TabsTrigger>
          <TabsTrigger value="insurance">Insurance</TabsTrigger>
          <TabsTrigger value="referrals">Referrals</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="care-plans">Care Plans</TabsTrigger>
          <TabsTrigger value="health-log">Health Log</TabsTrigger>
          <TabsTrigger value="communications">Communications</TabsTrigger>
        </TabsList>

        <TabsContent value="encounters">
          <EncountersTabContent
            encounters={encounters}
            encountersLoading={encountersLoading}
            encountersError={encountersError}
            patientId={patientId}
            labels={labels}
            onRetry={invalidateEncounters}
          />
        </TabsContent>

        <TabsContent value="payments">
          <PaymentsTabContent
            payments={payments}
            paymentsLoading={paymentsLoading}
            paymentsError={paymentsError}
            labels={labels}
            onInitiatePayment={() => setShowPaymentForm(true)}
            onRetry={invalidatePayments}
          />
        </TabsContent>

        <TabsContent value="lab-results">
          <SectionErrorBoundary name="Lab Results">
            <LabResultsTab patientId={patientId} />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="vitals">
          <SectionErrorBoundary name="Vitals & Analytics">
            {vitalsLoading || analyticsLoading ? (
              <div className="space-y-3" aria-busy="true">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-lg bg-neutral-100" />
                ))}
              </div>
            ) : (
              <VitalSignsCharts vitals={vitals} analytics={analytics} />
            )}
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="allergies">
          <AllergiesTabContent
            allergies={allergies}
            allergiesLoading={allergiesLoading}
            canEdit={!!canEdit}
            allergyState={allergyState}
          />
        </TabsContent>

        <TabsContent value="ai">
          <AiInsightsTabContent aiState={aiState} encounters={encounters} labels={labels} />
        </TabsContent>

        <TabsContent value="consent">
          <ConsentTab patientId={patientId} canEdit={!!canEdit} />
        </TabsContent>

        <TabsContent value="risk">
          <SectionErrorBoundary name="Risk Assessment">
            <RiskTab patient={patient} patientId={patientId} apiV1={API_V1} />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="referrals">
          <SectionErrorBoundary name="Referrals">
            <PatientReferralsTab patientId={patientId} />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="documents">
          <PatientDocumentsTab patientId={patientId} clinicId={user?.clinicId ?? ''} />
        </TabsContent>

        <TabsContent value="care-plans">
          <CarePlanTab patientId={patientId} />
        </TabsContent>

        <TabsContent value="health-log">
          <HealthLogTab patientId={patientId} />
        </TabsContent>

        <TabsContent value="communications">
          <CommunicationTimeline patientId={patientId} />
        </TabsContent>

        <TabsContent value="insurance">
          <InsuranceTab patientId={patientId} canEdit={!!canEdit} />
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

// ── Sub-components ───────────────────────────────────────────────────────────

function DemographicsCard({
  patient,
  patientId,
  canEdit,
  labels,
  onEdit,
}: {
  patient: any;
  patientId: string;
  canEdit: boolean;
  labels: Labels;
  onEdit: () => void;
}) {
  return (
    <section
      aria-labelledby="demographics-heading"
      className="mb-8 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <PhotoUpload
            patientId={patientId}
            patientName={`${patient.firstName} ${patient.lastName}`}
            photoUrl={patient.photoUrl}
            thumbnailUrl={patient.thumbnailUrl}
            canEdit={canEdit}
          />
          <div>
            <h1 id="demographics-heading" className="text-2xl font-bold text-neutral-900">
              {patient.firstName} {patient.lastName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant={patient.gender === 'inactive' ? 'danger' : 'success'}>
                {labels.active}
              </Badge>
              <span className="text-xs text-neutral-500">
                {labels.registeredOn}: {formatDate(patient.createdAt)}
              </span>
            </div>
          </div>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            {labels.editPatient}
          </Button>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            {labels.systemId}
          </dt>
          <dd className="mt-0.5 font-mono text-neutral-900">{patient.systemId}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            {labels.dob}
          </dt>
          <dd className="mt-0.5 text-neutral-900">{formatDate(patient.dateOfBirth)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            {labels.age}
          </dt>
          <dd className="mt-0.5 text-neutral-900">{calcAge(patient.dateOfBirth)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            {labels.sex}
          </dt>
          <dd className="mt-0.5 text-neutral-900">{patient.sex}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            {labels.contact}
          </dt>
          <dd className="mt-0.5 text-neutral-900">{patient.contactNumber || 'N/A'}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            {labels.address}
          </dt>
          <dd className="mt-0.5 text-neutral-900">{patient.address || 'N/A'}</dd>
        </div>
      </dl>
    </section>
  );
}

function EncountersTabContent({
  encounters,
  encountersLoading,
  encountersError,
  patientId,
  labels,
  onRetry,
}: {
  encounters: any[];
  encountersLoading: boolean;
  encountersError: Error | null;
  patientId: string;
  labels: Labels;
  onRetry: () => void;
}) {
  const router = useRouter();

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-neutral-500">{encounters.length} record(s)</p>
        <Button
          size="sm"
          variant="primary"
          onClick={() => router.push(`/encounters/new?patientId=${patientId}`)}
        >
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
          onRetry={onRetry}
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
                  <p className="mt-0.5 text-xs text-neutral-500">{formatDate(enc.createdAt)}</p>
                </div>
                <Badge variant={statusVariant(enc.status)}>{enc.status}</Badge>
              </div>
              {enc.notes && (
                <p className="mt-2 line-clamp-2 text-sm text-neutral-600">{enc.notes}</p>
              )}
              {enc.diagnosis && enc.diagnosis.length > 0 && (
                <p className="mt-1 text-xs text-neutral-500">
                  Dx: {enc.diagnosis.map((d: any) => d.description).join(', ')}
                </p>
              )}
              {enc.aiSummary && (
                <details className="mt-2">
                  <summary className="text-primary-600 cursor-pointer text-xs font-medium hover:underline">
                    AI Summary
                  </summary>
                  <p className="mt-1 text-sm text-neutral-600">{enc.aiSummary}</p>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function PaymentsTabContent({
  payments,
  paymentsLoading,
  paymentsError,
  labels,
  onInitiatePayment,
  onRetry,
}: {
  payments: any[];
  paymentsLoading: boolean;
  paymentsError: Error | null;
  labels: Labels;
  onInitiatePayment: () => void;
  onRetry: () => void;
}) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-neutral-500">{payments.length} record(s)</p>
        <Button size="sm" variant="primary" onClick={onInitiatePayment}>
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
          onRetry={onRetry}
        />
      ) : payments.length === 0 ? (
        <EmptyState title={labels.noPayments} icon="💳" />
      ) : (
        <ol className="space-y-3" aria-label={labels.payments}>
          {payments.map((p) => (
            <li key={p.id} className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-neutral-900">
                    {p.amount}{' '}
                    <span className="font-normal text-neutral-500">{p.assetCode ?? 'XLM'}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
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
    </>
  );
}

function AllergiesTabContent({
  allergies,
  allergiesLoading,
  canEdit,
  allergyState,
}: {
  allergies: Allergy[];
  allergiesLoading: boolean;
  canEdit: boolean;
  allergyState: ReturnType<typeof useAllergyForm>;
}) {
  const {
    showAllergyForm,
    setShowAllergyForm,
    allergyForm,
    setAllergyForm,
    allergySubmitting,
    handleAddAllergy,
  } = allergyState;

  return (
    <>
      {canEdit && (
        <div className="mb-4">
          {showAllergyForm ? (
            <form
              onSubmit={handleAddAllergy}
              className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <h3 className="font-medium text-neutral-900">Add Allergy</h3>
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  placeholder="Allergen (e.g. Penicillin)"
                  value={allergyForm.allergen}
                  onChange={(e) => setAllergyForm((f) => ({ ...f, allergen: e.target.value }))}
                  className="col-span-2 rounded border border-neutral-300 px-3 py-2 text-sm"
                />
                <select
                  value={allergyForm.allergenType}
                  onChange={(e) => setAllergyForm((f) => ({ ...f, allergenType: e.target.value }))}
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                >
                  <option value="drug">Drug</option>
                  <option value="food">Food</option>
                  <option value="environmental">Environmental</option>
                  <option value="other">Other</option>
                </select>
                <select
                  value={allergyForm.severity}
                  onChange={(e) => setAllergyForm((f) => ({ ...f, severity: e.target.value }))}
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                >
                  <option value="mild">Mild</option>
                  <option value="moderate">Moderate</option>
                  <option value="severe">Severe</option>
                  <option value="life-threatening">Life-threatening</option>
                </select>
                <input
                  required
                  placeholder="Reaction (e.g. Anaphylaxis)"
                  value={allergyForm.reaction}
                  onChange={(e) => setAllergyForm((f) => ({ ...f, reaction: e.target.value }))}
                  className="col-span-2 rounded border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={allergySubmitting}
                  className="bg-primary-600 hover:bg-primary-700 rounded px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {allergySubmitting ? 'Saving...' : 'Save Allergy'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAllergyForm(false)}
                  className="rounded border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <Button size="sm" onClick={() => setShowAllergyForm(true)}>
              + Add Allergy
            </Button>
          )}
        </div>
      )}
      {allergiesLoading ? (
        <div className="space-y-3" aria-busy="true">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-neutral-100" />
          ))}
        </div>
      ) : allergies.length === 0 ? (
        <EmptyState title="No known allergies recorded" icon="💊" />
      ) : (
        <ol className="space-y-3" aria-label="Allergies">
          {allergies.map((a) => (
            <li key={a._id} className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-neutral-900">{a.allergen}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {a.allergenType} · Reaction: {a.reaction}
                    {a.onsetDate && ` · Onset: ${new Date(a.onsetDate).toLocaleDateString()}`}
                  </p>
                </div>
                <Badge variant={severityVariant(a.severity)}>
                  {a.severity === 'life-threatening' ? '⚠ ' : ''}
                  {a.severity}
                </Badge>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function AiInsightsTabContent({
  aiState,
  encounters,
  labels,
}: {
  aiState: ReturnType<typeof useAiSummary>;
  encounters: any[];
  labels: Labels;
}) {
  const { aiSummary, aiLoading, aiLastRun, handleGenerateAI } = aiState;

  return (
    <div className="rounded-xl border border-blue-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
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
          {aiLoading ? 'Generating...' : labels.generateSummary}
        </Button>
      </div>

      {aiLoading ? (
        <div className="space-y-2.5" aria-busy="true">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-3.5 animate-pulse rounded bg-neutral-200 ${i === 1 ? 'w-[70%]' : i === 2 ? 'w-[77%]' : i === 3 ? 'w-[84%]' : 'w-[91%]'}`}
            />
          ))}
        </div>
      ) : aiSummary ? (
        <>
          <p className="text-sm leading-relaxed text-neutral-600">{aiSummary}</p>
          {aiLastRun && (
            <p className="mt-3 text-xs text-neutral-500">
              {labels.lastAnalysis}: {aiLastRun.toLocaleString()}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-neutral-500">{labels.aiSummaryPlaceholder}</p>
      )}
    </div>
  );
}
