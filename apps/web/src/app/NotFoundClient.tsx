'use client';

import Link from 'next/link';

export default function NotFoundClient() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
      <h1 className="text-4xl font-bold text-neutral-800">404</h1>
      <p className="text-neutral-500">The page you are looking for does not exist.</p>
      <Link href="/" className="text-primary-600 hover:underline">
        Go back home
      </Link>
    </div>
  );
}
