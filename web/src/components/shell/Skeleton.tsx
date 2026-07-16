import React from "react";

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
}
export function Skeleton({ className = "", width, height }: SkeletonProps) {
  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === "number" ? `${width}px` : width;
  if (height) style.height = typeof height === "number" ? `${height}px` : height;
  return <div className={`studio-skeleton ${className}`} style={style} />;
}

export function SkeletonGrid({ count = 8, columns = 4 }: { count?: number; columns?: number }) {
  return (
    <div className={`grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-${columns}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="studio-card overflow-hidden">
          <Skeleton className="aspect-square w-full" />
          <div className="p-3 space-y-2">
            <Skeleton height={10} width="60%" />
            <Skeleton height={8} width="40%" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="studio-card p-3 flex items-center gap-3">
          <Skeleton width={36} height={36} className="rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton height={10} width="50%" />
            <Skeleton height={8} width="30%" />
          </div>
        </div>
      ))}
    </div>
  );
}
