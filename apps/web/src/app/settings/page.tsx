import SettingsClient from './SettingsClient';
import ClinicSettingsClient from './ClinicSettingsClient';
import ApiKeyManager from '@/components/settings/ApiKeyManager';

export default function SettingsPage() {
  return (
    <>
      <SettingsClient />
      <ClinicSettingsClient />
      <ApiKeyManager />
    </>
  );
}
