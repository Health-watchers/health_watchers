'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, PageHeader, PageWrapper, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { formatTime } from '@/lib/utils';
import { ChannelPreferences } from '@/components/notification-preferences/ChannelPreferences';
import { ContentPreferences } from '@/components/notification-preferences/ContentPreferences';
import { FrequencyControls } from '@/components/notification-preferences/FrequencyControls';
import { NotificationHistoryList } from '@/components/notification-preferences/NotificationHistoryList';
import { NotificationPreview } from '@/components/notification-preferences/NotificationPreview';
import { NotificationTemplatesViewer } from '@/components/notification-preferences/NotificationTemplatesViewer';
import { NotificationTester } from '@/components/notification-preferences/NotificationTester';
import { NotificationTypeSelector } from '@/components/notification-preferences/NotificationTypeSelector';
import { QuietHoursSchedule } from '@/components/notification-preferences/QuietHoursSchedule';
import { UnsubscribeManagement } from '@/components/notification-preferences/UnsubscribeManagement';
import {
  countEnabledChannels,
  countEnabledTypes,
  createDefaultPreferences,
  localTimezone,
} from '@/lib/notification-preferences/preferences';
import { SAMPLE_NOTIFICATION_HISTORY } from '@/lib/notification-preferences/sampleData';
import {
  clearStoredPreferences,
  loadPreferences,
  savePreferences,
} from '@/lib/notification-preferences/storage';
import type {
  NotificationChannel,
  NotificationHistoryEntry,
  NotificationPreferences,
  NotificationTypeKey,
} from '@/lib/notification-preferences/types';

type TabValue = 'types' | 'delivery' | 'content' | 'history' | 'templates' | 'unsubscribe';

/** Preferences with the local timezone label filled in. */
function withLocalTimezone(): NotificationPreferences {
  const defaults = createDefaultPreferences();
  return {
    ...defaults,
    quietHours: { ...defaults.quietHours, timezone: localTimezone() },
  };
}

export default function NotificationPreferencesClient() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(withLocalTimezone);
  const [history, setHistory] = useState<NotificationHistoryEntry[]>(SAMPLE_NOTIFICATION_HISTORY);
  const [hydrated, setHydrated] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<TabValue>('types');
  const [previewType, setPreviewType] = useState<NotificationTypeKey>('lab_results');
  const [previewChannel, setPreviewChannel] = useState<NotificationChannel>('email');

  // Restore any previously saved preferences on mount.
  useEffect(() => {
    const stored = loadPreferences();
    if (stored) {
      setPreferences({
        ...stored,
        quietHours: { ...stored.quietHours, timezone: localTimezone() },
      });
      setSavedAt(stored.updatedAt);
    }
    setHydrated(true);
  }, []);

  const update = (next: NotificationPreferences) => {
    setPreferences({ ...next, updatedAt: new Date().toISOString() });
  };

  const handleSave = () => {
    savePreferences(preferences);
    setSavedAt(preferences.updatedAt);
  };

  const handleReset = () => {
    clearStoredPreferences();
    setPreferences(withLocalTimezone());
    setSavedAt(null);
  };

  const markRead = (entryId: string) => {
    setHistory((current) =>
      current.map((entry) => (entry.id === entryId ? { ...entry, read: true } : entry))
    );
  };

  const markAllRead = () => {
    setHistory((current) => current.map((entry) => ({ ...entry, read: true })));
  };

  const addTestEntry = (entry: NotificationHistoryEntry) => {
    setHistory((current) => [entry, ...current]);
  };

  return (
    <PageWrapper className="space-y-6 py-6">
      <PageHeader
        title="Notification preferences"
        subtitle={`${countEnabledTypes(preferences)} of 8 categories · ${countEnabledChannels(
          preferences
        )} channels · ${preferences.frequency.replace(/_/g, ' ')}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={savedAt ? 'success' : 'warning'}>
              {savedAt ? `Saved ${formatTime(savedAt)}` : 'Unsaved changes'}
            </Badge>
            <Button onClick={handleSave} disabled={!hydrated}>
              Save preferences
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={!hydrated}>
              Reset to defaults
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)}>
        <TabsList className="overflow-x-auto">
          <TabsTrigger value="types">Types &amp; channels</TabsTrigger>
          <TabsTrigger value="delivery">Delivery &amp; quiet hours</TabsTrigger>
          <TabsTrigger value="content">Content &amp; preview</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="templates">Templates &amp; test</TabsTrigger>
          <TabsTrigger value="unsubscribe">Unsubscribe</TabsTrigger>
        </TabsList>

        <TabsContent value="types" className="space-y-4">
          <NotificationTypeSelector preferences={preferences} onChange={update} />
          <ChannelPreferences preferences={preferences} onChange={update} />
        </TabsContent>

        <TabsContent value="delivery" className="space-y-4">
          <FrequencyControls preferences={preferences} onChange={update} />
          <QuietHoursSchedule preferences={preferences} onChange={update} />
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <ContentPreferences preferences={preferences} onChange={update} />
          <NotificationPreview
            preferences={preferences}
            type={previewType}
            channel={previewChannel}
            onTypeChange={setPreviewType}
            onChannelChange={setPreviewChannel}
          />
        </TabsContent>

        <TabsContent value="history">
          <NotificationHistoryList
            entries={history}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
          />
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <NotificationTemplatesViewer />
          <NotificationTester preferences={preferences} onSent={addTestEntry} />
        </TabsContent>

        <TabsContent value="unsubscribe">
          <UnsubscribeManagement preferences={preferences} onChange={update} />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Preferences are stored on this device. The preview, tester and delivery rules all read the
        same settings, so what you see here is what the notification service will apply.
      </p>
    </PageWrapper>
  );
}
