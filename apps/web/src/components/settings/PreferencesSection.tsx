'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface NotificationTypes {
  referral_received: boolean;
  payment_confirmed: boolean;
  appointment_reminder: boolean;
  ai_summary_ready: boolean;
  lab_result_ready: boolean;
  system: boolean;
}

export interface UserPreferences {
  language: string;
  emailNotifications: boolean;
  inAppNotifications: boolean;
  notificationTypes?: NotificationTypes;
}

export interface PreferencesSectionProps {
  preferences: UserPreferences;
}

const NOTIFICATION_TYPE_LABELS: Record<keyof NotificationTypes, string> = {
  referral_received:    'Referral Received',
  payment_confirmed:    'Payment Confirmed',
  appointment_reminder: 'Appointment Reminders',
  ai_summary_ready:     'AI Summary Ready',
  lab_result_ready:     'Lab Results Ready',
  system:               'System Notifications',
};

const DEFAULT_TYPES: NotificationTypes = {
  referral_received: true,
  payment_confirmed: true,
  appointment_reminder: true,
  ai_summary_ready: true,
  lab_result_ready: true,
  system: true,
};

async function patchPreferences(patch: Partial<UserPreferences & { notificationTypes: Partial<NotificationTypes> }>): Promise<void> {
  const res = await fetch('/api/settings/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? 'Failed to save preference');
  }
}

export function PreferencesSection({ preferences }: PreferencesSectionProps) {
  const router = useRouter();

  const [language, setLanguage] = useState(preferences.language);
  const [emailNotifications, setEmailNotifications] = useState(preferences.emailNotifications);
  const [inAppNotifications, setInAppNotifications] = useState(preferences.inAppNotifications);
  const [notifTypes, setNotifTypes] = useState<NotificationTypes>(
    preferences.notificationTypes ?? DEFAULT_TYPES
  );
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleLanguageChange = async (newLang: string) => {
    const prev = language;
    setLanguage(newLang);
    setError(null);
    setSuccessMessage(null);
    try {
      await patchPreferences({ language: newLang });
      document.cookie = `NEXT_LOCALE=${newLang}; path=/`;
      router.refresh();
    } catch (err) {
      setLanguage(prev);
      setError(err instanceof Error ? err.message : 'Failed to update language');
    }
  };

  const handleEmailToggle = async (checked: boolean) => {
    const prev = emailNotifications;
    setEmailNotifications(checked);
    setError(null);
    setSuccessMessage(null);
    try {
      await patchPreferences({ emailNotifications: checked });
      setSuccessMessage('Preferences saved');
    } catch (err) {
      setEmailNotifications(prev);
      setError(err instanceof Error ? err.message : 'Failed to update notification preference');
    }
  };

  const handleInAppToggle = async (checked: boolean) => {
    const prev = inAppNotifications;
    setInAppNotifications(checked);
    setError(null);
    setSuccessMessage(null);
    try {
      await patchPreferences({ inAppNotifications: checked });
      setSuccessMessage('Preferences saved');
    } catch (err) {
      setInAppNotifications(prev);
      setError(err instanceof Error ? err.message : 'Failed to update notification preference');
    }
  };

  const handleTypeToggle = async (type: keyof NotificationTypes, checked: boolean) => {
    const prev = notifTypes[type];
    setNotifTypes((t) => ({ ...t, [type]: checked }));
    setError(null);
    setSuccessMessage(null);
    try {
      await patchPreferences({ notificationTypes: { [type]: checked } });
      setSuccessMessage('Preferences saved');
    } catch (err) {
      setNotifTypes((t) => ({ ...t, [type]: prev }));
      setError(err instanceof Error ? err.message : 'Failed to update notification preference');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Preferences</h2>
        <p className="text-sm text-neutral-500">Manage your language and notification settings.</p>
      </div>

      <div className="max-w-md space-y-6">
        {/* Language selector */}
        <div className="flex flex-col gap-1">
          <label htmlFor="language-select" className="text-sm font-medium text-neutral-700">
            Language
          </label>
          <select
            id="language-select"
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="focus-visible:ring-primary-500 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus-visible:ring-2"
          >
            <option value="en">English</option>
            <option value="fr">French</option>
          </select>
        </div>

        {/* Global notification toggles */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-neutral-700">Notifications</h3>

          <div className="flex items-center justify-between">
            <label htmlFor="email-notifications" className="text-sm text-neutral-700">
              Email Notifications
            </label>
            <input
              id="email-notifications"
              type="checkbox"
              role="switch"
              checked={emailNotifications}
              onChange={(e) => handleEmailToggle(e.target.checked)}
              className="accent-primary-500 h-4 w-4 cursor-pointer"
              aria-checked={emailNotifications}
            />
          </div>

          <div className="flex items-center justify-between">
            <label htmlFor="inapp-notifications" className="text-sm text-neutral-700">
              In-App Notifications
            </label>
            <input
              id="inapp-notifications"
              type="checkbox"
              role="switch"
              checked={inAppNotifications}
              onChange={(e) => handleInAppToggle(e.target.checked)}
              className="accent-primary-500 h-4 w-4 cursor-pointer"
              aria-checked={inAppNotifications}
            />
          </div>
        </div>

        {/* Per-type notification preferences */}
        {inAppNotifications && (
          <div className="space-y-3 border-t border-neutral-200 pt-4">
            <h3 className="text-sm font-medium text-neutral-700">Notification Types</h3>
            <p className="text-xs text-neutral-500">Choose which in-app notifications you receive.</p>
            {(Object.keys(NOTIFICATION_TYPE_LABELS) as (keyof NotificationTypes)[]).map((type) => (
              <div key={type} className="flex items-center justify-between">
                <label htmlFor={`notif-type-${type}`} className="text-sm text-neutral-700">
                  {NOTIFICATION_TYPE_LABELS[type]}
                </label>
                <input
                  id={`notif-type-${type}`}
                  type="checkbox"
                  role="switch"
                  checked={notifTypes[type]}
                  onChange={(e) => handleTypeToggle(type, e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-primary-500"
                  aria-checked={notifTypes[type]}
                />
              </div>
            ))}
          </div>
        )}

        {successMessage && <p className="text-sm text-green-600">{successMessage}</p>}
        {error && <p className="text-danger-500 text-sm">{error}</p>}
      </div>
    </div>
  );
}
