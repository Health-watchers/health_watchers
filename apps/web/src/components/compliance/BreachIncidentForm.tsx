'use client';

import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { Button, Input, Select, Textarea } from '@/components/ui';
import {
  BREACH_SEVERITIES,
  breachIncidentSchema,
  parsePatientIds,
  type BreachIncident,
  type BreachIncidentInput,
} from '@/lib/compliance';

interface FormValues {
  discoveredAt: string; // datetime-local value
  affectedPatients: string; // free text, one ID per line / comma separated
  description: string;
  severity: BreachIncidentInput['severity'];
}

function toLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

export function toBreachPayload(values: FormValues): Record<string, unknown> {
  const discovered = values.discoveredAt ? new Date(values.discoveredAt) : null;
  return {
    discoveredAt: discovered && !isNaN(discovered.getTime()) ? discovered.toISOString() : '',
    affectedPatients: parsePatientIds(values.affectedPatients),
    description: values.description.trim(),
    severity: values.severity,
  };
}

/** Runs the same zod schema the API uses and maps issues back onto form fields. */
const resolver: Resolver<FormValues> = async (values) => {
  const result = breachIncidentSchema.safeParse(toBreachPayload(values));
  if (result.success) return { values, errors: {} };

  const errors: Record<string, { type: string; message: string }> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0]);
    if (!errors[field]) errors[field] = { type: issue.code, message: issue.message };
  }
  return { values: {}, errors: errors as FieldErrors<FormValues> };
};

export interface BreachIncidentFormProps {
  incident?: BreachIncident | null;
  submitting?: boolean;
  onSubmit: (payload: BreachIncidentInput) => void;
  onCancel: () => void;
}

export function BreachIncidentForm({
  incident,
  submitting,
  onSubmit,
  onCancel,
}: BreachIncidentFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver,
    defaultValues: {
      discoveredAt: toLocalInput(incident?.discoveredAt),
      affectedPatients: incident?.affectedPatients.join('\n') ?? '',
      description: incident?.description ?? '',
      severity: incident?.severity ?? 'MEDIUM',
    },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((values) =>
        onSubmit(breachIncidentSchema.parse(toBreachPayload(values)))
      )}
    >
      <Input
        id="breach-discovered-at"
        label="Discovered at"
        type="datetime-local"
        max={toLocalInput(new Date().toISOString())}
        error={errors.discoveredAt?.message}
        helperText="The 60-day HHS notification deadline is calculated from this date."
        {...register('discoveredAt')}
      />
      <Select
        id="breach-severity"
        label="Severity"
        options={BREACH_SEVERITIES.map((s) => ({ value: s, label: s }))}
        error={errors.severity?.message}
        {...register('severity')}
      />
      <Textarea
        id="breach-affected-patients"
        label="Affected patient IDs"
        rows={4}
        placeholder="One patient ID per line (or comma separated)"
        error={errors.affectedPatients?.message}
        {...register('affectedPatients')}
      />
      <Textarea
        id="breach-description"
        label="Description"
        rows={4}
        error={errors.description?.message}
        {...register('description')}
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting} disabled={submitting}>
          {incident ? 'Save changes' : 'Report incident'}
        </Button>
      </div>
    </form>
  );
}
