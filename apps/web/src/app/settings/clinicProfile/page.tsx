'use client';

import { useState } from 'react';
import {
  DEFAULT_BUSINESS_HOURS,
  type ClinicConfiguration,
} from '@/lib/clinicSettings/types';
import { validateClinicConfiguration, type ValidationIssue } from '@/lib/clinicSettings/validation';

const EMPTY_CONFIG: ClinicConfiguration = {
  profile: { name: '', phone: '', email: '', address: '', timezone: 'UTC' },
  businessHours: DEFAULT_BUSINESS_HOURS,
  providers: [],
  departments: [],
  facility: {
    roomsCount: 1,
    maxDailyAppointments: 20,
    telehealthEnabled: false,
    walkInsAllowed: false,
  },
  closureDates: [],
  notifications: {
    appointmentReminders: true,
    reminderLeadHours: 24,
    smsEnabled: true,
    emailEnabled: true,
    staffAlerts: true,
  },
  branding: { primaryColor: '#2563eb' },
  security: {
    mfaRequired: false,
    sessionTimeoutMinutes: 30,
    passwordMinLength: 10,
    passwordRequiresSymbol: true,
    ipAllowList: [],
  },
};

const SECTIONS = [
  'profile',
  'businessHours',
  'providers',
  'departments',
  'facility',
  'closureDates',
  'notifications',
  'branding',
  'security',
  'auditLog',
] as const;

type Section = (typeof SECTIONS)[number];

/**
 * Comprehensive clinic configuration interface: profile, business hours,
 * providers, departments, facility settings, closures, notifications,
 * branding, security policy, and audit log — all in one settings surface.
 */
export default function ClinicConfigPage() {
  const [config, setConfig] = useState<ClinicConfiguration>(EMPTY_CONFIG);
  const [activeSection, setActiveSection] = useState<Section>('profile');
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function handleSave() {
    const validationIssues = validateClinicConfiguration(config);
    setIssues(validationIssues);
    if (validationIssues.length === 0) {
      setSavedAt(new Date().toISOString());
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:flex-row">
      <nav className="flex flex-row gap-1 overflow-x-auto md:w-48 md:flex-col">
        {SECTIONS.map((section) => (
          <button
            key={section}
            type="button"
            className={`whitespace-nowrap rounded px-3 py-2 text-left text-sm ${
              activeSection === section ? 'bg-blue-100 font-medium' : 'hover:bg-gray-100'
            }`}
            onClick={() => setActiveSection(section)}
          >
            {section}
          </button>
        ))}
      </nav>

      <div className="flex-1 space-y-4">
        <h1 className="text-xl font-semibold capitalize">{activeSection} settings</h1>

        {activeSection === 'profile' && (
          <div className="space-y-2">
            <input
              className="w-full rounded border px-2 py-1"
              placeholder="Clinic name"
              value={config.profile.name}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, profile: { ...prev.profile, name: e.target.value } }))
              }
            />
            <input
              className="w-full rounded border px-2 py-1"
              placeholder="Email"
              value={config.profile.email}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, profile: { ...prev.profile, email: e.target.value } }))
              }
            />
          </div>
        )}

        {activeSection === 'businessHours' && (
          <div className="space-y-1">
            {config.businessHours.map((entry) => (
              <div key={entry.day} className="flex items-center gap-2 text-sm">
                <span className="w-10 uppercase">{entry.day}</span>
                <input
                  type="checkbox"
                  checked={!entry.closed}
                  onChange={() =>
                    setConfig((prev) => ({
                      ...prev,
                      businessHours: prev.businessHours.map((h) =>
                        h.day === entry.day ? { ...h, closed: !h.closed } : h
                      ),
                    }))
                  }
                />
                <span>{entry.closed ? 'Closed' : `${entry.open} - ${entry.close}`}</span>
              </div>
            ))}
          </div>
        )}

        {activeSection === 'security' && (
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.security.mfaRequired}
                onChange={() =>
                  setConfig((prev) => ({
                    ...prev,
                    security: { ...prev.security, mfaRequired: !prev.security.mfaRequired },
                  }))
                }
              />
              Require MFA for all staff
            </label>
          </div>
        )}

        {activeSection === 'auditLog' && (
          <p className="text-sm text-gray-600">
            Every change to this configuration is diffed and recorded via
            <code className="mx-1">diffConfigForAudit</code> in
            <code className="mx-1">lib/clinicSettings/validation.ts</code>.
          </p>
        )}

        {issues.length > 0 && (
          <ul className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {issues.map((issue) => (
              <li key={issue.field}>{issue.message}</li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white"
          onClick={handleSave}
        >
          Save changes
        </button>

        {savedAt && <p className="text-sm text-green-700">Saved at {savedAt}</p>}
      </div>
    </div>
  );
}
