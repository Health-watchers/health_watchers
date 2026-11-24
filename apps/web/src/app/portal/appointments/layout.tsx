import { portalMetadata } from '../portalMeta';

export const metadata = portalMetadata({
  title: 'Appointments',
  description: 'View and manage your upcoming appointments at Health Watchers.',
  path: '/appointments',
});

export default function PortalAppointmentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
