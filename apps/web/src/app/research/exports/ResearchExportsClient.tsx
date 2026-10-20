'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorMessage,
  Input,
  Modal,
  PageWrapper,
  PageHeader,
  Select,
  Skeleton,
  Spinner,
} from '@/components/ui';
import { toast } from '@/components/ui/Toast';
import {
  useResearchExports,
  useRequestResearchExport,
  type AnonymizationLevel,
  type ExportJob,
  type ExportRequest,
} from '@/lib/queries/useResearchExports';

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = ['SUPER_ADMIN', 'CLINIC_ADMIN'] as const;

const AVAILABLE_FIELDS = [
  { id: 'age', label: 'Age', category: 'Demographics' },
  { id: 'sex', label: 'Sex', category: 'Demographics' },
  { id: 'conditions', label: 'Conditions (ICD-10)', category: 'Clinical' },
  { id: 'medications', label: 'Medications', category: 'Clinical' },
  { id: 'labResults', label: 'Lab Results', category: 'Clinical' },
  { id: 'vitalSigns', label: 'Vital Signs', category: 'Clinical' },
  { id: 'encounterDates', label: 'Encounter Dates', category: 'Encounters' },
  { id: 'encounterTypes', label: 'Encounter Types', category: 'Encounters' },
  { id: 'immunizations', label: 'Immunizations', category: 'Preventive' },
  { id: 'smokingStatus', label: 'Smoking Status', category: 'Social History' },
];

const ANONYMIZATION_LEVELS: { value: AnonymizationLevel; label: string; description: string }[] = [
  {
    value: 'minimal',
    label: 'Minimal',
    description: 'Remove direct identifiers (name, DOB, MRN). Dates shifted ±90 days.',
  },
  {
    value: 'standard',
    label: 'Standard (HIPAA Safe Harbor)',
    description:
      'Remove all 18 HIPAA identifiers. Generalise ZIP to 3-digit prefix. Ages ≥90 shown as 90+.',
  },
  {
    value: 'strict',
    label: 'Strict (k=5 anonymity)',
    description:
      'All standard transformations plus k-anonymity grouping. Rare combinations suppressed.',
  },
];

const STATUS_CONFIG: Record<
  ExportJob['status'],
  { label: string; variant: 'default' | 'warning' | 'success' | 'danger'; icon: string }
> = {
  queued: { label: 'Queued', variant: 'default', icon: '⏳' },
  running: { label: 'Processing…', variant: 'warning', icon: '⚙️' },
  done: { label: 'Ready', variant: 'success', icon: '✅' },
  failed: { label: 'Failed', variant: 'danger', icon: '❌' },
  expired: { label: 'Expired', variant: 'default', icon: '🕰️' },
};

// ── Field transformation legend ────────────────────────────────────────────────

const TRANSFORMATION_LABELS: Record<string, string> = {
  removed: 'Removed',
  generalised: 'Generalised',
  pseudonymised: 'Pseudonymised',
};

const TRANSFORMATION_COLORS: Record<string, string> = {
  removed: 'text-red-600 dark:text-red-400',
  generalised: 'text-amber-600 dark:text-amber-400',
  pseudonymised: 'text-blue-600 dark:text-blue-400',
};

// ── Helper ────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function timeUntilExpiry(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`;
}

// ── Job Status Card ───────────────────────────────────────────────────────────

function JobCard({ job }: { job: ExportJob }) {
  const cfg = STATUS_CONFIG[job.status];
  const level = ANONYMIZATION_LEVELS.find((l) => l.value === job.anonymizationLevel);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
              Export {job._id.slice(-6).toUpperCase()}
            </p>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              Requested {formatDate(job.createdAt)}
            </p>
          </div>
          <Badge variant={cfg.variant}>
            <span aria-hidden="true">{cfg.icon}</span> {cfg.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-500">Anonymisation</dt>
            <dd className="font-medium text-neutral-700 dark:text-neutral-200">
              {level?.label ?? job.anonymizationLevel}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500">Fields</dt>
            <dd className="font-medium text-neutral-700 dark:text-neutral-200">
              {job.fields.length} selected
            </dd>
          </div>
          {job.rowCount !== undefined && (
            <div className="flex justify-between">
              <dt className="text-neutral-500">Rows</dt>
              <dd className="font-medium text-neutral-700 dark:text-neutral-200">
                {job.rowCount.toLocaleString()}
              </dd>
            </div>
          )}
        </dl>

        {/* Progress bar while running */}
        {job.status === 'running' && typeof job.progress === 'number' && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-neutral-500">
              <span>Progress</span>
              <span>{job.progress}%</span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700"
              role="progressbar"
              aria-valuenow={job.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="bg-primary-500 h-full rounded-full transition-all"
                style={{ width: `${job.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Field transformations */}
        {job.fieldTransformations && Object.keys(job.fieldTransformations).length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200">
              Field transformations applied
            </summary>
            <ul className="mt-2 space-y-1">
              {Object.entries(job.fieldTransformations).map(([field, transform]) => (
                <li key={field} className="flex items-center justify-between text-xs">
                  <span className="text-neutral-600 dark:text-neutral-300">{field}</span>
                  <span className={TRANSFORMATION_COLORS[transform] ?? ''}>
                    {TRANSFORMATION_LABELS[transform] ?? transform}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Download link */}
        {job.status === 'done' && job.downloadUrl && (
          <div className="mt-4 flex items-center justify-between gap-2">
            {job.expiresAt && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠ {timeUntilExpiry(job.expiresAt)}
              </p>
            )}
            <a
              href={job.downloadUrl}
              download
              className="bg-primary-500 hover:bg-primary-600 focus:ring-primary-500 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2"
              aria-label={`Download export ${job._id.slice(-6).toUpperCase()}`}
            >
              ⬇ Download CSV
            </a>
          </div>
        )}

        {/* Error message */}
        {job.status === 'failed' && job.error && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{job.error}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Request Form Modal ────────────────────────────────────────────────────────

interface RequestFormProps {
  open: boolean;
  onClose: () => void;
}

function RequestExportModal({ open, onClose }: RequestFormProps) {
  const [step, setStep] = useState<'filters' | 'fields' | 'review'>('filters');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [anonLevel, setAnonLevel] = useState<AnonymizationLevel>('standard');
  const [filters, setFilters] = useState({
    ageMin: '',
    ageMax: '',
    conditions: '',
    medications: '',
    dateFrom: '',
    dateTo: '',
  });

  const { mutate: requestExport, isPending } = useRequestResearchExport();

  const toggleField = (id: string) => {
    setSelectedFields((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  };

  const handleSubmit = () => {
    if (selectedFields.length === 0) {
      toast.error('Select at least one field to export.');
      return;
    }

    const req: ExportRequest = {
      cohortFilters: {
        ...(filters.ageMin ? { ageMin: Number(filters.ageMin) } : {}),
        ...(filters.ageMax ? { ageMax: Number(filters.ageMax) } : {}),
        ...(filters.conditions
          ? {
              conditions: filters.conditions
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            }
          : {}),
        ...(filters.medications
          ? {
              medications: filters.medications
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            }
          : {}),
        ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
        ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
      },
      fields: selectedFields,
      anonymizationLevel: anonLevel,
    };

    requestExport(req, {
      onSuccess: () => {
        toast.success('Export job queued. It will appear in the list below.');
        onClose();
        setStep('filters');
        setSelectedFields([]);
        setAnonLevel('standard');
        setFilters({
          ageMin: '',
          ageMax: '',
          conditions: '',
          medications: '',
          dateFrom: '',
          dateTo: '',
        });
      },
      onError: (err) => {
        toast.error(err.message ?? 'Failed to queue export.');
      },
    });
  };

  const selectedLevel = ANONYMIZATION_LEVELS.find((l) => l.value === anonLevel);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request Research Export"
      description="Export a de-identified cohort dataset for research use."
      size="lg"
    >
      {/* Step tabs */}
      <nav
        className="mt-4 flex gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-700"
        aria-label="Export request steps"
      >
        {(['filters', 'fields', 'review'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(s)}
            className={[
              'flex-1 rounded-md py-1.5 text-sm font-medium transition-colors',
              step === s
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100'
                : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200',
            ].join(' ')}
            aria-current={step === s ? 'step' : undefined}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </nav>

      {/* Step: Cohort Filters */}
      {step === 'filters' && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Define the patient cohort to include. Leave blank for no restriction.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-200">
                Min Age
              </label>
              <Input
                type="number"
                min={0}
                max={150}
                placeholder="e.g. 18"
                value={filters.ageMin}
                onChange={(e) => setFilters((f) => ({ ...f, ageMin: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-200">
                Max Age
              </label>
              <Input
                type="number"
                min={0}
                max={150}
                placeholder="e.g. 65"
                value={filters.ageMax}
                onChange={(e) => setFilters((f) => ({ ...f, ageMax: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-200">
              Conditions (ICD-10 codes, comma-separated)
            </label>
            <Input
              placeholder="e.g. E11, I10"
              value={filters.conditions}
              onChange={(e) => setFilters((f) => ({ ...f, conditions: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-200">
              Medications (comma-separated)
            </label>
            <Input
              placeholder="e.g. metformin, lisinopril"
              value={filters.medications}
              onChange={(e) => setFilters((f) => ({ ...f, medications: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-200">
                Date From
              </label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-200">
                Date To
              </label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              />
            </div>
          </div>
          <Button className="w-full" onClick={() => setStep('fields')}>
            Next: Select Fields →
          </Button>
        </div>
      )}

      {/* Step: Field Selection */}
      {step === 'fields' && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Choose which fields to include in the export.
          </p>

          {/* Group by category */}
          {Array.from(new Set(AVAILABLE_FIELDS.map((f) => f.category))).map((category) => (
            <div key={category}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                {category}
              </p>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_FIELDS.filter((f) => f.category === category).map((field) => {
                  const checked = selectedFields.includes(field.id);
                  return (
                    <button
                      key={field.id}
                      type="button"
                      onClick={() => toggleField(field.id)}
                      aria-pressed={checked}
                      className={[
                        'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                        checked
                          ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-900/30 dark:text-primary-300'
                          : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
                      ].join(' ')}
                    >
                      {checked ? '✓ ' : ''}
                      {field.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-200">
              Anonymisation Level
            </label>
            <Select
              value={anonLevel}
              onChange={(e) => setAnonLevel(e.target.value as AnonymizationLevel)}
              options={ANONYMIZATION_LEVELS.map((l) => ({ value: l.value, label: l.label }))}
            />
            {selectedLevel && (
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {selectedLevel.description}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('filters')}>
              ← Back
            </Button>
            <Button
              className="flex-1"
              onClick={() => setStep('review')}
              disabled={selectedFields.length === 0}
            >
              Next: Review →
            </Button>
          </div>
        </div>
      )}

      {/* Step: Review */}
      {step === 'review' && (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
            <h3 className="mb-3 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
              Export Summary
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Anonymisation</dt>
                <dd className="font-medium text-neutral-700 dark:text-neutral-200">
                  {selectedLevel?.label}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Fields</dt>
                <dd className="max-w-xs text-right font-medium text-neutral-700 dark:text-neutral-200">
                  {selectedFields
                    .map((id) => AVAILABLE_FIELDS.find((f) => f.id === id)?.label ?? id)
                    .join(', ')}
                </dd>
              </div>
              {filters.ageMin || filters.ageMax ? (
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Age range</dt>
                  <dd className="font-medium text-neutral-700 dark:text-neutral-200">
                    {filters.ageMin || '—'} – {filters.ageMax || '—'}
                  </dd>
                </div>
              ) : null}
              {filters.conditions && (
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Conditions</dt>
                  <dd className="font-medium text-neutral-700 dark:text-neutral-200">
                    {filters.conditions}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            <strong>Data notice:</strong> All exports are de-identified per the{' '}
            {selectedLevel?.label} profile. Download links expire after 24 hours. Usage is logged
            for audit purposes.
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('fields')}>
              ← Back
            </Button>
            <Button className="flex-1" onClick={handleSubmit} loading={isPending}>
              Request Export
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ResearchExportsClient() {
  const { user } = useAuth();
  const [requestModalOpen, setRequestModalOpen] = useState(false);

  const { data: jobs = [], isLoading, error } = useResearchExports();

  // Gate access to SUPER_ADMIN and CLINIC_ADMIN
  if (user && !ALLOWED_ROLES.includes(user.role as (typeof ALLOWED_ROLES)[number])) {
    return (
      <PageWrapper>
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <p className="text-4xl">🚫</p>
          <h1 className="mt-4 text-xl font-semibold text-neutral-800 dark:text-neutral-100">
            Access Restricted
          </h1>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            Research exports are only available to admins.
          </p>
        </div>
      </PageWrapper>
    );
  }

  const activeJobs = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  const completedJobs = jobs.filter((j) => j.status === 'done');
  const otherJobs = jobs.filter((j) => j.status === 'failed' || j.status === 'expired');

  return (
    <PageWrapper>
      <RequestExportModal open={requestModalOpen} onClose={() => setRequestModalOpen(false)} />

      <PageHeader
        title="Research Exports"
        subtitle="Request and download de-identified patient datasets for research purposes."
        actions={<Button onClick={() => setRequestModalOpen(true)}>+ New Export Request</Button>}
      />

      {error && (
        <ErrorMessage
          message={error instanceof Error ? error.message : 'Failed to load exports.'}
          className="mb-6"
        />
      )}

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && jobs.length === 0 && (
        <EmptyState
          title="No export jobs yet"
          description="Request your first de-identified dataset using the button above."
          icon="🔬"
        />
      )}

      {/* Active / In-Progress Jobs */}
      {activeJobs.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            <Spinner size="sm" />
            In Progress ({activeJobs.length})
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeJobs.map((job) => (
              <JobCard key={job._id} job={job} />
            ))}
          </div>
        </section>
      )}

      {/* Ready to Download */}
      {completedJobs.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Ready to Download ({completedJobs.length})
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {completedJobs.map((job) => (
              <JobCard key={job._id} job={job} />
            ))}
          </div>
        </section>
      )}

      {/* Failed / Expired */}
      {otherJobs.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Failed / Expired ({otherJobs.length})
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {otherJobs.map((job) => (
              <JobCard key={job._id} job={job} />
            ))}
          </div>
        </section>
      )}
    </PageWrapper>
  );
}
