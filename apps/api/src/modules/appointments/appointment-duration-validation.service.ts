/**
 * appointment-duration-validation.service.ts
 *
 * Validates that an appointment duration is acceptable for a given type,
 * enforces minimum/maximum policy, and ensures the appointment fits within
 * the doctor's schedule slot without crossing into clinic-closed hours.
 */

export type AppointmentType = 'consultation' | 'follow-up' | 'procedure' | 'emergency';

/** Per-type duration rules (minutes) */
export const DURATION_RULES: Record<
  AppointmentType,
  { minMinutes: number; maxMinutes: number; defaultMinutes: number }
> = {
  consultation: { minMinutes: 15, maxMinutes: 120, defaultMinutes: 30 },
  'follow-up': { minMinutes: 10, maxMinutes: 60, defaultMinutes: 15 },
  procedure: { minMinutes: 30, maxMinutes: 480, defaultMinutes: 60 },
  emergency: { minMinutes: 10, maxMinutes: 240, defaultMinutes: 30 },
};

/** Overall absolute limits regardless of type */
const ABSOLUTE_MIN_MINUTES = 5;
const ABSOLUTE_MAX_MINUTES = 480; // 8 hours

export interface DurationValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  recommendedDurationMinutes: number;
}

/**
 * Validates an appointment duration against type rules.
 *
 * @param type              The appointment type.
 * @param durationMinutes   The requested duration in minutes.
 * @param scheduledAt       Optional — when provided, checks that the appointment
 *                          ends before the clinic's close hour (default 17:00).
 * @param clinicCloseHour   Clinic closing hour (0-23). Defaults to 17.
 */
export function validateAppointmentDuration(
  type: AppointmentType,
  durationMinutes: number,
  scheduledAt?: Date,
  clinicCloseHour = 17,
): DurationValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const rules = DURATION_RULES[type];

  // ── Absolute bounds ───────────────────────────────────────────────────────
  if (!Number.isInteger(durationMinutes) || durationMinutes < ABSOLUTE_MIN_MINUTES) {
    errors.push(
      `Duration must be a positive integer and at least ${ABSOLUTE_MIN_MINUTES} minutes. Got: ${durationMinutes}.`,
    );
  }

  if (durationMinutes > ABSOLUTE_MAX_MINUTES) {
    errors.push(
      `Duration cannot exceed ${ABSOLUTE_MAX_MINUTES} minutes (${ABSOLUTE_MAX_MINUTES / 60} hours). Got: ${durationMinutes}.`,
    );
  }

  // ── Per-type bounds ───────────────────────────────────────────────────────
  if (durationMinutes < rules.minMinutes) {
    errors.push(
      `Duration for "${type}" must be at least ${rules.minMinutes} minutes. Got: ${durationMinutes}.`,
    );
  }

  if (durationMinutes > rules.maxMinutes) {
    errors.push(
      `Duration for "${type}" must not exceed ${rules.maxMinutes} minutes. Got: ${durationMinutes}.`,
    );
  }

  // ── Soft warnings (best-practice) ────────────────────────────────────────
  if (errors.length === 0) {
    if (durationMinutes < rules.defaultMinutes * 0.5) {
      warnings.push(
        `The requested duration (${durationMinutes} min) is less than half the recommended default (${rules.defaultMinutes} min) for "${type}" appointments.`,
      );
    }
    if (durationMinutes > rules.defaultMinutes * 2) {
      warnings.push(
        `The requested duration (${durationMinutes} min) is more than double the recommended default (${rules.defaultMinutes} min) for "${type}" appointments. Ensure this is intentional.`,
      );
    }
  }

  // ── Clinic hours check ────────────────────────────────────────────────────
  if (scheduledAt && errors.length === 0) {
    const endTime = new Date(scheduledAt.getTime() + durationMinutes * 60_000);
    const endHour = endTime.getHours() + endTime.getMinutes() / 60;
    if (endHour > clinicCloseHour) {
      errors.push(
        `Appointment would end at ${endTime.toTimeString().slice(0, 5)}, which is after clinic hours (closes at ${String(clinicCloseHour).padStart(2, '0')}:00).`,
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    recommendedDurationMinutes: rules.defaultMinutes,
  };
}

/**
 * Normalise a requested duration to the nearest valid value for the given
 * appointment type. Returns the recommended default if the value is out of
 * range. Useful when creating appointments from templates or fallback logic.
 */
export function normalizeDuration(
  type: AppointmentType,
  requestedMinutes: number,
): number {
  const rules = DURATION_RULES[type];
  if (requestedMinutes < rules.minMinutes) return rules.minMinutes;
  if (requestedMinutes > rules.maxMinutes) return rules.maxMinutes;
  return requestedMinutes;
}
