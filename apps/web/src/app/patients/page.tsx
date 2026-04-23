import { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import PatientsClient from './PatientsClient';

export const metadata: Metadata = {
  title: 'Patients',
  description: 'Manage patient records, view medical history, and track patient care.',
};

export default function PatientsPage() {
  const t = useTranslations('patients');
  const tNew = useTranslations('patientNew');
  return (
    <PatientsClient
      labels={{
        title: t('title'),
        loading: t('loading'),
        empty: t('empty'),
        id: t('id'),
        name: t('name'),
        dob: t('dob'),
        sex: t('sex'),
        contact: t('contact'),
        search: t('search'),
        view: t('view'),
        registerNew: tNew('title'),
      }}
    />
  );
}
