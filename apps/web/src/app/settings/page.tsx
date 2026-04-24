import SettingsClient from './SettingsClient';
import ClinicSettingsClient from './ClinicSettingsClient';

export default function SettingsPage() {
  return (
    <>
      <SettingsClient />
      <ClinicSettingsClient />
    </>
  );
}
