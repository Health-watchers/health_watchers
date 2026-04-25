import { Button } from '@/components/ui';
import Link from 'next/link';

export default function PatientNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-lg text-center">
        <div className="flex justify-center text-5xl" aria-hidden="true">
          🔍
        </div>
        <h1 className="text-xl font-bold text-neutral-900">Patient Not Found</h1>
        <p className="text-sm text-neutral-600">
          The patient you're looking for doesn't exist or has been removed.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <Link href="/patients" className="w-full">
            <Button variant="primary" size="md" className="w-full">
              Back to Patients
            </Button>
          </Link>
          <Link href="/" className="w-full">
            <Button variant="secondary" size="md" className="w-full">
              Go Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
