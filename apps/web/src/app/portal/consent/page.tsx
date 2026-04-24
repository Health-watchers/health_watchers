'use client';

import { useState } from 'react';

interface ConsentItem {
  id: string;
  label: string;
  description: string;
  granted: boolean;
}

const INITIAL_CONSENTS: ConsentItem[] = [
  {
    id: 'data_sharing',
    label: 'Data Sharing with Specialists',
    description: 'Allow your records to be shared with referred specialists.',
    granted: true,
  },
  {
    id: 'research',
    label: 'Anonymised Research Use',
    description: 'Allow anonymised data to be used for medical research.',
    granted: false,
  },
  {
    id: 'email_comms',
    label: 'Email Communications',
    description: 'Receive appointment reminders and health tips by email.',
    granted: true,
  },
];

export default function PortalConsentPage() {
  const [consents, setConsents] = useState(INITIAL_CONSENTS);
  const [saved, setSaved] = useState(false);

  const toggle = (id: string) => {
    setSaved(false);
    setConsents((prev) => prev.map((c) => (c.id === id ? { ...c, granted: !c.granted } : c)));
  };

  const save = () => {
    // In a full implementation this would POST to /api/v1/portal/consent
    setSaved(true);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Consent Preferences</h1>
      <p className="text-sm text-gray-500">
        Manage how your health information is used. Changes take effect immediately.
      </p>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <ul className="divide-y divide-gray-100">
          {consents.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-4 py-4">
              <div>
                <p className="text-sm font-medium text-gray-800">{c.label}</p>
                <p className="text-xs text-gray-500">{c.description}</p>
              </div>
              <button
                role="switch"
                aria-checked={c.granted}
                onClick={() => toggle(c.id)}
                className={`relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${c.granted ? 'bg-blue-600' : 'bg-gray-300'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${c.granted ? 'translate-x-5' : 'translate-x-0'}`}
                />
                <span className="sr-only">{c.granted ? 'Granted' : 'Withdrawn'}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={save}
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Save preferences
          </button>
          {saved && <span className="text-sm text-green-600">Saved ✓</span>}
        </div>
      </section>
    </div>
  );
}
