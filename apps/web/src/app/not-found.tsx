import Link from "next/link";
import { Button } from "@/components/ui";

export const metadata = {
  title: "Page Not Found",
  description: "The page you are looking for does not exist.",
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-neutral-0 rounded-lg border border-neutral-200 shadow-lg p-6 sm:p-8 text-center space-y-4">
        {/* 404 Icon */}
        <div className="flex justify-center">
          <div className="text-6xl font-bold text-primary-500">404</div>
        </div>

        {/* Page Not Found Title */}
        <h1 className="text-2xl font-bold text-neutral-900">Page Not Found</h1>

        {/* Description */}
        <p className="text-neutral-600">
          The page you are looking for doesn't exist or has been moved.
        </p>

        {/* Illustration/Icon */}
        <div className="text-5xl py-4" aria-hidden="true">
          🔍
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 pt-2">
          <Link href="/" className="w-full">
            <Button variant="primary" size="md" className="w-full">
              Go to Home
            </Button>
          </Link>
          <Link href="/patients" className="w-full">
            <Button variant="secondary" size="md" className="w-full">
              View Patients
            </Button>
          </Link>
        </div>

        {/* Additional Help */}
        <p className="text-xs text-neutral-500 pt-2">
          If you believe this is an error, please contact support.
        </p>
      </div>
    </div>
  );
}
