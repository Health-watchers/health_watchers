'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface WorkingDay {
  open: string;
  close: string;
  isOpen: boolean;
}
interface ClinicSettings {
  workingHours: Record<string, WorkingDay>;
  appointmentDuration: number;
  timezone: string;
  currency: 'XLM' | 'USDC';
  stellarPublicKey?: string;
  notifications: {
    emailEnabled: boolean;
    smsEnabled: boolean;
    appointmentReminders: boolean;
    reminderHoursBefore: number;
  };
  branding: {
    clinicName: string;
    logoUrl?: string;
    primaryColor?: string;
    address?: string;
    phone?: string;
    taxId?: string;
    headerText?: string;
    footerText?: string;
    signatureName?: string;
    signatureTitle?: string;
  };
}

async function fetchSettings(): Promise<ClinicSettings> {
  const res = await fetch(`${API}/api/v1/settings`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load settings');
  const body = await res.json();
  return body.data;
}

async function saveSettings(data: Partial<ClinicSettings>): Promise<ClinicSettings> {
  const res = await fetch(`${API}/api/v1/settings`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? 'Failed to save settings');
  }
  return (await res.json()).data;
}

export default function ClinicSettingsClient() {
  const t = useTranslations('settings');
  const qc = useQueryClient();
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['clinicSettings'],
    queryFn: fetchSettings,
  });

  const [uploadingLogo, setUploadingLogo] = useState(false);

  const uploadLogo = async (file: File) => {
    const formData = new FormData();
    formData.append('logo', file);
    setUploadingLogo(true);
    try {
      const res = await fetch(`${API}/api/v1/settings/logo`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to upload logo');
      }
      const body = await res.json();
      const settings = body.data as ClinicSettings;
      update({ branding: { ...merged.branding, logoUrl: settings.branding.logoUrl } });
      qc.invalidateQueries({ queryKey: ['clinicSettings'] });
      setToast({ msg: t('saved'), ok: true });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      setToast({ msg: err.message || t('error'), ok: false });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setUploadingLogo(false);
    }
  };

  const mutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinicSettings'] });
      setToast({ msg: t('saved'), ok: true });
      setTimeout(() => setToast(null), 3000);
    },
    onError: (e: Error) => {
      setToast({ msg: e.message || t('error'), ok: false });
      setTimeout(() => setToast(null), 4000);
    },
  });

  const [form, setForm] = useState<Partial<ClinicSettings>>({});

  // Merge server data with local edits
  const merged: ClinicSettings | null = data ? { ...data, ...form } : null;

  const update = (patch: Partial<ClinicSettings>) => setForm((f) => ({ ...f, ...patch }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  if (isLoading) return <p style={{ padding: '2rem' }}>{t('loading')}</p>;
  if (error || !merged) return <p style={{ padding: '2rem', color: '#ef4444' }}>{String(error)}</p>;

  return (
    <main
      id="main-content"
      style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'sans-serif' }}
    >
      <h1 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: 700 }}>{t('title')}</h1>

      {toast && (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 6,
            marginBottom: '1rem',
            background: toast.ok ? '#dcfce7' : '#fee2e2',
            color: toast.ok ? '#166534' : '#991b1b',
          }}
        >
          {toast.msg}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* ── Branding ── */}
        <section style={sectionStyle}>
          <h2 style={sectionTitle}>{t('branding')}</h2>
          <label style={labelStyle}>
            {t('clinicName')}
            <input
              style={inputStyle}
              type="text"
              value={merged.branding.clinicName}
              onChange={(e) =>
                update({ branding: { ...merged.branding, clinicName: e.target.value } })
              }
            />
          </label>
          <label style={labelStyle}>
            {t('logoUrl')}
            <input
              style={inputStyle}
              type="url"
              value={merged.branding.logoUrl ?? ''}
              onChange={(e) =>
                update({ branding: { ...merged.branding, logoUrl: e.target.value } })
              }
            />
          </label>
          <label style={labelStyle}>
            {t('uploadLogo')}
            <input
              style={inputStyle}
              type="file"
              accept="image/png,image/jpeg"
              disabled={uploadingLogo}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadLogo(file);
              }}
            />
            {uploadingLogo && <small style={{ color: '#6b7280' }}>Uploading logo...</small>}
          </label>
          <label style={labelStyle}>
            {t('primaryColor')}
            <input
              style={{ ...inputStyle, width: 80 }}
              type="color"
              value={merged.branding.primaryColor ?? '#2563eb'}
              onChange={(e) =>
                update({ branding: { ...merged.branding, primaryColor: e.target.value } })
              }
            />
          </label>
          <label style={labelStyle}>
            {t('invoiceAddress')}
            <input
              style={inputStyle}
              type="text"
              value={merged.branding.address ?? ''}
              onChange={(e) =>
                update({ branding: { ...merged.branding, address: e.target.value } })
              }
            />
          </label>
          <label style={labelStyle}>
            {t('invoicePhone')}
            <input
              style={inputStyle}
              type="tel"
              value={merged.branding.phone ?? ''}
              onChange={(e) =>
                update({ branding: { ...merged.branding, phone: e.target.value } })
              }
            />
          </label>
          <label style={labelStyle}>
            {t('taxId')}
            <input
              style={inputStyle}
              type="text"
              value={merged.branding.taxId ?? ''}
              onChange={(e) =>
                update({ branding: { ...merged.branding, taxId: e.target.value } })
              }
            />
          </label>
          <label style={labelStyle}>
            {t('invoiceHeader')}
            <input
              style={inputStyle}
              type="text"
              value={merged.branding.headerText ?? ''}
              onChange={(e) =>
                update({ branding: { ...merged.branding, headerText: e.target.value } })
              }
            />
          </label>
          <label style={labelStyle}>
            {t('invoiceFooter')}
            <input
              style={inputStyle}
              type="text"
              value={merged.branding.footerText ?? ''}
              onChange={(e) =>
                update({ branding: { ...merged.branding, footerText: e.target.value } })
              }
            />
          </label>
          <label style={labelStyle}>
            {t('invoiceSignatureName')}
            <input
              style={inputStyle}
              type="text"
              value={merged.branding.signatureName ?? ''}
              onChange={(e) =>
                update({ branding: { ...merged.branding, signatureName: e.target.value } })
              }
            />
          </label>
          <label style={labelStyle}>
            {t('invoiceSignatureTitle')}
            <input
              style={inputStyle}
              type="text"
              value={merged.branding.signatureTitle ?? ''}
              onChange={(e) =>
                update({ branding: { ...merged.branding, signatureTitle: e.target.value } })
              }
            />
          </label>
        </section>

        {/* ── Appointment Defaults ── */}
        <section style={sectionStyle}>
          <h2 style={sectionTitle}>{t('appointmentDefaults')}</h2>
          <label style={labelStyle}>
            {t('defaultDuration')}
            <input
              style={{ ...inputStyle, width: 100 }}
              type="number"
              min={5}
              max={240}
              step={5}
              value={merged.appointmentDuration}
              onChange={(e) => update({ appointmentDuration: Number(e.target.value) })}
            />
          </label>
          <label style={labelStyle}>
            {t('timezone')}
            <input
              style={inputStyle}
              type="text"
              value={merged.timezone}
              placeholder="e.g. Africa/Lagos"
              onChange={(e) => update({ timezone: e.target.value })}
            />
          </label>
          <label style={labelStyle}>
            {t('currency')}
            <select
              style={inputStyle}
              value={merged.currency}
              onChange={(e) => update({ currency: e.target.value as 'XLM' | 'USDC' })}
            >
              <option value="XLM">XLM</option>
              <option value="USDC">USDC</option>
            </select>
          </label>
        </section>

        {/* ── Working Hours ── */}
        <section style={sectionStyle}>
          <h2 style={sectionTitle}>{t('workingHours')}</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr>
                <th style={thStyle}>Day</th>
                <th style={thStyle}>{t('isOpen')}</th>
                <th style={thStyle}>{t('open')}</th>
                <th style={thStyle}>{t('close')}</th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day) => {
                const d: WorkingDay = merged.workingHours[day] ?? {
                  open: '08:00',
                  close: '17:00',
                  isOpen: false,
                };
                return (
                  <tr key={day}>
                    <td style={tdStyle}>{day.charAt(0).toUpperCase() + day.slice(1)}</td>
                    <td style={tdStyle}>
                      <input
                        type="checkbox"
                        checked={d.isOpen}
                        onChange={(e) =>
                          update({
                            workingHours: {
                              ...merged.workingHours,
                              [day]: { ...d, isOpen: e.target.checked },
                            },
                          })
                        }
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="time"
                        value={d.open}
                        disabled={!d.isOpen}
                        style={{ ...inputStyle, width: 110, opacity: d.isOpen ? 1 : 0.4 }}
                        onChange={(e) =>
                          update({
                            workingHours: {
                              ...merged.workingHours,
                              [day]: { ...d, open: e.target.value },
                            },
                          })
                        }
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="time"
                        value={d.close}
                        disabled={!d.isOpen}
                        style={{ ...inputStyle, width: 110, opacity: d.isOpen ? 1 : 0.4 }}
                        onChange={(e) =>
                          update({
                            workingHours: {
                              ...merged.workingHours,
                              [day]: { ...d, close: e.target.value },
                            },
                          })
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* ── Notifications ── */}
        <section style={sectionStyle}>
          <h2 style={sectionTitle}>{t('notifications')}</h2>
          {(
            [
              ['emailEnabled', t('emailEnabled')],
              ['smsEnabled', t('smsEnabled')],
              ['appointmentReminders', t('appointmentReminders')],
            ] as [keyof typeof merged.notifications, string][]
          ).map(([key, label]) => (
            <label
              key={key}
              style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}
            >
              <input
                type="checkbox"
                checked={merged.notifications[key] as boolean}
                onChange={(e) =>
                  update({ notifications: { ...merged.notifications, [key]: e.target.checked } })
                }
              />
              {label}
            </label>
          ))}
          <label style={labelStyle}>
            {t('reminderHoursBefore')}
            <input
              style={{ ...inputStyle, width: 80 }}
              type="number"
              min={1}
              max={168}
              value={merged.notifications.reminderHoursBefore}
              onChange={(e) =>
                update({
                  notifications: {
                    ...merged.notifications,
                    reminderHoursBefore: Number(e.target.value),
                  },
                })
              }
            />
          </label>
        </section>

        <button
          type="submit"
          disabled={mutation.isPending}
          style={{
            padding: '0.6rem 1.5rem',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: mutation.isPending ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem',
            opacity: mutation.isPending ? 0.7 : 1,
          }}
        >
          {mutation.isPending ? t('saving') : t('save')}
        </button>
      </form>
    </main>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const sectionStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: '1.25rem',
  marginBottom: '1.25rem',
};
const sectionTitle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 600,
  marginBottom: '0.75rem',
  color: '#111827',
};
const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  fontSize: '0.875rem',
  color: '#374151',
  marginBottom: '0.75rem',
};
const inputStyle: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  fontSize: '0.875rem',
  width: '100%',
  boxSizing: 'border-box',
};
const thStyle: React.CSSProperties = {
  padding: '0.4rem 0.5rem',
  textAlign: 'left',
  background: '#f9fafb',
  borderBottom: '1px solid #e5e7eb',
  fontWeight: 600,
};
const tdStyle: React.CSSProperties = {
  padding: '0.4rem 0.5rem',
  borderBottom: '1px solid #f3f4f6',
};
