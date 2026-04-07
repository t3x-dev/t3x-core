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
  active: { className: 'border-[var(--status-success)]/30 bg-[var(--status-success)]/10 text-[var(--status-success)]' },
  draft: { className: 'border-[var(--status-warning)]/30 bg-[var(--status-warning)]/10 text-[var(--status-warning)]' },
  paused: { className: 'border-[var(--stroke-divider)] bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]' },
  running: {
    className: 'border-[var(--status-info)]/30 bg-[var(--status-info)]/10 text-[var(--status-info)] animate-pulse',
  },
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
