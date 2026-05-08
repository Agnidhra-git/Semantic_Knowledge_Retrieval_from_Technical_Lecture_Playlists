function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${className}`} />;
}

export default function PlaylistLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
      {/* Top bar skeleton */}
      <div className="flex items-center gap-4 mb-6">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-9 w-48 ml-auto" />
      </div>

      {/* Two-column skeleton */}
      <div className="flex gap-6">
        <div className="flex-1 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex gap-4 p-4 bg-white rounded-xl border border-slate-200 animate-pulse"
            >
              <Skeleton className="h-4 w-6" />
              <Skeleton className="h-16 w-28 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden lg:block w-80">
          <Skeleton className="h-8 w-32 mb-4" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full mb-3 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
