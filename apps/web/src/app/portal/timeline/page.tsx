'use client';

import { useEffect, useState, useCallback } from 'react';
import { portalGet } from '@/lib/portalApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TimelineEvent {
  id: string;
  type: 'encounter' | 'lab_result' | 'immunization' | 'prescription' | 'appointment';
  date: string;
  title: string;
  description: string;
  details: Record<string, unknown>;
  clinicId: string;
  createdAt: string;
}

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextCursor: string | null;
}

interface TimelineResponse {
  status: string;
  data: TimelineEvent[];
  meta: PaginationMeta;
}

// ── Display maps ──────────────────────────────────────────────────────────────

const EVENT_ICONS: Record<string, string> = {
  encounter: '👩‍⚕️',
  lab_result: '🔬',
  immunization: '💉',
  prescription: '💊',
  appointment: '📅',
};

const EVENT_COLORS: Record<string, string> = {
  encounter: 'bg-blue-100 text-blue-700 border-blue-200',
  lab_result: 'bg-purple-100 text-purple-700 border-purple-200',
  immunization: 'bg-green-100 text-green-700 border-green-200',
  prescription: 'bg-amber-100 text-amber-700 border-amber-200',
  appointment: 'bg-teal-100 text-teal-700 border-teal-200',
};

const EVENT_CONNECTOR_COLORS: Record<string, string> = {
  encounter: 'border-blue-500 bg-white',
  lab_result: 'border-purple-500 bg-white',
  immunization: 'border-green-500 bg-white',
  prescription: 'border-amber-500 bg-white',
  appointment: 'border-teal-500 bg-white',
};

const EVENT_DOT_COLORS: Record<string, string> = {
  encounter: 'bg-blue-500',
  lab_result: 'bg-purple-500',
  immunization: 'bg-green-500',
  prescription: 'bg-amber-500',
  appointment: 'bg-teal-500',
};

const EVENT_BADGE_VARIANTS: Record<
  string,
  'primary' | 'success' | 'warning' | 'danger' | 'default'
> = {
  encounter: 'primary',
  lab_result: 'default',
  immunization: 'success',
  prescription: 'warning',
  appointment: 'default',
};

const EVENT_TYPES = [
  { value: '', label: 'All Events' },
  { value: 'encounter', label: '👩‍⚕️ Encounters' },
  { value: 'lab_result', label: '🔬 Lab Results' },
  { value: 'immunization', label: '💉 Immunizations' },
  { value: 'prescription', label: '💊 Prescriptions' },
  { value: 'appointment', label: '📅 Appointments' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderDetailValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return (
        value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ') || '—'
      );
    }
    if (value instanceof Date) return value.toLocaleDateString();
    return JSON.stringify(value);
  }
  return String(value);
}

function humaniseKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// ── EventDetailModal ──────────────────────────────────────────────────────────

function EventDetailModal({
  event,
  open,
  onClose,
}: {
  event: TimelineEvent | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!event) return null;

  const detailRows = Object.entries(event.details).filter(
    ([, v]) => v !== null && v !== undefined && v !== ''
  );

  return (
    <Modal open={open} onClose={onClose} title={event.title} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={EVENT_BADGE_VARIANTS[event.type]}>
            {event.type.replace(/_/g, ' ')}
          </Badge>
          <span className="text-sm text-neutral-500">{formatDateTime(event.date)}</span>
        </div>

        <p className="text-sm text-neutral-700">{event.description}</p>

        {detailRows.length > 0 && (
          <div className="border-t border-neutral-200 pt-4">
            <h4 className="mb-2 text-sm font-semibold text-neutral-700">Details</h4>
            <dl className="divide-y divide-neutral-100 rounded-lg border border-neutral-100 bg-neutral-50">
              {detailRows.map(([key, value]) => (
                <div key={key} className="flex px-3 py-2 text-sm">
                  <dt className="w-2/5 font-medium text-neutral-500">{humaniseKey(key)}</dt>
                  <dd className="w-3/5 text-neutral-800">{renderDetailValue(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── SkeletonCard ──────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 rounded-full bg-neutral-200" />
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <div className="h-4 w-40 rounded bg-neutral-200" />
            <div className="h-4 w-16 rounded bg-neutral-100" />
          </div>
          <div className="h-3 w-3/4 rounded bg-neutral-100" />
        </div>
        <div className="h-3 w-20 shrink-0 rounded bg-neutral-100" />
      </div>
    </div>
  );
}

// ── TimelineEventCard ─────────────────────────────────────────────────────────

function TimelineEventCard({
  event,
  onClick,
}: {
  event: TimelineEvent;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-lg"
      aria-label={`View details for ${event.title}`}
    >
      <Card padding="sm" className="transition-all duration-150 hover:shadow-md hover:border-neutral-300">
        <CardContent>
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-lg ${EVENT_COLORS[event.type]}`}
              aria-hidden="true"
            >
              {EVENT_ICONS[event.type]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold text-neutral-800">
                  {event.title}
                </span>
                <Badge variant={EVENT_BADGE_VARIANTS[event.type]}>
                  {event.type.replace(/_/g, ' ')}
                </Badge>
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{event.description}</p>
            </div>
            <span className="shrink-0 text-xs text-neutral-400 pt-0.5">{formatDateTime(event.date)}</span>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

// ── DateGroupHeader ───────────────────────────────────────────────────────────

function DateGroupHeader({ label, firstType }: { label: string; firstType: string }) {
  return (
    <div className="sticky top-0 z-10 mb-3 flex items-center gap-3 bg-gray-50 py-2">
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${EVENT_CONNECTOR_COLORS[firstType]}`}
      >
        <div className={`h-2 w-2 rounded-full ${EVENT_DOT_COLORS[firstType]}`} />
      </div>
      <span className="text-sm font-semibold text-neutral-600">{label}</span>
    </div>
  );
}

// ── FilterBar ─────────────────────────────────────────────────────────────────

function FilterBar({
  eventType,
  startDate,
  endDate,
  onEventTypeChange,
  onStartDateChange,
  onEndDateChange,
  onReset,
}: {
  eventType: string;
  startDate: string;
  endDate: string;
  onEventTypeChange: (v: string) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onReset: () => void;
}) {
  const hasFilters = !!eventType || !!startDate || !!endDate;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Event type */}
          <div className="flex flex-col gap-1">
            <label htmlFor="event-type" className="text-xs font-medium text-neutral-600">
              Event Type
            </label>
            <select
              id="event-type"
              value={eventType}
              onChange={(e) => onEventTypeChange(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Start date */}
          <div className="flex flex-col gap-1">
            <label htmlFor="start-date" className="text-xs font-medium text-neutral-600">
              From
            </label>
            <input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* End date */}
          <div className="flex flex-col gap-1">
            <label htmlFor="end-date" className="text-xs font-medium text-neutral-600">
              To
            </label>
            <input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Reset */}
          {hasFilters && (
            <button
              onClick={onReset}
              className="mb-0.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
            >
              Clear filters
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page Component ───────────────────────────────────────────────────────

export default function PortalTimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [eventType, setEventType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const limit = 20;

  const fetchTimeline = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (eventType) params.set('eventType', eventType);
      if (startDate) params.set('startDate', new Date(startDate).toISOString());
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        params.set('endDate', end.toISOString());
      }
      const result = await portalGet<TimelineResponse>(`/timeline?${params.toString()}`);
      setEvents(result.data);
      setMeta(result.meta);
    } catch {
      setError('Unable to load your health timeline. Please try again.');
      setEvents([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [page, eventType, startDate, endDate]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  // Group events by formatted date
  const groupedByDate = events.reduce<Record<string, TimelineEvent[]>>((acc, event) => {
    const dateKey = formatDate(event.date);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(event);
    return acc;
  }, {});

  function handleFilterReset() {
    setEventType('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Health Timeline</h1>
          {meta && (
            <p className="mt-0.5 text-sm text-neutral-500">
              {meta.total} event{meta.total !== 1 ? 's' : ''} in your health record
            </p>
          )}
        </div>
      </div>

      {/* Filters */}
      <FilterBar
        eventType={eventType}
        startDate={startDate}
        endDate={endDate}
        onEventTypeChange={(v) => { setEventType(v); setPage(1); }}
        onStartDateChange={(v) => { setStartDate(v); setPage(1); }}
        onEndDateChange={(v) => { setEndDate(v); setPage(1); }}
        onReset={handleFilterReset}
      />

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button onClick={fetchTimeline} className="ml-2 font-medium underline">
            Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="relative ml-9">
              <SkeletonCard />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && events.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-3" aria-hidden="true">📋</div>
            <p className="font-medium text-neutral-700">No health events found</p>
            <p className="mt-1 text-sm text-neutral-500">
              {eventType || startDate || endDate
                ? 'Try adjusting your filters to see more results.'
                : 'Your health timeline will appear here once events are recorded.'}
            </p>
            {(eventType || startDate || endDate) && (
              <button
                onClick={handleFilterReset}
                className="mt-4 text-sm font-medium text-blue-600 hover:underline"
              >
                Clear all filters
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      {!loading && !error && events.length > 0 && (
        <>
          {/* Vertical spine + events */}
          <div className="relative">
            <div className="absolute top-0 bottom-0 left-6 w-0.5 bg-neutral-200" aria-hidden="true" />

            <div className="space-y-6">
              {Object.entries(groupedByDate).map(([dateLabel, dateEvents]) => (
                <div key={dateLabel}>
                  <DateGroupHeader label={dateLabel} firstType={dateEvents[0]?.type ?? 'encounter'} />
                  <div className="ml-9 space-y-3">
                    {dateEvents.map((event) => (
                      <TimelineEventCard
                        key={event.id}
                        event={event}
                        onClick={() => {
                          setSelectedEvent(event);
                          setShowDetail(true);
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-neutral-500">
                Page {meta.page} of {meta.totalPages} ({meta.total} events)
              </p>
              <Pagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />
            </div>
          )}
        </>
      )}

      {/* Detail modal */}
      <EventDetailModal
        event={selectedEvent}
        open={showDetail}
        onClose={() => setShowDetail(false)}
      />
    </div>
  );
}