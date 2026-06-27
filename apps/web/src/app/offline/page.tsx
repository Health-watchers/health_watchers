import { WifiOff } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <WifiOff className="mx-auto mb-4 h-16 w-16 text-gray-400" />
        <h1 className="mb-2 text-2xl font-bold text-gray-900">You're Offline</h1>
        <p className="mb-6 text-gray-600">Please check your internet connection and try again.</p>
        <button
          onClick={() => window.location.reload()}
          className="min-h-[44px] min-w-[44px] rounded-lg bg-blue-600 px-6 py-3 text-white transition-colors hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
