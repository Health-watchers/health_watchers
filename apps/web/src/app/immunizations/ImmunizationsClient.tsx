'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  Textarea,
  Toast,
} from '@/components/ui';
import { API_V1 } from '@/lib/api';

type ImmunizationStatus = 'administered' | 'scheduled' | 'overdue' | 'upcoming';

interface ImmunizationRecord {
  _id: string;
  vaccine: string;
  dateAdministered: string;
  administrator?: string;
  lotNumber?: string;
  site?: string;
  notes?: string;
  nextDoseDate?: string;
  patientId?: string;
}

interface UpcomingVaccine {
  _id: string;
  vaccine: string;
  dueDate: string;
  status: ImmunizationStatus;
  description?: string;
}

interface ImmunizationFormData {
  vaccine: string;
  dateAdministered: string;
  administrator: string;
  lotNumber: string;
  site: string;
  notes: string;
  nextDoseDate: string;
}

const INITIAL_FORM: ImmunizationFormData = {
  vaccine: '',
  dateAdministered: '',
  administrator: '',
  lotNumber: '',
  site: '',
  notes: '',
  nextDoseDate: '',
};

const STATUS_VARIANT: Record<ImmunizationStatus, 'danger' | 'warning' | 'success' | 'default'> = {
  overdue: 'danger',
  upcoming: 'warning',
  scheduled: 'primary' as 'default',
  administered: 'success',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getUpcomingStatus(dueDate: string): ImmunizationStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 30) return 'upcoming';
  return 'scheduled';
}

async function fetchRecords(): Promise<ImmunizationRecord[]> {
  const res = await fetch(`${API_V1}/immunizations`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load immunization records');
  const data = await res.json();
  return data.data ?? [];
}

async function fetchUpcoming(): Promise<UpcomingVaccine[]> {
  const res = await fetch(`${API_V1}/immunizations/upcoming`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load upcoming vaccines');
  const data = await res.json();
  return data.data ?? [];
}

function AlertBanner({ overdue }: { overdue: UpcomingVaccine[] }) {
  if (overdue.length === 0) return null;
  return (
    <div className="rounded-lg border border-danger-200 bg-danger-50 p-4">
      <div className="flex items-start gap-3">
        <svg className="mt-0.5 h-5 w-5 shrink-0 text-danger-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-danger-700">
            {overdue.length} overdue vaccine{overdue.length > 1 ? 's' : ''}
          </p>
          <ul className="mt-1 space-y-0.5">
            {overdue.map((v) => (
              <li key={v._id} className="text-sm text-danger-600">
                {v.vaccine} — due {formatDate(v.dueDate)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function UpcomingCard({ vaccine }: { vaccine: UpcomingVaccine }) {
  const status = vaccine.status ?? getUpcomingStatus(vaccine.dueDate);
  return (
    <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3">
      <div>
        <p className="text-sm font-medium text-neutral-900">{vaccine.vaccine}</p>
        {vaccine.description && (
          <p className="text-xs text-neutral-500">{vaccine.description}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-neutral-500">{formatDate(vaccine.dueDate)}</span>
        <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
      </div>
    </div>
  );
}

function RecordRow({ record }: { record: ImmunizationRecord }) {
  return (
    <tr className="border-b border-neutral-100 last:border-0">
      <td className="py-3 pr-4 text-sm font-medium text-neutral-900">{record.vaccine}</td>
      <td className="py-3 pr-4 text-sm text-neutral-600">{formatDate(record.dateAdministered)}</td>
      <td className="py-3 pr-4 text-sm text-neutral-600">{record.administrator ?? '—'}</td>
      <td className="py-3 pr-4 font-mono text-xs text-neutral-500">{record.lotNumber ?? '—'}</td>
      <td className="py-3 pr-4 text-sm text-neutral-600">{record.site ?? '—'}</td>
      <td className="py-3 text-sm text-neutral-500">
        {record.nextDoseDate ? formatDate(record.nextDoseDate) : '—'}
      </td>
    </tr>
  );
}

export default function ImmunizationsClient() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ImmunizationFormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const {
    data: records = [],
    isLoading: recordsLoading,
    error: recordsError,
  } = useQuery<ImmunizationRecord[]>({
    queryKey: ['immunizations', 'records'],
    queryFn: fetchRecords,
  });

  const {
    data: upcoming = [],
    isLoading: upcomingLoading,
    error: upcomingError,
  } = useQuery<UpcomingVaccine[]>({
    queryKey: ['immunizations', 'upcoming'],
    queryFn: fetchUpcoming,
  });

  const overdue = upcoming.filter(
    (v) => (v.status ?? getUpcomingStatus(v.dueDate)) === 'overdue',
  );

  const handleChange = (field: keyof ImmunizationFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vaccine || !form.dateAdministered) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_V1}/immunizations`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaccine: form.vaccine,
          dateAdministered: form.dateAdministered,
          administrator: form.administrator || undefined,
          lotNumber: form.lotNumber || undefined,
          site: form.site || undefined,
          notes: form.notes || undefined,
          nextDoseDate: form.nextDoseDate || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to save immunization record');
      setToast({ message: 'Immunization record saved', type: 'success' });
      setForm(INITIAL_FORM);
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['immunizations'] });
    } catch {
      setToast({ message: 'Failed to save immunization record', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageWrapper className="py-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Immunization Schedule</h1>
        <Button onClick={() => setShowForm(true)}>+ Log Vaccination</Button>
      </div>

      {/* Overdue alerts */}
      {!upcomingLoading && <AlertBanner overdue={overdue} />}

      <div className="mt-6 space-y-6">
        {/* Upcoming vaccines */}
        <Card padding="none">
          <CardHeader className="px-5 pt-5">
            <CardTitle>Upcoming Vaccines</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {upcomingLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-100" />
                ))}
              </div>
            ) : upcomingError ? (
              <ErrorMessage
                message="Failed to load upcoming vaccines"
                onRetry={() => queryClient.invalidateQueries({ queryKey: ['immunizations', 'upcoming'] })}
              />
            ) : upcoming.length === 0 ? (
              <EmptyState title="No upcoming vaccines" icon="💉" />
            ) : (
              <div className="space-y-2">
                {upcoming.map((v) => (
                  <UpcomingCard key={v._id} vaccine={v} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Immunization records */}
        <Card padding="none">
          <CardHeader className="px-5 pt-5">
            <CardTitle>Immunization Records</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {recordsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-neutral-100" />
                ))}
              </div>
            ) : recordsError ? (
              <ErrorMessage
                message="Failed to load immunization records"
                onRetry={() => queryClient.invalidateQueries({ queryKey: ['immunizations', 'records'] })}
              />
            ) : records.length === 0 ? (
              <EmptyState title="No immunization records" icon="📋" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      <th className="pb-2 pr-4">Vaccine</th>
                      <th className="pb-2 pr-4">Date Administered</th>
                      <th className="pb-2 pr-4">Administrator</th>
                      <th className="pb-2 pr-4">Lot #</th>
                      <th className="pb-2 pr-4">Site</th>
                      <th className="pb-2">Next Dose</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <RecordRow key={r._id} record={r} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add entry modal */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setForm(INITIAL_FORM); }}
        title="Log Vaccination"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Vaccine *"
              placeholder="e.g. Influenza, COVID-19"
              value={form.vaccine}
              onChange={(e) => handleChange('vaccine', e.target.value)}
              required
            />
            <Input
              label="Date Administered *"
              type="date"
              value={form.dateAdministered}
              onChange={(e) => handleChange('dateAdministered', e.target.value)}
              required
            />
            <Input
              label="Administrator"
              placeholder="Clinician name"
              value={form.administrator}
              onChange={(e) => handleChange('administrator', e.target.value)}
            />
            <Input
              label="Lot Number"
              placeholder="Vaccine lot number"
              value={form.lotNumber}
              onChange={(e) => handleChange('lotNumber', e.target.value)}
            />
            <Input
              label="Injection Site"
              placeholder="e.g. Left deltoid"
              value={form.site}
              onChange={(e) => handleChange('site', e.target.value)}
            />
            <Input
              label="Next Dose Date"
              type="date"
              value={form.nextDoseDate}
              onChange={(e) => handleChange('nextDoseDate', e.target.value)}
            />
          </div>
          <Textarea
            label="Notes"
            placeholder="Any additional notes"
            value={form.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setShowForm(false); setForm(INITIAL_FORM); }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Save Record
            </Button>
          </div>
        </form>
      </Modal>
    </PageWrapper>
  );
}
