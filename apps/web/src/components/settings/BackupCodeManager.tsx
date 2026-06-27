'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';

interface BackupCodeCount {
  remaining: number;
  total: number;
  low: boolean;
}

interface BackupCodeManagerProps {
  /** Called after successful regeneration so the parent can refresh MFA status if needed */
  onRegenerated?: () => void;
}

export function BackupCodeManager({ onRegenerated }: BackupCodeManagerProps) {
  const [codeCount, setCodeCount] = useState<BackupCodeCount | null>(null);
  const [showRegenModal, setShowRegenModal] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state for the regeneration modal
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/mfa/backup-codes/count');
      if (res.ok) {
        const body = await res.json();
        setCodeCount(body.data);
      }
    } catch {
      // non-critical — silently ignore
    }
  }, []);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  const handleRegenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const body: Record<string, string> = { password };
      if (useBackupCode) {
        body.backupCode = backupCode;
      } else {
        body.totp = totpCode;
      }

      const res = await fetch('/api/settings/mfa/backup-codes/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? 'Failed to regenerate backup codes. Please try again.');
        return;
      }

      setNewCodes(data.data.backupCodes);
      setShowRegenModal(false);
      setPassword('');
      setTotpCode('');
      setBackupCode('');
      await fetchCount();
      onRegenerated?.();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadCodes = (codes: string[]) => {
    const text = codes.join('\n');
    const el = document.createElement('a');
    el.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`);
    el.setAttribute('download', 'backup-codes.txt');
    el.style.display = 'none';
    document.body.appendChild(el);
    el.click();
    document.body.removeChild(el);
  };

  return (
    <div className="space-y-3">
      {/* Low backup code warning */}
      {codeCount && codeCount.low && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <span className="mt-0.5 shrink-0 text-base" aria-hidden>
            ⚠️
          </span>
          <p>
            <strong>Low backup codes:</strong> You have{' '}
            <strong>{codeCount.remaining}</strong> backup code
            {codeCount.remaining !== 1 ? 's' : ''} remaining. Regenerate them now to avoid being
            locked out if you lose your authenticator.
          </p>
        </div>
      )}

      {codeCount !== null && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-600">
            Backup codes remaining:{' '}
            <strong className={codeCount.low ? 'text-amber-700' : 'text-neutral-900'}>
              {codeCount.remaining} / {codeCount.total}
            </strong>
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setError(null);
              setShowRegenModal(true);
            }}
          >
            Regenerate codes
          </Button>
        </div>
      )}

      {/* New codes display (after regeneration) */}
      {newCodes && (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-neutral-900">
            New backup codes generated. Save them now — they won&apos;t be shown again.
          </p>
          <div className="grid grid-cols-2 gap-1 font-mono text-sm">
            {newCodes.map((code) => (
              <span key={code} className="rounded bg-neutral-100 px-2 py-1 text-center">
                {code}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={() => downloadCodes(newCodes)}>
              Download
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setNewCodes(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      {/* Regeneration modal */}
      {showRegenModal && (
        <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-lg font-semibold text-neutral-900">
              Regenerate Backup Codes
            </h3>
            <p className="mb-4 text-sm text-neutral-600">
              All existing codes will be invalidated. Enter your password and a verification code to
              continue.
            </p>

            <form onSubmit={handleRegenerate} className="space-y-4">
              <div>
                <label
                  htmlFor="regen-password"
                  className="mb-1 block text-sm font-medium text-neutral-700"
                >
                  Current password
                </label>
                <input
                  id="regen-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  autoComplete="current-password"
                />
              </div>

              <div className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setUseBackupCode(!useBackupCode);
                    setTotpCode('');
                    setBackupCode('');
                  }}
                  className="text-blue-600 hover:text-blue-700 focus:underline"
                >
                  {useBackupCode ? 'Use authenticator code instead' : 'Use a backup code instead'}
                </button>
              </div>

              {useBackupCode ? (
                <div>
                  <label
                    htmlFor="regen-backup"
                    className="mb-1 block text-sm font-medium text-neutral-700"
                  >
                    Existing backup code
                  </label>
                  <input
                    id="regen-backup"
                    type="text"
                    required
                    value={backupCode}
                    onChange={(e) => setBackupCode(e.target.value.trim())}
                    placeholder="XXXX-XXXX"
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    autoComplete="off"
                  />
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="regen-totp"
                    className="mb-1 block text-sm font-medium text-neutral-700"
                  >
                    Authenticator code
                  </label>
                  <input
                    id="regen-totp"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-center text-lg tracking-widest focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    autoComplete="one-time-code"
                  />
                </div>
              )}

              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  type="submit"
                  variant="danger"
                  size="sm"
                  loading={isLoading}
                  disabled={
                    !password ||
                    (useBackupCode ? !backupCode : totpCode.length !== 6)
                  }
                >
                  Regenerate
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowRegenModal(false);
                    setError(null);
                    setPassword('');
                    setTotpCode('');
                    setBackupCode('');
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
