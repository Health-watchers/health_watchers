import { portalMetadata } from '../portalMeta';

export const metadata = portalMetadata({
  title: 'Dashboard',
  description: 'Your Health Watchers patient portal dashboard.',
  path: '/dashboard',
});

export default function PortalDashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
