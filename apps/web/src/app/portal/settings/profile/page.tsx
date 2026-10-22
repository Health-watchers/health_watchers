'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Button, Input, Textarea, Toast, PageWrapper } from '@/components/ui';
import { useTranslations } from 'next-intl';
import { locales, type Locale } from '../../../../../i18n.config';

interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  bio?: string;
  avatar?: string;
  preferredLanguage?: Locale;
}

export default function ProfileSettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('portal.profile');
  const tLang = useTranslations('language');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [formData, setFormData] = useState<ProfileData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    bio: '',
    preferredLanguage: undefined,
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await fetch('/api/v1/profile', {
        headers: { Authorization: `Bearer ${localStorage.getItem('portalAccessToken')}` },
      });
      if (response.ok) {
        const data = await response.json();
        setFormData(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      setError(t('loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLanguageChange = async (locale: Locale) => {
    setFormData((prev) => ({ ...prev, preferredLanguage: locale }));
    // Persist the locale immediately so the UI updates on save
    await fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    }).catch(() => {});
    document.cookie = `locale=${locale};path=/;max-age=31536000;samesite=lax`;
    startTransition(() => router.refresh());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/v1/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('portalAccessToken')}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || t('error'));
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(t('error'));
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageWrapper>
        <div className="p-6">{t('loadError')}</div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="mb-6 text-3xl font-bold">{t('title')}</h1>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {success && <Toast type="success" message={t('success')} />}

        <form onSubmit={handleSubmit} className="rounded-lg bg-white p-6 shadow">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                {t('firstName')}
              </label>
              <Input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                placeholder={t('firstName')}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                {t('lastName')}
              </label>
              <Input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                placeholder={t('lastName')}
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                {t('email')}
              </label>
              <Input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder={t('email')}
                disabled
                className="bg-gray-100"
              />
              <p className="mt-1 text-xs text-gray-500">{t('emailNote')}</p>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                {t('phone')}
              </label>
              <Input
                type="tel"
                name="phone"
                value={formData.phone || ''}
                onChange={handleChange}
                placeholder="+1 (555) 123-4567"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                {t('bio')}
              </label>
              <Textarea
                name="bio"
                value={formData.bio || ''}
                onChange={handleChange}
                placeholder={t('bioPlaceholder')}
                rows={4}
              />
            </div>

            {/* Language preference — mirrors the header LanguageSwitcher but persists to profile */}
            <div className="md:col-span-2">
              <label
                htmlFor="profile-language"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                {t('preferredLanguage')}
              </label>
              <select
                id="profile-language"
                value={formData.preferredLanguage ?? ''}
                disabled={isPending}
                onChange={(e) => handleLanguageChange(e.target.value as Locale)}
                className="focus-visible:ring-primary-500 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus-visible:ring-2 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="" disabled>
                  — {tLang('label')} —
                </option>
                {locales.map((loc) => (
                  <option key={loc} value={loc}>
                    {tLang(loc)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <Button type="submit" disabled={saving || isPending}>
              {saving ? t('saving') : t('save')}
            </Button>
            <Button variant="secondary" onClick={() => router.back()}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      </div>
    </PageWrapper>
  );
}
