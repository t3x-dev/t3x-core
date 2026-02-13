'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * StatusBadge — unified status indicator for project/runner states.
 *
 * Spec: frontend-art-template §5.2
 * Replaces ad-hoc cn() conditional class patterns for status badges.
 */

const statusConfig = {
  active: { className: 'border-green-500/30 bg-green-500/10 text-[var(--status-success)]' },
  draft: { className: 'border-amber-500/30 bg-amber-500/10 text-[var(--status-warning)]' },
  paused: { className: 'border-gray-500/30 bg-gray-500/10 text-[var(--color-text-secondary)]' },
  running: { className: 'border-blue-500/30 bg-blue-500/10 text-[var(--status-info)] animate-pulse' },
} as const;

type StatusVariant = keyof typeof statusConfig;

interface StatusBadgeProps {
  status: StatusVariant;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {label ?? status}
    </Badge>
  );
}
