import { portalMetadata } from '../portalMeta';

export const metadata = portalMetadata({
  title: 'Payments',
  description: 'View and pay your outstanding medical invoices.',
  path: '/payments',
});

export default function PortalPaymentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
