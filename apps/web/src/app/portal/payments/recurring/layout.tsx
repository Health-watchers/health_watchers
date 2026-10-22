import { portalMetadata } from '../../portalMeta';

export const metadata = portalMetadata({
  title: 'Recurring payments',
  description: 'Pause, resume or cancel your recurring payment plans and review their history.',
  path: '/payments/recurring',
});

export default function PortalRecurringPaymentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
