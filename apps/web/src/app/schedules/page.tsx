import { Metadata } from 'next';
import SchedulesClient from './SchedulesClient';

export const metadata: Metadata = {
  title: 'Staff Schedule',
  description: 'Create shifts and review staff availability.',
};

export default function SchedulesPage() {
  return <SchedulesClient />;
}
