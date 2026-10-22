import { portalMetadata } from '../portalMeta';

export const metadata = portalMetadata({
  title: 'Encounters',
  description: 'View your medical encounter summaries and visit notes.',
  path: '/encounters',
});

export default function PortalEncountersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
