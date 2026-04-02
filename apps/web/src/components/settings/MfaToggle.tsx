"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { MfaSetupModal } from "./MfaSetupModal";

interface MfaToggleProps {
  mfaEnabled: boolean;
  onMfaStatusChange: () => void;
}

export function MfaToggle({ mfaEnabled, onMfaStatusChange }: MfaToggleProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEnableClick = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/settings/mfa/enable", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          body?.message ?? "Failed to initiate MFA setup. Please try again.",
        );
        return;
      }
      const data = await res.json();
      setQrCodeUrl(data.qrCodeUrl);
      setSecret(data.secret);
      setModalOpen(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisableConfirm = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/settings/mfa/disable", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.message ?? "Failed to disable MFA. Please try again.");
        return;
      }
      setShowDisableConfirm(false);
      onMfaStatusChange();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-800">
            Two-factor authentication
          </p>
          <p className="text-sm text-neutral-500">
            {mfaEnabled ? "MFA is enabled" : "MFA is disabled"}
          </p>
        </div>

        {mfaEnabled ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setError(null);
              setShowDisableConfirm(true);
            }}
            disabled={isLoading}
          >
            Disable MFA
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={handleEnableClick}
            loading={isLoading}
          >
            Enable MFA
          </Button>
        )}
      </div>

      {showDisableConfirm && (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
          <p className="mb-3 text-sm text-neutral-700">
            Are you sure you want to disable two-factor authentication? This
            will make your account less secure.
          </p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              size="sm"
              onClick={handleDisableConfirm}
              loading={isLoading}
            >
              Confirm
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowDisableConfirm(false);
                setError(null);
              }}
              disabled={isLoading}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger-500">
          {error}
        </p>
      )}

      <MfaSetupModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          setModalOpen(false);
          onMfaStatusChange();
        }}
        qrCodeUrl={qrCodeUrl}
        secret={secret}
      />
    </div>
  );
}
