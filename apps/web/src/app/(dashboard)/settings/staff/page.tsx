import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import StaffManagementClient from './StaffManagementClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('staff');
  return { title: t('title') };
}

export default function StaffManagementPage() {
  return <StaffManagementClient />;
}
