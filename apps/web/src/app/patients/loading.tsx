import { SkeletonTable } from '@/components/ui/Skeleton';

export default function PatientsLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-40 animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-700" />
          <div className="h-4 w-64 animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-700" />
        </div>
        <div className="h-10 w-32 animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-700" />
      </div>

      {/* Search and filters skeleton */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="h-10 flex-1 animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-700" />
        <div className="h-10 w-full animate-pulse rounded-md bg-neutral-200 sm:w-40 dark:bg-neutral-700" />
      </div>

      {/* Table skeleton */}
      <SkeletonTable />
    </div>
  );
}
