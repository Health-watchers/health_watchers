import type { Metadata } from 'next';

/**
 * Shared Open Graph metadata for portal pages.
 *
 * Portal pages are client components ('use client'), so they can't export
 * `metadata` directly. Each portal sub-section gets a layout.tsx that exports
 * metadata using this helper, ensuring shared deep links show rich previews.
 */

const SITE_URL = 'https://healthwatchers.com';

interface PortalMetaInput {
  title: string;
  description: string;
  /** Path relative to the portal root, e.g. '/appointments' */
  path: string;
}

export function portalMetadata({ title, description, path }: PortalMetaInput): Metadata {
  const url = `${SITE_URL}/portal${path}`;
  const fullTitle = `${title} | Health Watchers Patient Portal`;

  return {
    title: fullTitle,
    description,
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: 'Health Watchers Patient Portal',
      type: 'website',
      images: [
        {
          url: '/og-portal.png',
          width: 1200,
          height: 630,
          alt: 'Health Watchers Patient Portal',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: ['/og-portal.png'],
    },
  };
}
