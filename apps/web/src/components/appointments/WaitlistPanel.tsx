'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, ErrorMessage, Modal, SlideOver, Spinner, Toast } from '@/components/ui';
import { AppointmentBookingForm, type AppointmentDraft } from './AppointmentBookingForm';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

type WaitlistStatus = 'waiting' | 'notified' | 'booked' | 'expired';
type WaitlistPriority = 'routine' | 'urgent';
type AppointmentType = 'consultation' | 'follow-up' | 'procedure' | 'emergency';

interface PopulatedPatient {
  _id: string;
  firstName?: string;
  lastName?: string;
  systemId?: string;
}

export interface WaitlistEntry {
  _id: string;
  patientId: string | PopulatedPatient;
  doctorId?: string;
  requestedDate: string;
  appointmentType: AppointmentType;
  priority: WaitlistPriority;
  status: WaitlistStatus;
  position: number;
  addedAt: string;
  notifiedAt?: string;
  expiresAt?: string;
}

const APPOINTMENT_TYPES: AppointmentType[] = ['consultation', 'follow-up', 'procedure', 'emergency'];

function patientIdOf(entry: WaitlistEntry): string {
  return typeof entry.patientId === 'string' ? entry.patientId : entry.patientId._id;
}

function patientLabel(entry: WaitlistEntry): string {
  if (typeof entry.patientId === 'string') return entry.patientId;
  const { firstName, lastName, systemId, _id } = entry.patientId;
  const name = [firstName, lastName].filter(Boolean).join(' ');
  return name ? `${name}${systemId ? ` (${systemId})` : ''}` : _id;
}

/** The expiry job runs every 15 min, so treat a lapsed offer as expired immediately. */
export function isWaitlistEntryExpired(entry: WaitlistEntry, now = Date.now()): boolean {
  if (entry.status === 'expired') return true;
  return (
    entry.status === 'notified' && !!entry.expiresAt && new Date(entry.expiresAt).getTime() <= now
  );
}

function formatDate(value?: string, withTime = false) {
  if (!value) return '—';
  const d = new Date(value);
  return withTime
    ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function toLocalInput(value: string) {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  return new Error(body.message ?? `${fallback} (${res.status})`);
}

function useWaitlist(filter: 'active' | 'all') {
  return useQuery<WaitlistEntry[]>({
    queryKey: queryKeys.waitlist.list(filter),
    queryFn: async () => {
      // The API filters on a single status, so "active" merges waiting + notified
      const statuses = filter === 'all' ? ['all'] : ['waiting', 'notified'];
      const results = await Promise.all(
        statuses.map(async (status) => {
          const res = await fetchWithAuth(`${API_V1}/waitlist?status=${status}`);
          if (!res.ok) throw await readError(res, 'Failed to load waitlist');
          const body = await res.json();
          return (body.data ?? []) as WaitlistEntry[];
        })
      );
      return results
        .flat()
        .sort(
          (a, b) =>
            (b.priority === 'urgent' ? 1 : 0) - (a.priority === 'urgent' ? 1 : 0) ||
            new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime()
        );
    },
    refetchInterval: 60_000,
  });
}

interface AddEntryDraft {
  patientId: string;
  doctorId: string;
  requestedDate: string;
  appointmentType: AppointmentType;
  priority: WaitlistPriority;
}

const EMPTY_DRAFT: AddEntryDraft = {
  patientId: '',
  doctorId: '',
  requestedDate: '',
  appointmentType: 'consultation',
  priority: 'routine',
};

function AddToWaitlistForm({
  onSubmit,
  onCancel,
  isLoading,
}: {
  onSubmit: (draft: AddEntryDraft) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [draft, setDraft] = useState<AddEntryDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const objectId = /^[a-f\d]{24}$/i;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!objectId.test(draft.patientId.trim())) next.patientId = 'Enter a valid patient ID';
    if (draft.doctorId && !objectId.test(draft.doctorId.trim()))
      next.doctorId = 'Enter a valid clinician ID or leave blank';
    if (!draft.requestedDate) next.requestedDate = 'Preferred date is required';
    setErrors(next);
    if (Object.keys(next).length === 0) onSubmit(draft);
  };

  const field =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="wl-patient" className="mb-1 block text-sm font-medium text-gray-900">
          Patient ID *
        </label>
        <input
          id="wl-patient"
          className={field}
          value={draft.patientId}
          onChange={(e) => setDraft((d) => ({ ...d, patientId: e.target.value }))}
        />
        {errors.patientId && <p className="mt-1 text-xs text-red-600">{errors.patientId}</p>}
      </div>
      <div>
        <label htmlFor="wl-doctor" className="mb-1 block text-sm font-medium text-gray-900">
          Preferred clinician ID
        </label>
        <input
          id="wl-doctor"
          className={field}
          placeholder="Any clinician"
          value={draft.doctorId}
          onChange={(e) => setDraft((d) => ({ ...d, doctorId: e.target.value }))}
        />
        {errors.doctorId && <p className="mt-1 text-xs text-red-600">{errors.doctorId}</p>}
      </div>
      <div>
        <label htmlFor="wl-date" className="mb-1 block text-sm font-medium text-gray-900">
          Preferred date & time *
        </label>
        <input
          id="wl-date"
          type="datetime-local"
          className={field}
          value={draft.requestedDate}
          onChange={(e) => setDraft((d) => ({ ...d, requestedDate: e.target.value }))}
        />
        {errors.requestedDate && (
          <p className="mt-1 text-xs text-red-600">{errors.requestedDate}</p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="wl-type" className="mb-1 block text-sm font-medium text-gray-900">
            Visit type
          </label>
          <select
            id="wl-type"
            className={field}
            value={draft.appointmentType}
            onChange={(e) =>
              setDraft((d) => ({ ...d, appointmentType: e.target.value as AppointmentType }))
            }
          >
            {APPOINTMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-gray-900">Priority</legend>
          <div className="flex gap-4 pt-2">
            {(['routine', 'urgent'] as const).map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm capitalize">
                <input
                  type="radio"
                  name="wl-priority"
                  value={p}
                  checked={draft.priority === p}
                  onChange={() => setDraft((d) => ({ ...d, priority: p }))}
                />
                {p}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isLoading}>
          Add to waitlist
        </Button>
      </div>
    </form>
  );
}

export function WaitlistPanel() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [showAdd, setShowAdd] = useState(false);
  const [offerFor, setOfferFor] = useState<WaitlistEntry | null>(null);
  const [removeTarget, setRemoveTarget] = useState<WaitlistEntry | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data: entries = [], isLoading, error, refetch } = useWaitlist(filter);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.waitlist.all });

  const addMutation = useMutation({
    mutationFn: async (draft: AddEntryDraft) => {
      const res = await fetchWithAuth(`${API_V1}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: draft.patientId.trim(),
          ...(draft.doctorId.trim() ? { doctorId: draft.doctorId.trim() } : {}),
          requestedDate: new Date(draft.requestedDate).toISOString(),
          appointmentType: draft.appointmentType,
          priority: draft.priority,
        }),
      });
      if (!res.ok) throw await readError(res, 'Failed to add to waitlist');
    },
    onSuccess: () => {
      setShowAdd(false);
      setToast({ message: 'Patient added to the waitlist.', type: 'success' });
      invalidate();
    },
    onError: (err: Error) => setToast({ message: err.message, type: 'error' }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetchWithAuth(`${API_V1}/waitlist/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      // Already gone (e.g. TTL-expired) is fine
      if (!res.ok && res.status !== 404) throw await readError(res, 'Failed to remove entry');
    },
    onSuccess: invalidate,
  });

  const bookFromWaitlist = async (entry: WaitlistEntry, draft: AppointmentDraft) => {
    const res = await fetchWithAuth(`${API_V1}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...draft,
        scheduledAt: new Date(draft.scheduledAt).toISOString(),
      }),
    });
    if (!res.ok) {
      const err = await readError(res, 'Failed to book appointment');
      setToast({ message: err.message, type: 'error' });
      throw err;
    }

    try {
      await removeMutation.mutateAsync(entry._id);
      setToast({ message: 'Appointment booked and patient removed from waitlist.', type: 'success' });
    } catch {
      setToast({
        message: 'Appointment booked, but the waitlist entry could not be removed. Remove it manually.',
        type: 'error',
      });
    }
    setOfferFor(null);
    queryClient.invalidateQueries({ queryKey: ['appointments'] });
  };

  const now = Date.now();
  const activeCount = entries.filter((e) => !isWaitlistEntryExpired(e, now)).length;

  return (
    <section aria-labelledby="waitlist-heading" className="space-y-4">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="waitlist-heading" className="text-lg font-semibold text-gray-900">
            Waitlist
          </h2>
          <p className="text-sm text-gray-500">
            {activeCount} active {activeCount === 1 ? 'entry' : 'entries'} · urgent first, then
            first-come
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            Show
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'active' | 'all')}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="active">Active</option>
              <option value="all">All (incl. expired & booked)</option>
            </select>
          </label>
          <Button onClick={() => setShowAdd(true)}>+ Add patient</Button>
        </div>
      </div>

      {isLoading && (
        <div role="status" className="flex items-center gap-2 py-6 text-gray-500">
          <Spinner size="sm" /> Loading waitlist…
        </div>
      )}

      {error && <ErrorMessage message={(error as Error).message} onRetry={() => refetch()} />}

      {!isLoading && !error && entries.length === 0 && (
        <p role="status" className="py-6 text-sm text-gray-500">
          No patients are waiting for a slot.
        </p>
      )}

      {entries.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th scope="col" className="px-4 py-3">#</th>
                <th scope="col" className="px-4 py-3">Patient</th>
                <th scope="col" className="px-4 py-3">Preferred date</th>
                <th scope="col" className="px-4 py-3">Type</th>
                <th scope="col" className="px-4 py-3">Priority</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Offer expires</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {entries.map((entry, i) => {
                const expired = isWaitlistEntryExpired(entry, now);
                const closed = expired || entry.status === 'booked';
                return (
                  <tr
                    key={entry._id}
                    data-expired={expired || undefined}
                    className={expired ? 'bg-gray-50 text-gray-400' : undefined}
                  >
                    <td className="px-4 py-3">{closed ? '—' : i + 1}</td>
                    <td className={`px-4 py-3 font-medium ${expired ? 'line-through' : ''}`}>
                      {patientLabel(entry)}
                    </td>
                    <td className="px-4 py-3">{formatDate(entry.requestedDate, true)}</td>
                    <td className="px-4 py-3 capitalize">{entry.appointmentType}</td>
                    <td className="px-4 py-3">
                      <Badge variant={entry.priority === 'urgent' ? 'danger' : 'default'}>
                        {entry.priority}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {expired ? (
                        <Badge variant="default" className="border border-dashed border-gray-400">
                          Expired
                        </Badge>
                      ) : entry.status === 'notified' ? (
                        <Badge variant="warning">Slot offered</Badge>
                      ) : entry.status === 'booked' ? (
                        <Badge variant="success">Booked</Badge>
                      ) : (
                        <Badge variant="primary">Waiting</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {entry.expiresAt ? (
                        <time dateTime={entry.expiresAt}>{formatDate(entry.expiresAt, true)}</time>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {!closed && (
                          <Button size="sm" onClick={() => setOfferFor(entry)}>
                            Offer slot
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRemoveTarget(entry)}
                          aria-label={`Remove ${patientLabel(entry)} from waitlist`}
                        >
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SlideOver isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add patient to waitlist">
        <AddToWaitlistForm
          onSubmit={(d) => addMutation.mutate(d)}
          onCancel={() => setShowAdd(false)}
          isLoading={addMutation.isPending}
        />
      </SlideOver>

      <SlideOver
        isOpen={!!offerFor}
        onClose={() => setOfferFor(null)}
        title={offerFor ? `Offer slot to ${patientLabel(offerFor)}` : 'Offer slot'}
      >
        {offerFor && (
          <AppointmentBookingForm
            key={offerFor._id}
            initialValues={{
              patientId: patientIdOf(offerFor),
              doctorId: offerFor.doctorId ?? '',
              scheduledAt: toLocalInput(offerFor.requestedDate),
              type: offerFor.appointmentType,
            }}
            submitLabel="Book & remove from waitlist"
            onSubmit={(draft) => bookFromWaitlist(offerFor, draft)}
            onCancel={() => setOfferFor(null)}
          />
        )}
      </SlideOver>

      <Modal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title="Remove from waitlist?"
        description={removeTarget ? `${patientLabel(removeTarget)} will lose their place.` : ''}
        size="sm"
      >
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setRemoveTarget(null)}>
            Keep
          </Button>
          <Button
            variant="danger"
            loading={removeMutation.isPending}
            onClick={() =>
              removeTarget &&
              removeMutation.mutate(removeTarget._id, {
                onSuccess: () => {
                  setRemoveTarget(null);
                  setToast({ message: 'Removed from waitlist.', type: 'success' });
                },
                onError: (err) => setToast({ message: (err as Error).message, type: 'error' }),
              })
            }
          >
            Remove
          </Button>
        </div>
      </Modal>
    </section>
  );
}
