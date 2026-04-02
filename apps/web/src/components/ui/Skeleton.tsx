import type { HTMLAttributes } from "react";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Convenience shorthand for rounded-full (e.g. avatar skeletons) */
  circle?: boolean;
}

export function Skeleton({ circle, className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={[
        "animate-pulse bg-neutral-200",
        circle ? "rounded-full" : "rounded-md",
        className ?? "",
      ].join(" ")}
      {...props}
    />
  );
}

/**
 * Table skeleton loader showing 5 rows with columns
 */
export function TableSkeleton({
  columns = 6,
  rows = 5,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-neutral-200">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 border-b border-neutral-200">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-3">
                <Skeleton className="h-4 w-full" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-neutral-50 transition-colors">
              {Array.from({ length: columns }).map((_, colIdx) => (
                <td key={colIdx} className="px-4 py-3">
                  <Skeleton className="h-4 w-full" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Card skeleton loader (e.g., for stat cards or info cards)
 */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={[
        "bg-neutral-0 rounded-lg border border-neutral-200 shadow-sm p-6",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex items-center gap-4">
        <Skeleton circle className="h-12 w-12 shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      </div>
    </div>
  );
}

/**
 * Detail page skeleton showing header and content sections
 */
export function DetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="bg-neutral-0 rounded-lg border border-neutral-200 shadow-sm p-6 space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-5 w-3/4" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        </div>
      </div>

      {/* Section 1 */}
      <div className="bg-neutral-0 rounded-lg border border-neutral-200 shadow-sm p-6 space-y-4">
        <Skeleton className="h-6 w-1/4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-5 w-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Section 2 */}
      <div className="bg-neutral-0 rounded-lg border border-neutral-200 shadow-sm p-6 space-y-4">
        <Skeleton className="h-6 w-1/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}
