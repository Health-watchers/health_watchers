import Link from 'next/link';

export default function CDSRulesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/settings" className="text-sm text-primary-600 hover:text-primary-700">
          ← Back to Settings
        </Link>
      </div>
      {children}
    </div>
  );
}
