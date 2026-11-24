'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
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
import { queryKeys } from '@/lib/queryKeys';
import { CriticalValueBanner } from '@/components/lab-results/CriticalValueBanner';
import { InterpretationGuide } from '@/components/lab-results/InterpretationGuide';
import { LabHistoryTimeline } from '@/components/lab-results/LabHistoryTimeline';
import { LabResultsExport } from '@/components/lab-results/LabResultsExport';
import { LabResultsFilters, EMPTY_LAB_FILTERS } from '@/components/lab-results/LabResultsFilters';
import { LabResultsTable } from '@/components/lab-results/LabResultsTable';
import { LabTrendChart } from '@/components/lab-results/LabTrendChart';
import { ResultsComparison } from '@/components/lab-results/ResultsComparison';
import {
  criticalFindings,
  filterFindings,
  toFindings,
} from '@/lib/lab-results/evaluation';
import {
  SAMPLE_LAB_PATIENTS,
  getSampleLabPatient,
  getSampleLabSets,
} from '@/lib/lab-results/sampleData';
import type { AnalyteKey, LabResultSet, LabResultsFilters as Filters } from '@/lib/lab-results/types';

interface LabResultsPayload {
  sets: LabResultSet[];
  source: 'api' | 'sample';
}

/**
 * Issue #1313 — the lab results API may not be deployed yet, so a failed request
 * falls back to the demo history. The fallback is surfaced in the UI.
 */
async function loadLabResults(patientId: string): Promise<LabResultsPayload> {
  try {
    const response = await fetch(`${API_V1}/lab-results?patientId=${patientId}`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error(`Request failed with ${response.status}`);
    const body = await response.json();
    const payload: unknown = body?.data;
    if (Array.isArray(payload) && payload.length > 0) {
      return { sets: payload as LabResultSet[], source: 'api' };
    }
    throw new Error('No results returned');
  } catch {
    return { sets: getSampleLabSets(patientId), source: 'sample' };
  }
}

const PATIENT_OPTIONS = SAMPLE_LAB_PATIENTS.map((patient) => ({
  value: patient.id,
  label: `${patient.name} · ${patient.mrn}`,
}));

type TabValue = 'results' | 'trends' | 'compare' | 'guide' | 'timeline' | 'export';

export default function LabResultsClient() {
  const [patientId, setPatientId] = useState(PATIENT_OPTIONS[0]?.value ?? 'p-1001');
  const [tab, setTab] = useState<TabValue>('results');
  const [filters, setFilters] = useState<Filters>(EMPTY_LAB_FILTERS);
  const [selectedAnalyte, setSelectedAnalyte] = useState<AnalyteKey | null>(null);
  const [focusedSetId, setFocusedSetId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<LabResultsPayload>({
    queryKey: queryKeys.labResults.byPatient(patientId),
    queryFn: () => loadLabResults(patientId),
  });

  const patient = useMemo(() => getSampleLabPatient(patientId), [patientId]);
  const sets = useMemo(() => data?.sets ?? [], [data]);
  const findings = useMemo(() => toFindings(sets), [sets]);
  const filtered = useMemo(() => filterFindings(findings, filters), [findings, filters]);
  const critical = useMemo(() => criticalFindings(sets), [sets]);

  const handleSelectAnalyte = (analyte: AnalyteKey) => {
    setSelectedAnalyte(analyte);
    setTab('trends');
  };

  return (
    <PageWrapper className="space-y-6 py-6">
      <PageHeader
        title="Lab results"
        subtitle={`${patient.name} · ${patient.mrn} · ${findings.length} result${
          findings.length === 1 ? '' : 's'
        } on file`}
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
          The lab results service is unavailable, so this patient&rsquo;s demo results are shown.
        </p>
      )}

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <ErrorMessage
          message={error instanceof Error ? error.message : 'Failed to load lab results'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !error && (
        <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)}>
          <TabsList className="overflow-x-auto">
            <TabsTrigger value="results">Results</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="compare">Compare</TabsTrigger>
            <TabsTrigger value="guide">Interpretation guide</TabsTrigger>
            <TabsTrigger value="timeline">History</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="results" className="space-y-4">
            <CriticalValueBanner findings={critical} />
            <LabResultsFilters
              filters={filters}
              resultCount={filtered.length}
              onChange={setFilters}
              onReset={() => setFilters(EMPTY_LAB_FILTERS)}
            />
            <LabResultsTable
              findings={filtered}
              selectedAnalyte={selectedAnalyte}
              onSelectAnalyte={handleSelectAnalyte}
            />
          </TabsContent>

          <TabsContent value="trends">
            <Card>
              <CardHeader>
                <CardTitle>Trend analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <LabTrendChart
                  sets={sets}
                  analyte={selectedAnalyte}
                  onAnalyteChange={setSelectedAnalyte}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compare">
            <Card>
              <CardHeader>
                <CardTitle>Compare reports</CardTitle>
              </CardHeader>
              <CardContent>
                <ResultsComparison sets={sets} focusSetId={focusedSetId} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="guide">
            <InterpretationGuide
              selectedAnalyte={selectedAnalyte}
              onSelectAnalyte={handleSelectAnalyte}
            />
          </TabsContent>

          <TabsContent value="timeline">
            <LabHistoryTimeline
              sets={sets}
              selectedSetId={focusedSetId}
              onSelectSet={(setId) => {
                setFocusedSetId(setId);
                setTab('compare');
              }}
            />
          </TabsContent>

          <TabsContent value="export">
            <LabResultsExport
              patient={patient}
              findings={filtered}
              totalCount={findings.length}
            />
          </TabsContent>
        </Tabs>
      )}
    </PageWrapper>
  );
}
