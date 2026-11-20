import { Skeleton } from "@/components/ui/skeleton";

export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="rounded-xl border border-border bg-card p-5 space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <Skeleton className="h-5 w-48" />
      {Array.from({ length: rows }).map((_, idx) => (
        <Skeleton key={idx} className="h-10 w-full" />
      ))}
    </div>
  );
}

