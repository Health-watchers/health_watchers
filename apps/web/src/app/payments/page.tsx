import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import PaymentsClient from './PaymentsClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('payments.meta');
  return { title: t('title'), description: t('description') };
}

export default function PaymentsPage() {
  return <PaymentsClient />;
}
