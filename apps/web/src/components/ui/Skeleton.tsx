export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-700 ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ className = '' }: { className?: string }) {
  return <Skeleton className={`h-4 w-full ${className}`} />;
}

export function SkeletonAvatar({ className = '' }: { className?: string }) {
  return <Skeleton className={`h-10 w-10 rounded-full ${className}`} />;
}

export function SkeletonButton({ className = '' }: { className?: string }) {
  return <Skeleton className={`h-9 w-24 rounded-md ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

export function SkeletonTable() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}