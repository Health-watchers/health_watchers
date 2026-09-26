import { Metadata } from 'next';
import BillingClient from './BillingClient';

export const metadata: Metadata = {
  title: 'Billing',
  description: 'Insurance claims queues, denial handling, and A/R aging.',
};

export default function BillingPage() {
  return <BillingClient />;
}
