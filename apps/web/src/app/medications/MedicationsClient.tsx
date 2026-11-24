'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorMessage,
  PageHeader,
  PageWrapper,
  Select,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { API_V1 } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { AdherenceTracker } from '@/components/medications/AdherenceTracker';
import { DiscontinuationDialog } from '@/components/medications/DiscontinuationDialog';
import { InteractionWarnings } from '@/components/medications/InteractionWarnings';
import { MedicationForm } from '@/components/medications/MedicationForm';
import { MedicationHistory } from '@/components/medications/MedicationHistory';
import { MedicationList } from '@/components/medications/MedicationList';
import { PharmacyExportPanel } from '@/components/medications/PharmacyExportPanel';
import { ReconciliationView } from '@/components/medications/ReconciliationView';
import { RefillRequests, type NewRefillRequest } from '@/components/medications/RefillRequests';
import {
  SideEffectReportForm,
  type NewSideEffectReport,
} from '@/components/medications/SideEffectReport';
import { generateAdherenceDoses } from '@/lib/medications/adherence';
import { FREQUENCY_LABELS } from '@/lib/medications/labels';
import { makeId, todayIso } from '@/lib/medications/format';
import {
  checkRegimenInteractions,
  highestSeverity,
  severityRank,
} from '@/lib/medications/interactions';
import { buildReconciliation } from '@/lib/medications/reconciliation';
import {
  SAMPLE_PATIENTS,
  SAMPLE_HISTORY,
  SAMPLE_REFILL_REQUESTS,
  SAMPLE_REPORTED_MEDICATIONS,
  SAMPLE_SIDE_EFFECT_REPORTS,
  getSampleMedications,
  getSamplePatient,
} from '@/lib/medications/sampleData';
import type {
  AdherenceDose,
  Medication,
  MedicationHistoryEvent,
  NewMedicationInput,
  RefillRequest,
  RefillStatus,
  SideEffectReport,
} from '@/lib/medications/types';

interface MedicationsResult {
  medications: Medication[];
  /** Where the data came from — surfaced so clinicians know what they see. */
  source: 'api' | 'sample';
}

/**
 * Issue #1314 — the medication API may not be deployed yet, so a failed request
 * falls back to the demo regimen for the selected patient. The fallback is
 * surfaced in the UI rather than hidden.
 */
async function loadMedications(patientId: string): Promise<MedicationsResult> {
  try {
    const response = await fetch(`${API_V1}/medications?patientId=${patientId}`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error(`Request failed with ${response.status}`);
    const body = await response.json();
    const payload: unknown = body?.data;
    if (Array.isArray(payload) && payload.length > 0) {
      return { medications: payload as Medication[], source: 'api' };
    }
    throw new Error('No medications returned');
  } catch {
    return { medications: getSampleMedications(patientId), source: 'sample' };
  }
}

const PATIENT_OPTIONS = SAMPLE_PATIENTS.map((patient) => ({
  value: patient.id,
  label: `${patient.name} · ${patient.mrn}`,
}));

type TabValue =
  | 'active'
  | 'add'
  | 'history'
  | 'refills'
  | 'adherence'
  | 'side-effects'
  | 'reconciliation'
  | 'export';

export default function MedicationsClient() {
  const { user } = useAuth();
  const actor = user?.name ?? 'Clinician';

  const [patientId, setPatientId] = useState(PATIENT_OPTIONS[0]?.value ?? 'p-1001');
  const [tab, setTab] = useState<TabValue>('active');
  const [medications, setMedications] = useState<Medication[]>([]);
  const [refills, setRefills] = useState<RefillRequest[]>([]);
  const [sideEffects, setSideEffects] = useState<SideEffectReport[]>([]);
  const [history, setHistory] = useState<MedicationHistoryEvent[]>([]);
  const [doseOverrides, setDoseOverrides] = useState<Record<string, number>>({});
  const [discontinuing, setDiscontinuing] = useState<Medication | null>(null);
  const [historyFocus, setHistoryFocus] = useState<string | null>(null);
  const [adherenceMedicationId, setAdherenceMedicationId] = useState('');
  const [pendingSync, setPendingSync] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<MedicationsResult>({
    queryKey: ['medications', patientId],
    queryFn: () => loadMedications(patientId),
  });

  useEffect(() => {
    if (!data) return;
    setMedications(data.medications);
    setRefills(data.source === 'sample' ? SAMPLE_REFILL_REQUESTS : []);
    setSideEffects(data.source === 'sample' ? SAMPLE_SIDE_EFFECT_REPORTS : []);
    setHistory(data.source === 'sample' ? SAMPLE_HISTORY : []);
    setDoseOverrides({});
    const firstActive = data.medications.find((item) => item.status === 'active');
    setAdherenceMedicationId(firstActive?.id ?? data.medications[0]?.id ?? '');
  }, [data]);

  /** Gives visual feedback while a change is applied. */
  const persist = useCallback((mutate: () => void) => {
    setPendingSync(true);
    mutate();
    window.setTimeout(() => setPendingSync(false), 300);
  }, []);

  const patient = useMemo(() => getSamplePatient(patientId), [patientId]);
  const activeMedications = useMemo(
    () => medications.filter((medication) => medication.status === 'active'),
    [medications]
  );
  const regimenInteractions = useMemo(
    () => checkRegimenInteractions(activeMedications),
    [activeMedications]
  );
  const reconciliation = useMemo(
    () => buildReconciliation(medications, SAMPLE_REPORTED_MEDICATIONS),
    [medications]
  );
  const adherenceMedication = useMemo(
    () => medications.find((medication) => medication.id === adherenceMedicationId) ?? null,
    [medications, adherenceMedicationId]
  );
  const adherenceDoses: AdherenceDose[] = useMemo(() => {
    if (!adherenceMedication) return [];
    return generateAdherenceDoses(adherenceMedication.id, adherenceMedication.frequency).map(
      (dose) => ({
        ...dose,
        taken: doseOverrides[`${adherenceMedication.id}:${dose.date}`] ?? dose.taken,
      })
    );
  }, [adherenceMedication, doseOverrides]);

  const overallSeverity = highestSeverity(regimenInteractions);

  const addHistory = (event: Omit<MedicationHistoryEvent, 'id' | 'at'>) => {
    const entry: MedicationHistoryEvent = {
      ...event,
      id: makeId('hist'),
      at: new Date().toISOString(),
    };
    setHistory((current) => [entry, ...current]);
  };

  const handleAddMedication = (input: NewMedicationInput) => {
    persist(() => {
      const now = new Date().toISOString();
      const medication: Medication = {
        id: makeId('med'),
        patientId,
        drugId: input.drugId,
        drugName: input.drugName,
        genericName: input.genericName,
        drugClass: input.drugClass,
        route: input.route,
        dosage: input.dosage,
        frequency: input.frequency,
        startDate: input.startDate,
        status: 'active',
        prescriber: input.prescriber,
        indication: input.indication,
        instructions: input.instructions,
        quantity: input.quantity,
        refillsRemaining: input.refillsRemaining,
        lastFilledAt: null,
        endDate: null,
        discontinuedReason: null,
        discontinuedBy: null,
        discontinuedAt: null,
        source: input.source,
        createdAt: now,
        updatedAt: now,
      };
      setMedications((current) => [...current, medication]);
      addHistory({
        medicationId: medication.id,
        medicationName: medication.drugName,
        type: 'created',
        actor,
        summary: `Started ${input.dosage} ${FREQUENCY_LABELS[input.frequency].toLowerCase()}${
          input.indication ? ` for ${input.indication}` : ''
        }.`,
      });
      setAdherenceMedicationId((current) => current || medication.id);
      setTab('active');
    });
  };

  const handleDiscontinue = (medicationId: string, reason: string, notes: string) => {
    persist(() => {
      const today = todayIso();
      const target = medications.find((medication) => medication.id === medicationId);
      setMedications((current) =>
        current.map((medication) =>
          medication.id === medicationId
            ? {
                ...medication,
                status: 'discontinued',
                endDate: today,
                discontinuedReason: notes ? `${reason} — ${notes}` : reason,
                discontinuedBy: actor,
                discontinuedAt: today,
                updatedAt: today,
              }
            : medication
        )
      );
      setRefills((current) =>
        current.map((request) =>
          request.medicationId === medicationId && request.status === 'pending'
            ? { ...request, status: 'denied', notes: 'Medication discontinued' }
            : request
        )
      );
      if (target) {
        addHistory({
          medicationId: target.id,
          medicationName: target.drugName,
          type: 'discontinued',
          actor,
          summary: notes ? `${reason}. ${notes}` : reason,
        });
      }
      setDiscontinuing(null);
    });
  };

  const handleRequestRefill = (request: NewRefillRequest) => {
    persist(() => {
      const entry: RefillRequest = {
        id: makeId('refill'),
        medicationId: request.medicationId,
        medicationName: request.medicationName,
        requestedAt: new Date().toISOString(),
        requestedBy: actor,
        pharmacy: request.pharmacy,
        status: 'pending',
        notes: request.notes,
      };
      setRefills((current) => [entry, ...current]);
      addHistory({
        medicationId: request.medicationId,
        medicationName: request.medicationName,
        type: 'refill_requested',
        actor,
        summary: `Refill requested from ${request.pharmacy}.`,
      });
    });
  };

  const handleUpdateRefillStatus = (requestId: string, status: RefillStatus) => {
    persist(() => {
      const request = refills.find((item) => item.id === requestId);
      if (!request) return;

      setRefills((current) =>
        current.map((item) => (item.id === requestId ? { ...item, status } : item))
      );

      if (status === 'approved' || status === 'dispensed') {
        const today = todayIso();
        setMedications((current) =>
          current.map((medication) =>
            medication.id === request.medicationId
              ? {
                  ...medication,
                  refillsRemaining: Math.max(medication.refillsRemaining - 1, 0),
                  lastFilledAt: today,
                  updatedAt: today,
                }
              : medication
          )
        );
      }

      addHistory({
        medicationId: request.medicationId,
        medicationName: request.medicationName,
        type: 'refill_requested',
        actor,
        summary: `Refill ${status} — ${request.pharmacy}.`,
      });
    });
  };

  const handleSideEffect = (report: NewSideEffectReport) => {
    persist(() => {
      const entry: SideEffectReport = {
        id: makeId('se'),
        medicationId: report.medicationId,
        medicationName: report.medicationName,
        reportedAt: new Date().toISOString(),
        reportedBy: actor,
        severity: report.severity,
        symptoms: report.symptoms,
        description: report.description,
        actionTaken: report.actionTaken,
      };
      setSideEffects((current) => [entry, ...current]);
      addHistory({
        medicationId: report.medicationId,
        medicationName: report.medicationName,
        type: 'side_effect_reported',
        actor,
        summary: `${report.severity} reaction: ${report.symptoms.join(', ') || report.description}`,
      });
    });
  };

  const handleLogDose = (date: string, taken: number) => {
    if (!adherenceMedication) return;
    setDoseOverrides((current) => ({
      ...current,
      [`${adherenceMedication.id}:${date}`]: taken,
    }));
  };

  const handleResolve = (entryId: string, resolution: 'accepted' | 'dismissed') => {
    persist(() => {
      const entry = reconciliation.find((item) => item.id === entryId);
      if (!entry) return;
      addHistory({
        medicationId: entryId,
        medicationName: entry.drugName,
        type: 'reconciled',
        actor,
        summary: `Reconciliation finding ${resolution}: ${entry.note}`,
      });
    });
  };

  return (
    <PageWrapper className="space-y-6 py-6">
      <PageHeader
        title="Medication manager"
        subtitle={`${patient.name} · ${patient.mrn} · born ${patient.dateOfBirth}`}
        actions={
          <div className="w-64">
            <Select
              label="Patient"
              options={PATIENT_OPTIONS}
              value={patientId}
              onChange={(event) => setPatientId(event.target.value)}
            />
          </div>
        }
      />

      {data?.source === 'sample' && (
        <p
          role="status"
          className="border-warning-200 bg-warning-50 rounded-lg border px-3 py-2 text-sm text-neutral-700"
        >
          The medication service is unavailable, so this patient&rsquo;s demo regimen is shown.
          Changes are held locally for this session.
        </p>
      )}

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <ErrorMessage
          message={error instanceof Error ? error.message : 'Failed to load medications'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !error && (
        <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)}>
          <TabsList className="overflow-x-auto">
            <TabsTrigger value="active">Active medications</TabsTrigger>
            <TabsTrigger value="add">Add medication</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="refills">Refills</TabsTrigger>
            <TabsTrigger value="adherence">Adherence</TabsTrigger>
            <TabsTrigger value="side-effects">Side effects</TabsTrigger>
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
            <TabsTrigger value="export">Pharmacy export</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            {regimenInteractions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Regimen interaction review</CardTitle>
                  <Badge variant={overallSeverity === 'major' ? 'danger' : 'warning'}>
                    {regimenInteractions.length} finding
                    {regimenInteractions.length === 1 ? '' : 's'}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <InteractionWarnings
                    checks={[...regimenInteractions].sort(
                      (a, b) => severityRank(b.severity) - severityRank(a.severity)
                    )}
                    title="Interactions in the current regimen"
                  />
                </CardContent>
              </Card>
            )}

            <MedicationList
              medications={medications}
              interactions={regimenInteractions}
              onDiscontinue={setDiscontinuing}
              onViewHistory={(medication) => {
                setHistoryFocus(medication.id);
                setTab('history');
              }}
              onRequestRefill={(medication) => {
                setAdherenceMedicationId(medication.id);
                setTab('refills');
              }}
            />
          </TabsContent>

          <TabsContent value="add">
            <Card>
              <CardHeader>
                <CardTitle>Add a medication</CardTitle>
              </CardHeader>
              <CardContent>
                <MedicationForm
                  activeMedications={activeMedications}
                  defaultPrescriber={actor}
                  isSubmitting={pendingSync}
                  onSubmit={handleAddMedication}
                  onCancel={() => setTab('active')}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <MedicationHistory events={history} focusMedicationId={historyFocus} />
          </TabsContent>

          <TabsContent value="refills">
            <RefillRequests
              requests={refills}
              medications={medications}
              isSubmitting={pendingSync}
              onRequest={handleRequestRefill}
              onUpdateStatus={handleUpdateRefillStatus}
            />
          </TabsContent>

          <TabsContent value="adherence" className="space-y-4">
            <div className="max-w-md">
              <Select
                label="Medication"
                placeholder="Select a medication"
                options={medications.map((medication) => ({
                  value: medication.id,
                  label: `${medication.drugName} ${medication.dosage}`,
                }))}
                value={adherenceMedicationId}
                onChange={(event) => setAdherenceMedicationId(event.target.value)}
              />
            </div>
            {adherenceMedication ? (
              <AdherenceTracker
                medication={adherenceMedication}
                doses={adherenceDoses}
                isSubmitting={pendingSync}
                onLogDose={handleLogDose}
              />
            ) : (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Add a medication to start tracking adherence.
              </p>
            )}
          </TabsContent>

          <TabsContent value="side-effects">
            <SideEffectReportForm
              medications={medications}
              reports={sideEffects}
              isSubmitting={pendingSync}
              onSubmit={handleSideEffect}
            />
          </TabsContent>

          <TabsContent value="reconciliation">
            <ReconciliationView
              entries={reconciliation}
              isSubmitting={pendingSync}
              onResolve={handleResolve}
            />
          </TabsContent>

          <TabsContent value="export">
            <PharmacyExportPanel patient={patient} medications={medications} />
          </TabsContent>
        </Tabs>
      )}

      <DiscontinuationDialog
        medication={discontinuing}
        isSubmitting={pendingSync}
        onConfirm={handleDiscontinue}
        onClose={() => setDiscontinuing(null)}
      />
    </PageWrapper>
  );
}
