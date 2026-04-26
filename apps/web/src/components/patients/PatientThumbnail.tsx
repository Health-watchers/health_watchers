'use client';

import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { API_V1 } from '@/lib/api';

interface Props {
  patientId: string;
  firstName: string;
  lastName: string;
  /** Storage key — present when patient has a photo */
  thumbnailUrl?: string | null;
  size?: 'sm' | 'md';
}

/**
 * Renders a patient thumbnail by fetching a pre-signed URL from the photo endpoint.
 * Falls back to initials avatar when no photo is set.
 */
export default function PatientThumbnail({
  patientId,
  firstName,
  lastName,
  thumbnailUrl,
  size = 'sm',
}: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!thumbnailUrl) return;
    let cancelled = false;
    fetch(`${API_V1}/patients/${patientId}/photo`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.data?.url) setSrc(data.data.url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [patientId, thumbnailUrl]);

  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();

  return (
    <Avatar
      src={src ?? undefined}
      initials={initials}
      alt={`${firstName} ${lastName}`}
      size={size}
    />
  );
}
