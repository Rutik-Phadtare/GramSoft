export default function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-md bg-ink/[0.06] ${className}`} />;
}

export function SkeletonRows({ rows = 4, className = "" }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}
