'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { fadeIn } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface ErrorGuidanceProps {
  /** Error title/heading */
  title: string;
  /** Detailed description with guidance */
  description: string;
  /** Optional retry action */
  retryAction?: () => void;
  /** Optional retry button label (defaults to "Retry") */
  retryLabel?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * ErrorGuidance - A full-width error banner with actionable guidance
 * Use this when an operation fails and the user needs clear direction
 *
 * @example
 * <ErrorGuidance
 *   title="Could not find turn hash"
 *   description="The source conversation may have been modified. Try refreshing or reconnecting the source."
 *   retryAction={() => handleRetry()}
 * />
 */
export function ErrorGuidance({
  title,
  description,
  retryAction,
  retryLabel = 'Retry',
  className,
}: ErrorGuidanceProps) {
  return (
    <motion.div
      variants={fadeIn}
      initial="initial"
      animate="animate"
      data-slot="error-guidance"
      className={cn(
        'w-full rounded-lg border border-destructive/30 bg-destructive/5 p-4',
        className
      )}
    >
      <div className="flex items-start gap-3">
        {/* Warning Icon */}
        <div className="flex-shrink-0 mt-0.5">
          <AlertTriangle className="h-5 w-5 text-destructive" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-destructive">{title}</h4>
          <p className="mt-1 text-sm text-destructive/80">{description}</p>
        </div>

        {/* Retry Button */}
        {retryAction && (
          <Button
            variant="outline"
            size="sm"
            onClick={retryAction}
            className="flex-shrink-0 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {retryLabel}
          </Button>
        )}
      </div>
    </motion.div>
  );
}

/**
 * ErrorGuidanceInline - A compact inline error for smaller areas
 */
export function ErrorGuidanceInline({
  message,
  retryAction,
  className,
}: {
  message: string;
  retryAction?: () => void;
  className?: string;
}) {
  return (
    <div
      data-slot="error-guidance-inline"
      className={cn(
        'flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive',
        className
      )}
    >
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1">{message}</span>
      {retryAction && (
        <button
          type="button"
          onClick={retryAction}
          className="flex-shrink-0 text-xs font-medium hover:underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}
