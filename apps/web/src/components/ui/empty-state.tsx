'use client';

import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { fadeIn, scaleIn } from '@/lib/motion';
import { cn } from '@/lib/utils';
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
  className,
}: EmptyStateProps) {
  return (
    <motion.div
      variants={fadeIn}
      initial="initial"
      animate="animate"
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4 text-center',
        className
      )}
    >
      {/* Icon with subtle animation */}
      <motion.div
        variants={scaleIn}
        initial="initial"
        animate="animate"
        className={cn(
          'mb-4 flex h-14 w-14 items-center justify-center rounded-xl',
          'bg-gradient-to-br from-muted to-muted/50',
          'ring-1 ring-border/50'
        )}
      >
        <Icon className="h-7 w-7 text-muted-foreground" />
      </motion.div>

      {/* Title */}
      <motion.h3
        variants={fadeIn}
        className="mb-2 text-lg font-semibold text-foreground"
      >
        {title}
      </motion.h3>

      {/* Description */}
      <motion.p
        variants={fadeIn}
        className="mb-6 max-w-sm text-sm text-muted-foreground"
      >
        {description}
      </motion.p>

      {/* Actions */}
      {(action || secondaryAction) && (
        <motion.div
          variants={fadeIn}
          className="flex items-center gap-3"
        >
          {action && (
            <Button onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </motion.div>
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
