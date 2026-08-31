/**
 * Validation and audit-log helpers for clinic configuration changes.
 * Every save should be validated first, then diffed into audit entries
 * before being persisted, per the acceptance criteria.
 */

import type {
  AuditLogEntry,
  BusinessHoursEntry,
  ClinicConfiguration,
  ClinicProfile,
  SecurityPolicy,
} from './types';

export interface ValidationIssue {
  field: string;
  message: string;
}

export function validateProfile(profile: ClinicProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!profile.name.trim()) issues.push({ field: 'profile.name', message: 'Clinic name is required' });
  if (!/^\S+@\S+\.\S+$/.test(profile.email)) {
    issues.push({ field: 'profile.email', message: 'A valid email address is required' });
  }
  if (!profile.phone.trim()) issues.push({ field: 'profile.phone', message: 'Phone number is required' });
  if (!profile.timezone) issues.push({ field: 'profile.timezone', message: 'Timezone is required' });
  return issues;
}

export function validateBusinessHours(hours: BusinessHoursEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const entry of hours) {
    if (entry.closed) continue;
    if (entry.open >= entry.close) {
      issues.push({
        field: `businessHours.${entry.day}`,
        message: `Closing time must be after opening time on ${entry.day}`,
      });
    }
  }
  return issues;
}

export function validateSecurityPolicy(policy: SecurityPolicy): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (policy.sessionTimeoutMinutes < 5) {
    issues.push({ field: 'security.sessionTimeoutMinutes', message: 'Session timeout must be at least 5 minutes' });
  }
  if (policy.passwordMinLength < 8) {
    issues.push({ field: 'security.passwordMinLength', message: 'Minimum password length must be at least 8' });
  }
  for (const ip of policy.ipAllowList) {
    if (!/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(ip)) {
      issues.push({ field: 'security.ipAllowList', message: `"${ip}" is not a valid IP or CIDR range` });
    }
  }
  return issues;
}

export function validateClinicConfiguration(config: ClinicConfiguration): ValidationIssue[] {
  return [
    ...validateProfile(config.profile),
    ...validateBusinessHours(config.businessHours),
    ...validateSecurityPolicy(config.security),
  ];
}

/** Produces audit log entries by diffing top-level sections between two configs. */
export function diffConfigForAudit(
  previous: ClinicConfiguration,
  next: ClinicConfiguration,
  actor: string
): AuditLogEntry[] {
  const entries: AuditLogEntry[] = [];
  const sections: (keyof ClinicConfiguration)[] = [
    'profile',
    'businessHours',
    'providers',
    'departments',
    'facility',
    'closureDates',
    'notifications',
    'branding',
    'security',
  ];

  const timestamp = new Date().toISOString();

  for (const section of sections) {
    const prevValue = JSON.stringify(previous[section]);
    const nextValue = JSON.stringify(next[section]);
    if (prevValue !== nextValue) {
      entries.push({
        id: `${section}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        actor,
        action: 'update',
        target: section,
        timestamp,
        previousValue: previous[section],
        newValue: next[section],
      });
    }
  }

  return entries;
}
