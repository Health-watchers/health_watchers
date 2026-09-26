'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  ErrorMessage,
  Input,
  Modal,
  PageHeader,
  PageWrapper,
  Select,
  Skeleton,
  Textarea,
  Toast,
} from '@/components/ui';
import {
  ScheduleAgenda,
  ScheduleCalendar,
  type NewShiftRange,
  type StaffInfo,
} from '@/components/schedules/ScheduleCalendar';
import { useAuth, type AppRole } from '@/context/AuthContext';
import { ApiError, apiV1Fetch } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import {
  addDays,
  dateKey,
  expandOccurrences,
  findConflicts,
  fromDateKey,
  toMinutes,
  visibleDays,
  type ShiftCandidate,
  type ShiftOccurrence,
  type StaffSchedule,
} from '@/lib/scheduling';

const EDITOR_ROLES: AppRole[] = ['SUPER_ADMIN', 'CLINIC_ADMIN'];

interface StaffUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive?: boolean;
}

interface ShiftForm {
  scheduleId?: string;
  userId: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  repeatsWeekly: boolean;
  isAvailable: boolean;
  notes: string;
}

interface PendingResize {
  occurrence: ShiftOccurrence;
  endTime: string;
  conflicts: ShiftOccurrence[];
}

function candidateFromForm(form: ShiftForm): ShiftCandidate {
  return {
    scheduleId: form.scheduleId,
    userId: form.userId,
    dateKey: form.dateKey,
    startTime: form.startTime,
    endTime: form.endTime,
    dayOfWeek: form.repeatsWeekly ? fromDateKey(form.dateKey).getDay() : undefined,
  };
}

function toPayload(form: ShiftForm) {
  return {
    userId: form.userId,
    ...(form.repeatsWeekly
      ? { dayOfWeek: fromDateKey(form.dateKey).getDay(), recurrence: 'weekly' }
      : { date: form.dateKey, recurrence: 'none' }),
    startTime: form.startTime,
    endTime: form.endTime,
    isAvailable: form.isAvailable,
    notes: form.notes || undefined,
  };
}

function ConflictWarning({
  conflicts,
  staffById,
}: {
  conflicts: ShiftOccurrence[];
  staffById: Map<string, StaffInfo>;
}) {
  if (conflicts.length === 0) return null;
  return (
    <div
      role="alert"
      className="border-warning-300 bg-warning-50 text-warning-800 rounded-md border p-3 text-sm"
    >
      <p className="font-semibold">
        This shift overlaps{' '}
        {conflicts.length === 1 ? 'an existing shift' : `${conflicts.length} existing shifts`}:
      </p>
      <ul className="mt-1 list-disc pl-5">
        {conflicts.slice(0, 5).map((c) => (
          <li key={c.key}>
            {staffById.get(c.schedule.userId)?.name ?? 'Staff'} ·{' '}
            {fromDateKey(c.dateKey).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}{' '}
            {c.startTime}–{c.endTime}
            {!c.schedule.isAvailable && ' (unavailable)'}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SchedulesClient() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = Boolean(user && EDITOR_ROLES.includes(user.role));

  const [view, setView] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [providerId, setProviderId] = useState('');
  const [role, setRole] = useState('');
  const [form, setForm] = useState<ShiftForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingResize, setPendingResize] = useState<PendingResize | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const days = useMemo(() => visibleDays(view, anchor), [view, anchor]);
  const rangeFrom = dateKey(days[0]);
  const rangeTo = dateKey(days[days.length - 1]);

  const schedulesQuery = useQuery({
    queryKey: queryKeys.schedules.staff(rangeFrom, rangeTo),
    queryFn: async () => {
      const params = new URLSearchParams({
        dateFrom: fromDateKey(rangeFrom).toISOString(),
        dateTo: addDays(fromDateKey(rangeTo), 1).toISOString(),
      });
      return ((await apiV1Fetch(`/schedules/staff?${params}`)).data ?? []) as StaffSchedule[];
    },
  });

  const staffQuery = useQuery({
    queryKey: queryKeys.staff.all,
    queryFn: async () => ((await apiV1Fetch('/users?limit=100')).data ?? []) as StaffUser[],
    retry: (count, err) => !(err instanceof ApiError && err.status === 403) && count < 2,
  });

  const staff = useMemo(
    () => (staffQuery.data ?? []).filter((s) => s.isActive !== false),
    [staffQuery.data]
  );
  const staffById = useMemo(
    () =>
      new Map<string, StaffInfo>(
        staff.map((s) => [String(s.id), { name: s.fullName || s.email, role: s.role }])
      ),
    [staff]
  );
  const roles = useMemo(() => Array.from(new Set(staff.map((s) => s.role))).sort(), [staff]);

  // All occurrences are used for conflict checks; filters only affect what is shown
  const allOccurrences = useMemo(
    () => expandOccurrences(schedulesQuery.data ?? [], days),
    [schedulesQuery.data, days]
  );
  const visibleOccurrences = useMemo(
    () =>
      allOccurrences.filter(
        (o) =>
          (!providerId || o.schedule.userId === providerId) &&
          (!role || staffById.get(o.schedule.userId)?.role === role)
      ),
    [allOccurrences, providerId, role, staffById]
  );

  const formConflicts = useMemo(
    () =>
      form && form.userId && form.startTime < form.endTime
        ? findConflicts(candidateFromForm(form), allOccurrences)
        : [],
    [form, allOccurrences]
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all });

  const saveShift = useMutation({
    mutationFn: (f: ShiftForm) =>
      apiV1Fetch(f.scheduleId ? `/schedules/staff/${f.scheduleId}` : '/schedules/staff', {
        method: f.scheduleId ? 'PUT' : 'POST',
        body: JSON.stringify(toPayload(f)),
      }),
    onSuccess: (_res, f) => {
      invalidate();
      setForm(null);
      setToast({ message: f.scheduleId ? 'Shift updated' : 'Shift created', type: 'success' });
    },
    onError: (err: Error) =>
      setFormError(
        err instanceof ApiError && err.status === 409
          ? `The server rejected this shift: ${err.message}`
          : err.message
      ),
  });

  const resizeShift = useMutation({
    mutationFn: ({ occurrence, endTime }: { occurrence: ShiftOccurrence; endTime: string }) =>
      apiV1Fetch(`/schedules/staff/${occurrence.schedule._id}`, {
        method: 'PUT',
        body: JSON.stringify({ endTime }),
      }),
    onSuccess: () => {
      invalidate();
      setToast({ message: 'Shift resized', type: 'success' });
    },
    onError: (err: Error) => setToast({ message: err.message, type: 'error' }),
    onSettled: () => setPendingResize(null),
  });

  const deleteShift = useMutation({
    mutationFn: (id: string) => apiV1Fetch(`/schedules/staff/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      setForm(null);
      setToast({ message: 'Shift deleted', type: 'success' });
    },
    onError: (err: Error) => setFormError(err.message),
  });

  // ── Calendar callbacks ────────────────────────────────────────────────────

  const openCreate = (range: NewShiftRange) => {
    if (!canEdit) return;
    setFormError(null);
    setForm({
      userId: providerId || '',
      dateKey: range.dateKey,
      startTime: range.startTime,
      endTime: range.endTime,
      repeatsWeekly: false,
      isAvailable: true,
      notes: '',
    });
  };

  const openEdit = (occ: ShiftOccurrence) => {
    if (!canEdit) return;
    setFormError(null);
    setForm({
      scheduleId: occ.schedule._id,
      userId: occ.schedule.userId,
      dateKey: occ.dateKey,
      startTime: occ.schedule.startTime,
      endTime: occ.schedule.endTime,
      repeatsWeekly: occ.schedule.recurrence !== 'none',
      isAvailable: occ.schedule.isAvailable,
      notes: occ.schedule.notes ?? '',
    });
  };

  const requestResize = (occurrence: ShiftOccurrence, endTime: string) => {
    const conflicts = findConflicts(
      {
        scheduleId: occurrence.schedule._id,
        userId: occurrence.schedule.userId,
        dateKey: occurrence.dateKey,
        startTime: occurrence.startTime,
        endTime,
        dayOfWeek:
          occurrence.schedule.recurrence !== 'none' ? occurrence.schedule.dayOfWeek : undefined,
      },
      allOccurrences
    );
    if (conflicts.length) setPendingResize({ occurrence, endTime, conflicts });
    else resizeShift.mutate({ occurrence, endTime });
  };

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.userId) return setFormError('Choose a staff member');
    if (!form.dateKey) return setFormError('Choose a date');
    if (toMinutes(form.startTime) >= toMinutes(form.endTime))
      return setFormError('End time must be after start time');
    setFormError(null);
    saveShift.mutate(form);
  };

  // ── Navigation ────────────────────────────────────────────────────────────

  const step = (dir: -1 | 1) =>
    setAnchor((a) =>
      view === 'week' ? addDays(a, 7 * dir) : new Date(a.getFullYear(), a.getMonth() + dir, 1)
    );

  const periodLabel =
    view === 'week'
      ? `${days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
      : anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const staffOptions = [
    { value: '', label: 'All providers' },
    ...staff
      .filter((s) => !role || s.role === role)
      .map((s) => ({ value: String(s.id), label: `${s.fullName || s.email} (${s.role})` })),
  ];

  const calendarProps = {
    view,
    days,
    anchor,
    occurrences: visibleOccurrences,
    staffById,
    canEdit,
    onCreate: openCreate,
    onResize: requestResize,
    onOpen: openEdit,
  };

  return (
    <PageWrapper className="space-y-4 py-6">
      <PageHeader
        title="Staff Schedule"
        subtitle={
          canEdit
            ? 'Drag on the calendar to create a shift; drag a shift’s bottom edge to resize it.'
            : 'Staff shifts and availability'
        }
        actions={
          canEdit ? (
            <Button
              onClick={() =>
                openCreate({ dateKey: dateKey(new Date()), startTime: '09:00', endTime: '17:00' })
              }
            >
              New shift
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => step(-1)}
            aria-label={`Previous ${view}`}
          >
            ←
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => step(1)} aria-label={`Next ${view}`}>
            →
          </Button>
          <h2
            className="ml-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100"
            aria-live="polite"
          >
            {periodLabel}
          </h2>
        </div>

        <div
          role="group"
          aria-label="Calendar view"
          className="inline-flex rounded-md border border-neutral-300 dark:border-neutral-600"
        >
          {(['week', 'month'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={[
                'px-3 py-1.5 text-xs font-medium capitalize first:rounded-l-md last:rounded-r-md',
                view === v
                  ? 'bg-primary-500 text-white'
                  : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800',
              ].join(' ')}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap gap-3">
          <Select
            id="schedule-role-filter"
            label="Role"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setProviderId('');
            }}
            options={[
              { value: '', label: 'All roles' },
              ...roles.map((r) => ({ value: r, label: r })),
            ]}
          />
          <Select
            id="schedule-provider-filter"
            label="Provider"
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            options={staffOptions}
          />
        </div>
      </div>

      {schedulesQuery.error ? (
        <ErrorMessage
          message={(schedulesQuery.error as Error).message}
          onRetry={() => schedulesQuery.refetch()}
        />
      ) : schedulesQuery.isLoading ? (
        <Skeleton className="h-[65vh]" />
      ) : (
        <>
          <div className="hidden md:block">
            <ScheduleCalendar {...calendarProps} />
          </div>
          <div className="md:hidden">
            <ScheduleAgenda {...calendarProps} />
          </div>
        </>
      )}

      {/* Create / edit shift */}
      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.scheduleId ? 'Edit shift' : 'New shift'}
        size="lg"
      >
        {form && (
          <form onSubmit={submitForm} className="space-y-4" noValidate>
            <Select
              id="shift-staff"
              label="Staff member"
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
              options={[
                { value: '', label: 'Select staff…' },
                ...staff.map((s) => ({
                  value: String(s.id),
                  label: `${s.fullName || s.email} (${s.role})`,
                })),
              ]}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                id="shift-date"
                label="Date"
                type="date"
                value={form.dateKey}
                onChange={(e) => setForm({ ...form, dateKey: e.target.value })}
              />
              <Input
                id="shift-start"
                label="Start"
                type="time"
                step={1800}
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              />
              <Input
                id="shift-end"
                label="End"
                type="time"
                step={1800}
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              />
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.repeatsWeekly}
                  onChange={(e) => setForm({ ...form, repeatsWeekly: e.target.checked })}
                />
                Repeats weekly on{' '}
                {form.dateKey
                  ? fromDateKey(form.dateKey).toLocaleDateString(undefined, { weekday: 'long' })
                  : 'this day'}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!form.isAvailable}
                  onChange={(e) => setForm({ ...form, isAvailable: !e.target.checked })}
                />
                Mark as unavailable (time off)
              </label>
            </div>
            <Textarea
              id="shift-notes"
              label="Notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />

            <ConflictWarning conflicts={formConflicts} staffById={staffById} />
            {formError && (
              <p role="alert" className="text-danger-600 text-sm">
                {formError}
              </p>
            )}

            <div className="flex flex-wrap justify-between gap-2">
              {form.scheduleId ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-danger-600"
                  loading={deleteShift.isPending}
                  onClick={() => deleteShift.mutate(form.scheduleId!)}
                >
                  Delete{form.repeatsWeekly ? ' series' : ''}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={formConflicts.length ? 'danger' : 'primary'}
                  loading={saveShift.isPending}
                  disabled={saveShift.isPending}
                >
                  {formConflicts.length ? 'Save anyway' : 'Save shift'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* Resize conflict confirmation */}
      <Modal
        open={Boolean(pendingResize)}
        onClose={() => setPendingResize(null)}
        title="Overlapping shift"
      >
        {pendingResize && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              Extending this shift to {pendingResize.endTime} overlaps another shift for{' '}
              {staffById.get(pendingResize.occurrence.schedule.userId)?.name ?? 'this staff member'}
              .
            </p>
            <ConflictWarning conflicts={pendingResize.conflicts} staffById={staffById} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPendingResize(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={resizeShift.isPending}
                onClick={() =>
                  resizeShift.mutate({
                    occurrence: pendingResize.occurrence,
                    endTime: pendingResize.endTime,
                  })
                }
              >
                Save anyway
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </PageWrapper>
  );
}
