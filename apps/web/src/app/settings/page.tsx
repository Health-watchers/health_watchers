import SettingsClient from './SettingsClient';
import ClinicSettingsClient from './ClinicSettingsClient';
import ApiKeyManager from '@/components/settings/ApiKeyManager';
import WebhookManager from '@/components/settings/WebhookManager';

export default function SettingsPage() {
  return (
    <>
      <SettingsClient />
      <ClinicSettingsClient />
      <ApiKeyManager />
      <WebhookManager />
    </>
  );
}
