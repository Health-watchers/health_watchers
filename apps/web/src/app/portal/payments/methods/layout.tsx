import { portalMetadata } from '../../portalMeta';

export const metadata = portalMetadata({
  title: 'Payment methods',
  description: 'Add or remove the cards you use for clinic payments.',
  path: '/payments/methods',
});

export default function PortalPaymentMethodsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
