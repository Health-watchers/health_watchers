"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface UserPreferences {
  language: string;
  emailNotifications: boolean;
  inAppNotifications: boolean;
}

export interface PreferencesSectionProps {
  preferences: UserPreferences;
}

async function patchPreferences(
  patch: Partial<UserPreferences>,
): Promise<void> {
  const res = await fetch("/api/settings/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? "Failed to save preference");
  }
}

export function PreferencesSection({ preferences }: PreferencesSectionProps) {
  const router = useRouter();

  const [language, setLanguage] = useState(preferences.language);
  const [emailNotifications, setEmailNotifications] = useState(
    preferences.emailNotifications,
  );
  const [inAppNotifications, setInAppNotifications] = useState(
    preferences.inAppNotifications,
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
      setError(
        err instanceof Error ? err.message : "Failed to update language",
      );
    }
  };

  const handleEmailToggle = async (checked: boolean) => {
    const prev = emailNotifications;
    setEmailNotifications(checked);
    setError(null);
    setSuccessMessage(null);
    try {
      await patchPreferences({ emailNotifications: checked });
      setSuccessMessage("Preferences saved");
    } catch (err) {
      setEmailNotifications(prev);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update notification preference",
      );
    }
  };

  const handleInAppToggle = async (checked: boolean) => {
    const prev = inAppNotifications;
    setInAppNotifications(checked);
    setError(null);
    setSuccessMessage(null);
    try {
      await patchPreferences({ inAppNotifications: checked });
      setSuccessMessage("Preferences saved");
    } catch (err) {
      setInAppNotifications(prev);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update notification preference",
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Preferences</h2>
        <p className="text-sm text-neutral-500">
          Manage your language and notification settings.
        </p>
      </div>

      <div className="space-y-6 max-w-md">
        {/* Language selector */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="language-select"
            className="text-sm font-medium text-neutral-700"
          >
            Language
          </label>
          <select
            id="language-select"
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <option value="en">English</option>
            <option value="fr">French</option>
          </select>
        </div>

        {/* Notification toggles */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-neutral-700">
            Notifications
          </h3>

          <div className="flex items-center justify-between">
            <label
              htmlFor="email-notifications"
              className="text-sm text-neutral-700"
            >
              Email Notifications
            </label>
            <input
              id="email-notifications"
              type="checkbox"
              role="switch"
              checked={emailNotifications}
              onChange={(e) => handleEmailToggle(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-primary-500"
              aria-checked={emailNotifications}
            />
          </div>

          <div className="flex items-center justify-between">
            <label
              htmlFor="inapp-notifications"
              className="text-sm text-neutral-700"
            >
              In-App Notifications
            </label>
            <input
              id="inapp-notifications"
              type="checkbox"
              role="switch"
              checked={inAppNotifications}
              onChange={(e) => handleInAppToggle(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-primary-500"
              aria-checked={inAppNotifications}
            />
          </div>
        </div>

        {successMessage && (
          <p className="text-sm text-green-600">{successMessage}</p>
        )}

        {error && <p className="text-sm text-danger-500">{error}</p>}
      </div>
    </div>
  );
}
