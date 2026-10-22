import { Metadata } from 'next';
import EraDashboardClient from './EraDashboardClient';

export const metadata: Metadata = {
  title: 'Claims & remittances',
  description: 'Insurance claim status and Electronic Remittance Advice (ERA) dashboard.',
};

export default function EraDashboardPage() {
  return <EraDashboardClient />;
}
