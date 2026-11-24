'use client';

import { RegistrationWizard } from '@/components/registration/RegistrationWizard';
import type { RegistrationState } from '@/lib/registration/types';

export default function RegisterWizardPage() {
  function handleComplete(state: RegistrationState) {
    console.info('Registration complete', state);
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-semibold">Patient Registration</h1>
      <RegistrationWizard onComplete={handleComplete} />
    </div>
  );
}
