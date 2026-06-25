'use client';

import { useEffect, useState, useCallback } from 'react';
import { portalGet } from '@/lib/portalApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';

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

const EVENT_ICONS: Record<string, string> = {
  encounter: '\uD83D\uDC69\u200D\u2695\uFE0F',
  lab_result: '\uD83D\uDD2C',
  immunization: '\uD83D\uDC89',
  prescription: '\uD83D\uDC8A',
  appointment: '\uD83D\uDCC5',
};

const EVENT_COLORS: Record<string, string> = {
  encounter: 'bg-blue-100 text-blue-700 border-blue-200',
  lab_result: 'bg-purple-100 text-purple-700 border-purple-200',
  immunization: 'bg-green-100 text-green-700 border-green-200',
  prescription: 'bg-amber-100 text-amber-700 border-amber-200',
  appointment: 'bg-teal-100 text-teal-700 border-teal-200',
};

const EVENT_BADGE_VARIANTS: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'default'> = {
  encounter: 'primary',
  lab_result: 'default',
  immunization: 'success',
  prescription: 'warning',
  appointment: 'default',
};

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
    ([, v]) => v !== null && v !== undefined && v !== '',
  );

  return (
    <Modal open={open} onClose={onClose} title={event.title} size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant={EVENT_BADGE_VARIANTS[event.type]}>
            {event.type.replace('_', ' ')}
          </Badge>
          <span className="text-sm text-neutral-500">{formatDateTime(event.date)}</span>
        </div>

        <p className="text-sm text-neutral-700">{event.description}</p>

        <div className="border-t border-neutral-200 pt-4">
          <h4 className="mb-2 text-sm font-semibold text-neutral-700">Details</h4>
          <dl className="divide-y divide-neutral-100">
            {detailRows.map(([key, value]) => (
              <div key={key} className="flex py-2 text-sm">
                <dt className="w-1/3 font-medium capitalize text-neutral-500">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </dt>
                <dd className="w-2/3 text-neutral-800">
                  {renderDetailValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Modal>
  );
}

function renderDetailValue(value: unknown): string {
  if (value === null || value === undefined) return '\u2014';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ') || '\u2014';
    }
    if (value instanceof Date) return value.toLocaleDateString();
    return JSON.stringify(value);
  }
  return String(value);
}

const EVENT_TYPES = [
  { value: '', label: 'All Events' },
  { value: 'encounter', label: 'Encounters' },
  { value: 'lab_result', label: 'Lab Results' },
  { value: 'immunization', label: 'Immunizations' },
  { value: 'prescription', label: 'Prescriptions' },
  { value: 'appointment', label: 'Appointments' },
];

export default function PortalTimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [eventType, setEventType] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const limit = 20;

  const fetchTimeline = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (eventType) params.set('eventType', eventType);
      const result = await portalGet<TimelineResponse>(`/timeline?${params.toString()}`);
      setEvents(result.data);
      setMeta(result.meta);
    } catch {
      setEvents([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [page, eventType]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  const groupedByDate = events.reduce<Record<string, TimelineEvent[]>>((acc, event) => {
    const dateKey = formatDate(event.date);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(event);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Health Timeline</h1>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="event-type" className="text-sm font-medium text-neutral-600">
                Event Type:
              </label>
              <select
                id="event-type"
                value={eventType}
                onChange={(e) => {
                  setEventType(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-neutral-500">No health events found.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="relative">
            <div className="absolute bottom-0 left-6 top-0 w-0.5 bg-neutral-200" />

            <div className="space-y-6">
              {Object.entries(groupedByDate).map(([dateLabel, dateEvents]) => (
                <div key={dateLabel}>
                  <div className="sticky top-0 z-10 mb-3 flex items-center gap-3 bg-neutral-50 py-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-blue-500 bg-white">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                    </div>
                    <span className="text-sm font-semibold text-neutral-600">{dateLabel}</span>
                  </div>

                  <div className="ml-9 space-y-3">
                    {dateEvents.map((event) => (
                      <button
                        key={event.id}
                        onClick={() => {
                          setSelectedEvent(event);
                          setShowDetail(true);
                        }}
                        className="w-full text-left"
                      >
                        <Card padding="sm" className="transition-shadow hover:shadow-md">
                          <CardContent>
                            <div className="flex items-start gap-3">
                              <div
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-lg ${EVENT_COLORS[event.type]}`}
                              >
                                {EVENT_ICONS[event.type]}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-sm font-semibold text-neutral-800">
                                    {event.title}
                                  </span>
                                  <Badge variant={EVENT_BADGE_VARIANTS[event.type]}>
                                    {event.type.replace(/_/g, ' ')}
                                  </Badge>
                                </div>
                                <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">
                                  {event.description}
                                </p>
                              </div>
                              <span className="shrink-0 text-xs text-neutral-400">
                                {formatDateTime(event.date)}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="flex justify-center pt-4">
              <Pagination
                page={meta.page}
                totalPages={meta.totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}

      <EventDetailModal
        event={selectedEvent}
        open={showDetail}
        onClose={() => setShowDetail(false)}
      />
    </div>
  );
}
