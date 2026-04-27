import { getTranslations } from 'next-intl/server';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const t = await getTranslations('dashboard');
  const tc = await getTranslations('common');

  return (
    <DashboardClient
      labels={{
        title: t('title'),
        todayPatients: t('todayPatients'),
        todayEncounters: t('todayEncounters'),
        pendingPayments: t('pendingPayments'),
        activeDoctors: t('activeDoctors'),
        recentPatients: t('recentPatients'),
        noPatientsYet: t('noPatientsYet'),
        todayEncountersTable: t('todayEncountersTable'),
        noEncountersToday: t('noEncountersToday'),
        pendingPaymentsTable: t('pendingPaymentsTable'),
        noPendingPayments: t('noPendingPayments'),
        newPatient: t('newPatient'),
        logEncounter: t('logEncounter'),
        paymentIntent: t('paymentIntent'),
        apiError: t('apiError'),
        firstName: t('firstName'),
        lastName: t('lastName'),
        registered: t('registered'),
        chiefComplaint: t('chiefComplaint'),
        time: t('time'),
        intentId: t('intentId'),
        amount: t('amount'),
        status: t('status'),
        loading: tc('loading'),
      }}
    />
  );
}
