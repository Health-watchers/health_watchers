'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

interface MFAStatus {
  mfaEnabled: boolean;
  mfaMethod: 'totp' | 'sms' | null;
  mfaEnabledAt: string | null;
}

export default function PortalSecuritySettings() {
  const router = useRouter();
  const { user } = useAuth();
  const [mfaStatus, setMfAStatus] = useState<MFAStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupMethod, setSetupMethod] = useState<'totp' | 'sms'>('totp');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [showDisableModal, setShowDisableModal] = useState(false);

  useEffect(() => {
    fetchMFAStatus();
  }, []);

  const fetchMFAStatus = async () => {
    try {
      const response = await fetch('/api/v1/portal/auth/mfa/status', {
        headers: { Authorization: `Bearer ${localStorage.getItem('portalAccessToken')}` },
      });
      if (response.ok) {
        const data = await response.json();
        setMFAStatus(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch MFA status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSetupMFA = async () => {
    setError(null);
    try {
      const payload: any = { method: setupMethod };
      if (setupMethod === 'sms') {
        payload.phoneNumber = phoneNumber;
      }

      const response = await fetch('/api/v1/portal/auth/mfa/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('portalAccessToken')}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Failed to setup MFA');
        return;
      }

      const data = await response.json();
      setTempToken(data.data.tempToken);

      if (setupMethod === 'totp') {
        setQrCode(data.data.qrCodeDataUrl);
      }
    } catch (err) {
      setError('An error occurred while setting up MFA');
      console.error(err);
    }
  };

  const handleVerifyMFA = async () => {
    if (!tempToken || !verificationCode) {
      setError('Please enter the verification code');
      return;
    }

    setError(null);
    try {
      const response = await fetch('/api/v1/portal/auth/mfa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: verificationCode,
          tempToken,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Invalid verification code');
        return;
      }

      const data = await response.json();
      setBackupCodes(data.data.backupCodes);
      setShowBackupCodes(true);
      setMFAStatus({
        mfaEnabled: true,
        mfaMethod: setupMethod,
        mfaEnabledAt: new Date().toISOString(),
      });
    } catch (err) {
      setError('An error occurred while verifying MFA');
      console.error(err);
    }
  };

  const handleDisableMFA = async () => {
    if (!disableCode) {
      setError('Please enter your verification code');
      return;
    }

    setError(null);
    try {
      const response = await fetch('/api/v1/portal/auth/mfa/disable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('portalAccessToken')}`,
        },
        body: JSON.stringify({ code: disableCode }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Failed to disable MFA');
        return;
      }

      setMFAStatus({
        mfaEnabled: false,
        mfaMethod: null,
        mfaEnabledAt: null,
      });
      setShowDisableModal(false);
      setDisableCode('');
    } catch (err) {
      setError('An error occurred while disabling MFA');
      console.error(err);
    }
  };

  const downloadBackupCodes = () => {
    const text = backupCodes.join('\n');
    const element = document.createElement('a');
    element.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`);
    element.setAttribute('download', 'backup-codes.txt');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  if (loading) {
    return <div className="p-6">Loading security settings...</div>;
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Security Settings</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-xl font-semibold">Two-Factor Authentication</h2>

        {mfaStatus?.mfaEnabled ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="font-semibold text-green-800">✓ MFA is enabled</p>
              <p className="mt-1 text-sm text-green-700">
                Method: {mfaStatus.mfaMethod === 'totp' ? 'Authenticator App' : 'SMS'}
              </p>
              {mfaStatus.mfaEnabledAt && (
                <p className="text-sm text-green-700">
                  Enabled on: {new Date(mfaStatus.mfaEnabledAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <button
              onClick={() => setShowDisableModal(true)}
              className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
            >
              Disable MFA
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-gray-600">
              Protect your account with two-factor authentication. Choose your preferred method:
            </p>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center rounded-lg border p-3 hover:bg-gray-50">
                <input
                  type="radio"
                  name="mfaMethod"
                  value="totp"
                  checked={setupMethod === 'totp'}
                  onChange={(e) => setSetupMethod(e.target.value as 'totp')}
                  className="mr-3"
                />
                <div>
                  <p className="font-semibold">Authenticator App</p>
                  <p className="text-sm text-gray-600">
                    Use Google Authenticator, Authy, or similar
                  </p>
                </div>
              </label>
              <label className="flex cursor-pointer items-center rounded-lg border p-3 hover:bg-gray-50">
                <input
                  type="radio"
                  name="mfaMethod"
                  value="sms"
                  checked={setupMethod === 'sms'}
                  onChange={(e) => setSetupMethod(e.target.value as 'sms')}
                  className="mr-3"
                />
                <div>
                  <p className="font-semibold">SMS</p>
                  <p className="text-sm text-gray-600">Receive codes via text message</p>
                </div>
              </label>
            </div>
            <button
              onClick={() => setShowSetupModal(true)}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Enable {setupMethod === 'totp' ? 'Authenticator App' : 'SMS'} MFA
            </button>
          </div>
        )}
      </div>

      {/* Setup Modal */}
      {showSetupModal && (
        <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold">
              Setup {setupMethod === 'totp' ? 'Authenticator App' : 'SMS'} MFA
            </h3>

            {setupMethod === 'sms' && !tempToken && (
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium">Phone Number</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+1234567890"
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>
            )}

            {!tempToken ? (
              <button
                onClick={handleSetupMFA}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Continue
              </button>
            ) : (
              <div className="space-y-4">
                {qrCode && (
                  <div className="flex justify-center">
                    <img src={qrCode} alt="QR Code" className="h-48 w-48" />
                  </div>
                )}
                <div>
                  <label className="mb-2 block text-sm font-medium">Verification Code</label>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) =>
                      setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    placeholder="000000"
                    maxLength={6}
                    className="w-full rounded-lg border px-3 py-2 text-center text-2xl tracking-widest"
                  />
                </div>
                <button
                  onClick={handleVerifyMFA}
                  className="w-full rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
                >
                  Verify & Enable MFA
                </button>
              </div>
            )}

            <button
              onClick={() => {
                setShowSetupModal(false);
                setQrCode(null);
                setTempToken(null);
                setVerificationCode('');
                setPhoneNumber('');
              }}
              className="mt-2 w-full rounded-lg bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Backup Codes Modal */}
      {showBackupCodes && (
        <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold">Save Your Backup Codes</h3>
            <p className="mb-4 text-sm text-gray-600">
              Save these codes in a safe place. Each code can be used once if you lose access to
              your authenticator.
            </p>
            <div className="mb-4 max-h-48 overflow-y-auto rounded-lg bg-gray-50 p-4">
              {backupCodes.map((code, idx) => (
                <div key={idx} className="py-1 font-mono text-sm">
                  {code}
                </div>
              ))}
            </div>
            <button
              onClick={downloadBackupCodes}
              className="mb-2 w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Download Codes
            </button>
            <button
              onClick={() => {
                setShowBackupCodes(false);
                setShowSetupModal(false);
                fetchMFAStatus();
              }}
              className="w-full rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Disable MFA Modal */}
      {showDisableModal && (
        <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold">Disable Two-Factor Authentication</h3>
            <p className="mb-4 text-sm text-gray-600">
              Enter your verification code to disable MFA. Your account will be less secure.
            </p>
            <input
              type="text"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="mb-4 w-full rounded-lg border px-3 py-2 text-center text-2xl tracking-widest"
            />
            <button
              onClick={handleDisableMFA}
              className="mb-2 w-full rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
            >
              Disable MFA
            </button>
            <button
              onClick={() => {
                setShowDisableModal(false);
                setDisableCode('');
              }}
              className="w-full rounded-lg bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
