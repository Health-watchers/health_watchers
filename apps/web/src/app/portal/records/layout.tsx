import { portalMetadata } from '../portalMeta';

export const metadata = portalMetadata({
  title: 'My Records',
  description: 'Access your medical records and documents securely.',
  path: '/records',
});

export default function PortalRecordsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
