import { Metadata } from 'next';
import ComplianceCenterClient from './ComplianceCenterClient';

export const metadata: Metadata = {
  title: 'Compliance Center',
  description: 'Track HIPAA breach incidents and business associate agreements.',
};

export default function CompliancePage() {
  return <ComplianceCenterClient />;
}
