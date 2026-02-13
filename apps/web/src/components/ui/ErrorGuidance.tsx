'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Info, type LucideIcon, RefreshCw, X } from 'lucide-react';
import { fadeIn, reducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Button } from './button';

type ErrorGuidanceVariant = 'destructive' | 'warning' | 'info';

const variantStyles: Record<
  ErrorGuidanceVariant,
  { border: string; bg: string; text: string; textMuted: string }
> = {
  destructive: {
    border: 'border-destructive/30',
    bg: 'bg-destructive/5',
    text: 'text-destructive',
    textMuted: 'text-destructive/80',
  },
  warning: {
    border: 'border-yellow-500/30',
    bg: 'bg-yellow-500/5',
    text: 'text-[var(--status-warning)]',
    textMuted: 'text-[var(--status-warning)]/80',
  },
  info: {
    border: 'border-blue-500/30',
    bg: 'bg-blue-500/5',
    text: 'text-[var(--status-info)]',
    textMuted: 'text-[var(--status-info)]/80',
  },
};

const defaultIcons: Record<ErrorGuidanceVariant, LucideIcon> = {
  destructive: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
};

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
  /** Custom icon (defaults based on variant) */
  icon?: LucideIcon;
  /** Visual variant: destructive (default), warning, info */
  variant?: ErrorGuidanceVariant;
  /** Optional dismiss callback — shows a close button */
  onDismiss?: () => void;
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
  icon,
  variant = 'destructive',
  onDismiss,
}: ErrorGuidanceProps) {
  const styles = variantStyles[variant];
  const IconComponent = icon ?? defaultIcons[variant];
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion ? reducedMotion.fadeIn : fadeIn;

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      data-slot="error-guidance"
      className={cn(
        'w-full rounded-lg border p-[var(--space-group)]',
        styles.border,
        styles.bg,
        className
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
          <IconComponent className={cn('h-5 w-5', styles.text)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className={cn('text-sm font-semibold', styles.text)}>{title}</h4>
          <p className={cn('mt-1 text-sm', styles.textMuted)}>{description}</p>
        </div>

        {/* Retry Button */}
        {retryAction && (
          <Button
            variant="outline"
            size="sm"
            onClick={retryAction}
            className={cn(
              'flex-shrink-0 gap-1.5',
              styles.border,
              styles.text,
              `hover:${styles.bg}`,
              `hover:${styles.text}`
            )}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {retryLabel}
          </Button>
        )}

        {/* Dismiss Button */}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={cn(
              'flex-shrink-0 rounded-sm p-0.5 opacity-70 hover:opacity-100 transition-opacity',
              styles.text
            )}
          >
            <X className="h-4 w-4" />
          </button>
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
