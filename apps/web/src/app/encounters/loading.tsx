import { SkeletonTable } from '@/components/ui/Skeleton';

export default function EncountersLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header skeleton */}
      <div className="space-y-3">
        <div className="h-8 w-48 animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-700" />
        <div className="h-4 w-96 animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-700" />
      </div>

      {/* Filter bar skeleton */}
      <div className="flex flex-wrap gap-3">
        <div className="h-10 w-64 animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-700" />
        <div className="h-10 w-40 animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-700" />
        <div className="h-10 w-32 animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-700" />
      </div>

      {/* Table skeleton */}
      <SkeletonTable />
    </div>
  );
}
