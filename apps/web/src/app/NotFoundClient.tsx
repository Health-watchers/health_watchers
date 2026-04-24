'use client';

import Link from 'next/link';

export default function NotFoundClient() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-4xl font-bold text-neutral-800">404</h1>
      <p className="text-neutral-500">The page you are looking for does not exist.</p>
      <Link href="/" className="text-primary-600 hover:underline">
        Go back home
      </Link>
    </div>
  );
}
