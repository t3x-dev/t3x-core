'use client';

import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * DiffHunkHeader — collapsible header for diff sections (GitHub @@ style).
 *
 * Spec: frontend-art-template §6.4
 */

interface DiffHunkHeaderProps {
  label: string;
  onToggle?: () => void;
  isExpanded?: boolean;
}

export function DiffHunkHeader({ label, onToggle, isExpanded }: DiffHunkHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 bg-muted/50 px-4 py-1.5 font-mono text-xs text-muted-foreground hover:bg-muted"
    >
      <ChevronDown className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-180')} />
      <span>{label}</span>
    </button>
  );
}
