import { getTranslations } from 'next-intl/server';
import PaymentsClient from './PaymentsClient';

export default async function PaymentsPage() {
  const t = await getTranslations('payments');
  return (
    <PaymentsClient
      labels={{
        title: t('title'),
        newPayment: t('newPayment'),
        newPaymentIntent: t('newPaymentIntent'),
        loading: t('loading'),
        created: t('created'),
        confirmed: t('confirmed'),
        noMatch: t('noMatch'),
        all: t('all'),
        pending: t('pending'),
        completed: t('completed'),
        failed: t('failed'),
        from: t('from'),
        to: t('to'),
        id: t('id'),
        patient: t('patient'),
        amount: t('amount'),
        status: t('status'),
        transaction: t('transaction'),
        date: t('date'),
        actions: t('actions'),
        confirm: t('confirm'),
        viewOnExplorer: t('viewOnExplorer'),
      }}
    />
  );
}
