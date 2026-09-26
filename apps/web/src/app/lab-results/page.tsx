import { Metadata } from 'next';
import { RealtimeProvider } from '@/components/RealtimeProvider';
import LabResultsWorklistClient from './LabResultsWorklistClient';

export const metadata: Metadata = {
  title: 'Lab Results',
  description: 'Clinic-wide worklist of lab results awaiting review.',
};

export default function LabResultsPage() {
  return (
    <RealtimeProvider>
      <LabResultsWorklistClient />
    </RealtimeProvider>
  );
}
