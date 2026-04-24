import { Metadata } from 'next';
import InvoicesClient from './InvoicesClient';

export const metadata: Metadata = {
  title: 'Invoices',
  description: 'Manage patient invoices and Stellar payment requests.',
};

export default function InvoicesPage() {
  return <InvoicesClient />;
}
