'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Toast, PageWrapper } from '@/components/ui';

interface NotificationPreferences {
  emailNotifications: boolean;
  pushNotifications: boolean;
  referralUpdates: boolean;
  appointmentReminders: boolean;
  testResults: boolean;
  prescriptionAlerts: boolean;
  systemUpdates: boolean;
  weeklyDigest: boolean;
  notificationFrequency: 'immediate' | 'daily' | 'weekly';
}

export default function NotificationSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    emailNotifications: true,
    pushNotifications: true,
    referralUpdates: true,
    appointmentReminders: true,
    testResults: true,
    prescriptionAlerts: true,
    systemUpdates: false,
    weeklyDigest: true,
    notificationFrequency: 'immediate',
  });

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      const response = await fetch('/api/v1/settings/notifications', {
        headers: { Authorization: `Bearer ${localStorage.getItem('portalAccessToken')}` },
      });
      if (response.ok) {
        const data = await response.json();
        setPreferences(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch preferences:', err);
      setError('Failed to load notification preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (key: keyof NotificationPreferences) => {
    if (typeof preferences[key] === 'boolean') {
      setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
    }
  };

  const handleFrequencyChange = (frequency: 'immediate' | 'daily' | 'weekly') => {
    setPreferences((prev) => ({ ...prev, notificationFrequency: frequency }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/v1/settings/notifications', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('portalAccessToken')}`,
        },
        body: JSON.stringify(preferences),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Failed to update preferences');
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('An error occurred while updating preferences');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageWrapper>
        <div className="p-6">Loading notification preferences...</div>
      </PageWrapper>
    );
  }

  const notificationChannels = [
    { key: 'emailNotifications', label: 'Email Notifications' },
    { key: 'pushNotifications', label: 'Push Notifications' },
  ];

  const notificationTypes = [
    {
      key: 'referralUpdates',
      label: 'Referral Updates',
      description: 'Get notified when referrals are updated',
    },
    {
      key: 'appointmentReminders',
      label: 'Appointment Reminders',
      description: 'Reminders before your appointments',
    },
    {
      key: 'testResults',
      label: 'Test Results',
      description: 'Alerts when lab results are available',
    },
    {
      key: 'prescriptionAlerts',
      label: 'Prescription Alerts',
      description: 'Notifications about prescriptions',
    },
    {
      key: 'systemUpdates',
      label: 'System Updates',
      description: 'Important system and security updates',
    },
    { key: 'weeklyDigest', label: 'Weekly Digest', description: 'Summary of weekly activity' },
  ];

  return (
    <PageWrapper>
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="mb-6 text-3xl font-bold">Notification Preferences</h1>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {success && <Toast type="success" message="Preferences updated successfully!" />}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Notification Channels */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">Notification Channels</h2>
            <div className="space-y-3">
              {notificationChannels.map((channel) => (
                <label
                  key={channel.key}
                  className="flex cursor-pointer items-center gap-3 rounded-lg p-3 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={preferences[channel.key as keyof NotificationPreferences] as boolean}
                    onChange={() => handleToggle(channel.key as keyof NotificationPreferences)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="font-medium text-gray-900">{channel.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Notification Types */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">What to Notify Me About</h2>
            <div className="space-y-3">
              {notificationTypes.map((type) => (
                <label
                  key={type.key}
                  className="flex cursor-pointer items-start gap-3 rounded-lg p-3 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={preferences[type.key as keyof NotificationPreferences] as boolean}
                    onChange={() => handleToggle(type.key as keyof NotificationPreferences)}
                    className="mt-1 h-4 w-4 rounded border-gray-300"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{type.label}</p>
                    <p className="text-sm text-gray-600">{type.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Notification Frequency */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">Notification Frequency</h2>
            <div className="space-y-3">
              {(['immediate', 'daily', 'weekly'] as const).map((frequency) => (
                <label
                  key={frequency}
                  className="flex cursor-pointer items-center gap-3 rounded-lg p-3 hover:bg-gray-50"
                >
                  <input
                    type="radio"
                    name="frequency"
                    value={frequency}
                    checked={preferences.notificationFrequency === frequency}
                    onChange={() => handleFrequencyChange(frequency)}
                    className="h-4 w-4 border-gray-300"
                  />
                  <div>
                    <p className="font-medium text-gray-900">
                      {frequency.charAt(0).toUpperCase() + frequency.slice(1)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {frequency === 'immediate' && 'Get notified right away'}
                      {frequency === 'daily' && 'Get daily digest at 9 AM'}
                      {frequency === 'weekly' && 'Get weekly digest on Mondays'}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Preferences'}
            </Button>
            <Button variant="secondary" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </PageWrapper>
  );
}
