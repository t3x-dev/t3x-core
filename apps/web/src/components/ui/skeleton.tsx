import { cn } from '@/lib/utils';

/**
 * Skeleton component for loading states
 * Provides a shimmer animation to indicate loading content
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'animate-pulse rounded-md bg-muted',
        className
      )}
      {...props}
    />
  );
}

/**
 * Skeleton with shimmer effect (more premium feel)
 */
function SkeletonShimmer({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton-shimmer"
      className={cn(
        'relative overflow-hidden rounded-md bg-muted',
        'before:absolute before:inset-0',
        'before:-translate-x-full',
        'before:animate-[shimmer_2s_infinite]',
        'before:bg-gradient-to-r',
        'before:from-transparent before:via-white/10 before:to-transparent',
        className
      )}
      {...props}
    />
  );
}

/**
 * Skeleton text line - for text content placeholders
 */
function SkeletonText({
  className,
  lines = 1,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { lines?: number }) {
  return (
    <div className={cn('space-y-2', className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: simple iteration
          key={i}
          className={cn(
            'h-4',
            // Last line is shorter for more natural look
            i === lines - 1 && lines > 1 && 'w-3/4'
          )}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton circle - for avatars, icons
 */
function SkeletonCircle({
  className,
  size = 'md',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = {
    sm: 'size-6',
    md: 'size-10',
    lg: 'size-14',
  };

  return (
    <Skeleton
      className={cn('rounded-full', sizeClasses[size], className)}
      {...props}
    />
  );
}

/**
 * Skeleton card - for card content placeholders
 */
function SkeletonCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-4 space-y-3',
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-3">
        <SkeletonCircle size="md" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  );
}

export { Skeleton, SkeletonShimmer, SkeletonText, SkeletonCircle, SkeletonCard };
