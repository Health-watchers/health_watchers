import { SkeletonTable } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <div className="h-8 w-1/3 animate-pulse rounded-md bg-neutral-200" />
        <div className="h-4 w-1/2 animate-pulse rounded-md bg-neutral-200" />
      </div>
      <SkeletonTable />
    </div>
  );
}
