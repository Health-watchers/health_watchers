import { Metadata } from 'next';
import ReferralsClient from './ReferralsClient';

export const metadata: Metadata = {
  title: 'Referrals',
  description: 'Manage incoming and outgoing patient referrals.',
};

export default function ReferralsPage() {
  return <ReferralsClient />;
}
