"use client";

import ChangePasswordForm from "./ChangePasswordForm";
import { MfaToggle } from "./MfaToggle";

interface SecuritySectionProps {
  mfaEnabled: boolean;
  onMfaStatusChange: () => void;
}

export function SecuritySection({
  mfaEnabled,
  onMfaStatusChange,
}: SecuritySectionProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-neutral-900">Security</h2>

      <ChangePasswordForm />

      <hr className="border-neutral-200" />

      <MfaToggle
        mfaEnabled={mfaEnabled}
        onMfaStatusChange={onMfaStatusChange}
      />
    </div>
  );
}
