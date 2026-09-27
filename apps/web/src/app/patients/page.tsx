import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import PatientsClient from './PatientsClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('patients.meta');
  return { title: t('title'), description: t('description') };
}

export default function PatientsPage() {
  return <PatientsClient />;
}
