'use client';

import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

// IANA timezone list sourced from Intl.supportedValuesOf at build-time via a common subset.
// Full validation happens server-side; this list covers the most-used zones for clinics.
const COMMON_TIMEZONES = [
  'UTC',
  'Africa/Abidjan',
  'Africa/Accra',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Kano',
  'Africa/Lagos',
  'Africa/Nairobi',
  'America/Chicago',
  'America/Los_Angeles',
  'America/New_York',
  'America/Sao_Paulo',
  'America/Toronto',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/London',
  'Europe/Paris',
  'Pacific/Auckland',
];

const profileSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(100),
  timezone: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export interface UserProfile {
  fullName: string;
  email: string;
  role: string;
  clinic: string;
  avatarUrl?: string | null;
  timezone?: string | null;
}

export interface ProfileSectionProps {
  user: UserProfile;
}

const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB (matches API)
const AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp';

export function ProfileSection({ user }: ProfileSectionProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatarUrl ?? null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting },
    reset,
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: user.fullName,
      timezone: user.timezone ?? '',
    },
  });

  // ── Avatar upload ──────────────────────────────────────────────────────────

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > AVATAR_MAX_BYTES) {
      setErrorMessage('Avatar must be under 5 MB.');
      return;
    }

    // Optimistic preview
    const objectUrl = URL.createObjectURL(file);
    setAvatarPreview(objectUrl);
    setAvatarUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const form = new FormData();
      form.append('avatar', file);
      const res = await fetch('/api/settings/avatar', { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? 'Failed to upload avatar');
      }
      const { data } = await res.json();
      setAvatarPreview(data.avatarUrl);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      setSuccessMessage('Avatar updated');
    } catch (err) {
      setAvatarPreview(user.avatarUrl ?? null);
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setAvatarUploading(false);
      URL.revokeObjectURL(objectUrl);
      // Reset file input so selecting the same file again triggers onChange
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch('/api/settings/avatar', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove avatar');
      setAvatarPreview(null);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      setSuccessMessage('Avatar removed');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setAvatarUploading(false);
    }
  };

  // ── Profile form submit ────────────────────────────────────────────────────

  const onSubmit = async (data: ProfileFormData) => {
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const payload: Record<string, string> = { fullName: data.fullName };
      if (data.timezone) payload.timezone = data.timezone;

      const res = await fetch('/api/settings/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? 'Failed to update profile');
      }

      await queryClient.invalidateQueries({ queryKey: ['me'] });
      reset({ fullName: data.fullName, timezone: data.timezone ?? '' });
      setSuccessMessage('Profile updated successfully');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
    }
  };

  // ── Initials fallback for avatar ───────────────────────────────────────────
  const initials = user.fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Profile</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Update your display name, avatar, and timezone.
        </p>
      </div>

      {/* ── Avatar ── */}
      <div className="flex items-center gap-4">
        <div
          className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100 ring-2 ring-primary-200 dark:bg-primary-900 dark:ring-primary-700"
          aria-label="Profile photo"
        >
          {avatarPreview ? (
            <Image
              src={avatarPreview}
              alt={`${user.fullName} avatar`}
              fill
              sizes="80px"
              className="object-cover"
              unoptimized={avatarPreview.startsWith('blob:')}
            />
          ) : (
            <span className="text-2xl font-semibold text-primary-600 dark:text-primary-300">
              {initials}
            </span>
          )}
          {avatarUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <svg
                className="h-6 w-6 animate-spin text-white"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            id="avatar-upload"
            type="file"
            accept={AVATAR_ACCEPT}
            className="sr-only"
            aria-label="Upload profile photo"
            onChange={handleAvatarChange}
            disabled={avatarUploading}
          />
          <label
            htmlFor="avatar-upload"
            className={[
              'cursor-pointer rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700',
              'hover:bg-neutral-50 focus-within:ring-2 focus-within:ring-primary-500',
              'dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-700',
              avatarUploading ? 'pointer-events-none opacity-50' : '',
            ].join(' ')}
          >
            {avatarPreview ? 'Change photo' : 'Upload photo'}
          </label>
          {avatarPreview && (
            <button
              type="button"
              onClick={handleRemoveAvatar}
              disabled={avatarUploading}
              className="text-danger-600 hover:text-danger-700 text-sm disabled:opacity-50"
            >
              Remove photo
            </button>
          )}
          <p className="text-xs text-neutral-400">PNG, JPEG, or WebP — max 5 MB</p>
        </div>
      </div>

      {/* ── Profile form ── */}
      <form onSubmit={handleSubmit(onSubmit)} className="max-w-md space-y-4">
        <Input
          label="Full Name"
          {...register('fullName')}
          error={errors.fullName?.message}
          disabled={isSubmitting}
          data-testid="profile-fullname"
        />

        {/* Timezone selector */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="timezone-select"
            className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Timezone
          </label>
          <select
            id="timezone-select"
            {...register('timezone')}
            disabled={isSubmitting}
            data-testid="profile-timezone"
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
          >
            <option value="">— Select timezone —</option>
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <p className="text-xs text-neutral-400">
            Controls how dates and times are displayed to you.
          </p>
        </div>

        {/* Read-only fields */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Email
          </label>
          <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
            {user.email}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Role
          </label>
          <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
            {user.role}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Clinic
          </label>
          <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
            {user.clinic}
          </p>
        </div>

        {successMessage && (
          <p className="text-sm text-green-600 dark:text-green-400" role="status">
            {successMessage}
          </p>
        )}
        {errorMessage && (
          <p className="text-danger-500 text-sm" role="alert">
            {errorMessage}
          </p>
        )}

        {isDirty && (
          <Button
            type="submit"
            loading={isSubmitting}
            disabled={isSubmitting}
            data-testid="profile-save"
          >
            Save Changes
          </Button>
        )}
      </form>
    </div>
  );
}
