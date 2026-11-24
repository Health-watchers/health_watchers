import { Skeleton } from '@/components/ui/Skeleton';

export default function AppointmentsLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Week navigation skeleton */}
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Calendar grid skeleton */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
            <Skeleton className="h-6 w-20" />
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
