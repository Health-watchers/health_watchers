import { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import RegisterPatientClient from './RegisterPatientClient';

export const metadata: Metadata = {
  title: 'Register New Patient',
  description: 'Create a new patient record in the Health Watchers system.',
};

export default function RegisterPatientPage() {
  const t = useTranslations('patientNew');
  return (
    <RegisterPatientClient
      labels={{
        title: t('title'),
        subtitle: t('subtitle'),
        back: t('back'),
        firstName: t('firstName'),
        firstNamePlaceholder: t('firstNamePlaceholder'),
        lastName: t('lastName'),
        lastNamePlaceholder: t('lastNamePlaceholder'),
        dateOfBirth: t('dateOfBirth'),
        sex: t('sex'),
        sexMale: t('sexMale'),
        sexFemale: t('sexFemale'),
        sexOther: t('sexOther'),
        contactNumber: t('contactNumber'),
        contactNumberPlaceholder: t('contactNumberPlaceholder'),
        address: t('address'),
        addressPlaceholder: t('addressPlaceholder'),
        submit: t('submit'),
        submitting: t('submitting'),
        cancel: t('cancel'),
        successToast: t('successToast'),
        errorFallback: t('errorFallback'),
      }}
    />
  );
}
