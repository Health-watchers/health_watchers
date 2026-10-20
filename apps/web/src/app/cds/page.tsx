import CDSRecommendationsClient from './CDSRecommendationsClient';

export const metadata = { title: 'Clinical Decision Support' };

export default function CDSPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Clinical Decision Support
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Evidence-based recommendations for your patients.
          </p>
          <div className="mt-6">
            <CDSRecommendationsClient />
          </div>
        </div>
      </div>
    </div>
  );
}