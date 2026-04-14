'use client';

import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { useReducedMotion } from '@/hooks/shared/useReducedMotion';
import { fadeIn, reducedMotion } from '@/utils/motion';
import { cn } from '@/utils/cn';
import { Button } from './button';

interface EmptyStateProps {
  /** Icon to display (from lucide-react) */
  icon: LucideIcon;
  /** Main heading */
  title: string;
  /** Description text */
  description: string;
  /** Primary action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Secondary action button */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Help link for external documentation */
  helpLink?: {
    label: string;
    href: string;
  };
  /** Custom illustration to replace the default icon + backdrop */
  customIcon?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/**
 * EmptyState - A polished empty state component with animations
 * Use this when a section has no content to display
 *
 * @example
 * <EmptyState
 *   icon={MessageSquare}
 *   title="No conversations yet"
 *   description="Start a new conversation to see it appear here."
 *   action={{ label: "New Conversation", onClick: () => {} }}
 * />
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  helpLink,
  customIcon,
  className,
}: EmptyStateProps) {
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion ? reducedMotion.fadeIn : fadeIn;

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      className={cn('flex flex-col items-center justify-center py-12 px-4 text-center', className)}
    >
      {/* Custom illustration or default icon */}
      {customIcon ? (
        <div className="mb-[var(--space-group)]">{customIcon}</div>
      ) : (
        <div className="relative mb-[var(--space-group)]">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 blur-xl" />
          <div
            className={cn(
              'relative flex h-16 w-16 items-center justify-center rounded-2xl',
              'bg-gradient-to-br from-muted to-muted/50',
              'ring-1 ring-border/50'
            )}
          >
            <Icon className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>
      )}

      {/* Title */}
      <h3 className="mb-[var(--space-item)] text-lg font-semibold text-foreground">{title}</h3>

      {/* Description */}
      <p className="mb-6 max-w-sm text-sm text-muted-foreground">{description}</p>

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action && <Button onClick={action.onClick}>{action.label}</Button>}
          {secondaryAction && (
            <Button variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}

      {/* Help Link */}
      {helpLink && (
        <a
          href={helpLink.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 text-sm text-primary hover:underline"
        >
          {helpLink.label}
        </a>
      )}
    </motion.div>
  );
}

/**
 * Smaller inline empty state for compact areas
 */
export function EmptyStateInline({
  icon: Icon,
  message,
  action,
  className,
}: {
  icon: LucideIcon;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-3 py-6 px-4',
        'text-muted-foreground',
        className
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="text-sm">{message}</span>
      {action && (
        <Button variant="ghost" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
