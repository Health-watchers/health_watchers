import { useTranslations } from 'next-intl';
import PatientDetailClient from './PatientDetailClient';

export default function PatientDetailPage({ params }: { params: { id: string } }) {
  const t = useTranslations('patientDetail');
  return (
    <PatientDetailClient
      patientId={params.id}
      labels={{
        back: t('back'),
        loading: t('loading'),
        error: t('error'),
        notFound: t('notFound'),
        demographics: t('demographics'),
        encounters: t('encounters'),
        payments: t('payments'),
        aiInsights: t('aiInsights'),
        noEncounters: t('noEncounters'),
        noPayments: t('noPayments'),
        newEncounter: t('newEncounter'),
        initiatePayment: t('initiatePayment'),
        editPatient: t('editPatient'),
        generateSummary: t('generateSummary'),
        aiSummaryPlaceholder: t('aiSummaryPlaceholder'),
        lastAnalysis: t('lastAnalysis'),
        active: t('active'),
        inactive: t('inactive'),
        registeredOn: t('registeredOn'),
        age: t('age'),
        dob: t('dob'),
        sex: t('sex'),
        contact: t('contact'),
        address: t('address'),
        systemId: t('systemId'),
      }}
    />
  );
}
