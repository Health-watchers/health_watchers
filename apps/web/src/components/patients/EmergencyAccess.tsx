'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Modal, Select, Textarea } from '@/components/ui';
import { ApiError, apiV1Fetch } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Break-the-glass emergency access (#1493): a gate for records outside the
 * clinician's care team, the justification modal, and the warning banner shown
 * while time-limited access is active.
 */

export const EMERGENCY_ACCESS_REASONS = [
  { value: 'LIFE_THREATENING_EMERGENCY', label: 'Life-threatening emergency' },
  { value: 'PATIENT_UNABLE_TO_CONSENT', label: 'Patient unable to consent (e.g. unconscious)' },
  { value: 'URGENT_CONTINUITY_OF_CARE', label: 'Urgent continuity of care' },
  { value: 'COVERING_FOR_TREATING_CLINICIAN', label: 'Covering for the treating clinician' },
  { value: 'OTHER', label: 'Other (explain below)' },
];

export const EMERGENCY_ACCESS_REASON_LABELS: Record<string, string> = Object.fromEntries(
  EMERGENCY_ACCESS_REASONS.map((r) => [r.value, r.label])
);

const DURATION_OPTIONS = [
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '60 minutes (maximum)' },
];

const MIN_JUSTIFICATION = 20;

export interface EmergencyAccessGrant {
  id: string;
  reason: string;
  justification: string;
  grantedAt: string;
  expiresAt: string;
  endedAt: string | null;
  isActive: boolean;
  reviewStatus: 'PENDING' | 'APPROVED' | 'FLAGGED';
}

/** The current user's active grant for a patient (null when none). */
export function useEmergencyAccess(patientId: string) {
  return useQuery<EmergencyAccessGrant | null>({
    queryKey: queryKeys.patients.emergencyAccess(patientId),
    queryFn: async () => (await apiV1Fetch(`/patients/${patientId}/emergency-access`)).data,
  });
}

function useCountdown(expiresAt: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, new Date(expiresAt).getTime() - now) : 0;
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function EmergencyAccessModal({
  patientId,
  open,
  onClose,
  onGranted,
}: {
  patientId: string;
  open: boolean;
  onClose: () => void;
  onGranted: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [justification, setJustification] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [acknowledged, setAcknowledged] = useState(false);

  const request = useMutation({
    mutationFn: () =>
      apiV1Fetch(`/patients/${patientId}/emergency-access`, {
        method: 'POST',
        body: JSON.stringify({
          reason,
          justification: justification.trim(),
          durationMinutes: Number(durationMinutes),
        }),
      }),
    onSuccess: (res) => {
      queryClient.setQueryData(queryKeys.patients.emergencyAccess(patientId), res.data);
      onGranted();
      onClose();
    },
  });

  const canSubmit = !!reason && justification.trim().length >= MIN_JUSTIFICATION && acknowledged;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Emergency access (break the glass)"
      description="This patient is outside your care team."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) request.mutate();
        }}
      >
        <div
          role="note"
          className="border-warning-200 bg-warning-50 text-warning-800 rounded-md border p-3 text-sm"
        >
          Emergency access is time-limited, every action you take is recorded in the audit log and
          compliance officers are notified immediately. Use it only when delaying care would put the
          patient at risk.
        </div>

        <Select
          id="emergency-reason"
          label="Reason"
          placeholder="Select a reason"
          options={EMERGENCY_ACCESS_REASONS}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />

        <Textarea
          id="emergency-justification"
          label="Clinical justification"
          rows={4}
          maxLength={1000}
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          helperText={`At least ${MIN_JUSTIFICATION} characters. This is reviewed by compliance.`}
          required
        />

        <Select
          id="emergency-duration"
          label="Access duration"
          options={DURATION_OPTIONS}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
        />

        <label className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          I confirm this access is necessary for the patient&apos;s immediate care and understand it
          will be reviewed.
        </label>

        {request.error && (
          <p role="alert" className="text-danger-600 text-sm">
            {request.error instanceof ApiError
              ? request.error.message
              : 'Could not grant emergency access'}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={!canSubmit || request.isPending}>
            {request.isPending ? 'Granting…' : 'Break the glass'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Shown instead of the record when the patient is outside the caller's care team. */
export function EmergencyAccessGate({
  patientId,
  onGranted,
}: {
  patientId: string;
  onGranted: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">
        This patient is outside your care team
      </p>
      <p className="mt-2 max-w-md text-sm text-neutral-500">
        In an emergency you can request time-limited access. The request is audited and reviewed by
        your compliance officers.
      </p>
      <Button className="mt-6" variant="danger" onClick={() => setOpen(true)}>
        Request emergency access
      </Button>
      <EmergencyAccessModal
        patientId={patientId}
        open={open}
        onClose={() => setOpen(false)}
        onGranted={onGranted}
      />
    </div>
  );
}

/** Persistent warning while an emergency access grant is active. */
export function EmergencyAccessBanner({
  patientId,
  grant,
}: {
  patientId: string;
  grant: EmergencyAccessGrant;
}) {
  const queryClient = useQueryClient();
  const remaining = useCountdown(grant.expiresAt);

  // Access expires automatically server-side; drop the cached record here too.
  const revokeLocally = () => {
    queryClient.setQueryData(queryKeys.patients.emergencyAccess(patientId), null);
    queryClient.resetQueries({ queryKey: queryKeys.patients.detail(patientId) });
  };

  useEffect(() => {
    if (remaining === 0) revokeLocally();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const end = useMutation({
    mutationFn: () => apiV1Fetch(`/patients/${patientId}/emergency-access`, { method: 'DELETE' }),
    onSettled: revokeLocally,
  });

  return (
    <div
      role="alert"
      className="border-danger-300 bg-danger-50 text-danger-800 dark:border-danger-800 dark:bg-danger-900/30 dark:text-danger-200 sticky top-0 z-10 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
    >
      <div className="text-sm">
        <p className="font-semibold">Emergency access active — all activity is being audited</p>
        <p>
          {EMERGENCY_ACCESS_REASON_LABELS[grant.reason] ?? grant.reason}. Access ends in{' '}
          <span className="font-mono tabular-nums">{formatRemaining(remaining)}</span>.
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={() => end.mutate()} disabled={end.isPending}>
        End access now
      </Button>
    </div>
  );
}
