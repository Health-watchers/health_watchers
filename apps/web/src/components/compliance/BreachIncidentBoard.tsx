'use client';

import { useEffect, useState } from 'react';
import { Badge, Button } from '@/components/ui';
import {
  NOTIFICATION_STATUSES,
  STATUS_LABELS,
  isAllowedStatusTransition,
  notificationCountdown,
  type BreachIncident,
  type BreachSeverity,
  type NotificationStatus,
} from '@/lib/compliance';

const SEVERITY_VARIANT: Record<BreachSeverity, 'danger' | 'warning' | 'primary' | 'default'> = {
  CRITICAL: 'danger',
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'default',
};

/** Re-renders every `intervalMs` so countdowns stay current. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

interface BreachIncidentBoardProps {
  incidents: BreachIncident[];
  pendingId?: string | null;
  onTransition: (incident: BreachIncident, next: NotificationStatus) => void;
  onEdit: (incident: BreachIncident) => void;
}

export function BreachIncidentBoard({
  incidents,
  pendingId,
  onTransition,
  onEdit,
}: BreachIncidentBoardProps) {
  const now = useNow();

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {NOTIFICATION_STATUSES.map((status) => {
        const column = incidents
          .filter((i) => i.notificationStatus === status)
          .sort(
            (a, b) =>
              new Date(a.notificationDeadline).getTime() -
              new Date(b.notificationDeadline).getTime()
          );

        return (
          <section
            key={status}
            aria-labelledby={`breach-col-${status}`}
            className="flex flex-col rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <header className="mb-3 flex items-center justify-between">
              <h3
                id={`breach-col-${status}`}
                className="text-sm font-semibold text-neutral-800 dark:text-neutral-100"
              >
                {STATUS_LABELS[status]}
              </h3>
              <Badge>{column.length}</Badge>
            </header>

            {column.length === 0 ? (
              <p className="py-6 text-center text-xs text-neutral-400">No incidents</p>
            ) : (
              <ul className="space-y-3">
                {column.map((incident) => (
                  <BreachIncidentCard
                    key={incident._id}
                    incident={incident}
                    now={now}
                    pending={pendingId === incident._id}
                    onTransition={onTransition}
                    onEdit={onEdit}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function BreachIncidentCard({
  incident,
  now,
  pending,
  onTransition,
  onEdit,
}: {
  incident: BreachIncident;
  now: number;
  pending: boolean;
  onTransition: (incident: BreachIncident, next: NotificationStatus) => void;
  onEdit: (incident: BreachIncident) => void;
}) {
  const countdown = notificationCountdown(
    incident.notificationDeadline,
    incident.notificationStatus,
    now
  );
  const targets = NOTIFICATION_STATUSES.filter((s) => s !== incident.notificationStatus);

  return (
    <li className="rounded-md border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
      <div className="flex items-start justify-between gap-2">
        <Badge variant={SEVERITY_VARIANT[incident.severity]}>{incident.severity}</Badge>
        <Badge
          variant={countdown.tone}
          title={`Notification deadline: ${new Date(incident.notificationDeadline).toLocaleString()}`}
        >
          <span aria-hidden="true">⏱</span> {countdown.label}
        </Badge>
      </div>

      <p className="mt-2 line-clamp-3 text-sm text-neutral-800 dark:text-neutral-200">
        {incident.description}
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        {incident.affectedPatients.length} affected patient
        {incident.affectedPatients.length === 1 ? '' : 's'} · discovered{' '}
        {new Date(incident.discoveredAt).toLocaleDateString()}
      </p>

      <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Move incident to">
        {targets.map((target) => {
          const allowed = isAllowedStatusTransition(incident.notificationStatus, target);
          return (
            <Button
              key={target}
              size="sm"
              variant={allowed ? 'primary' : 'outline'}
              disabled={!allowed || pending}
              loading={allowed && pending}
              title={
                allowed
                  ? `Move to ${STATUS_LABELS[target]}`
                  : `Not allowed: ${STATUS_LABELS[incident.notificationStatus]} → ${STATUS_LABELS[target]}`
              }
              onClick={() => onTransition(incident, target)}
            >
              → {STATUS_LABELS[target]}
            </Button>
          );
        })}
        <Button size="sm" variant="ghost" onClick={() => onEdit(incident)} disabled={pending}>
          Edit
        </Button>
      </div>
    </li>
  );
}
