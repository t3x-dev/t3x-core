'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * DiffHunkHeader — collapsible header for diff sections (GitHub @@ style).
 *
 * Spec: frontend-art-template §6.4
 */

interface DiffHunkHeaderProps {
  /** Base range string, e.g. "3,5" (start line, count) */
  baseRange?: string;
  /** Target range string, e.g. "3,6" (start line, count) */
  targetRange?: string;
  /** Fallback label if no range info */
  label?: string;
  onToggle?: () => void;
  isExpanded?: boolean;
}

export function DiffHunkHeader({
  baseRange,
  targetRange,
  label,
  onToggle,
  isExpanded,
}: DiffHunkHeaderProps) {
  const hunkLabel =
    baseRange || targetRange
      ? `@@ ${baseRange ? `-${baseRange}` : ''} ${targetRange ? `+${targetRange}` : ''} @@`
      : label || '';

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 bg-[var(--surface-app)] hover:bg-[var(--hover-bg)] px-4 py-1.5 font-mono text-xs text-[var(--text-tertiary)] transition-colors cursor-pointer border-y border-[var(--stroke-divider)]"
    >
      {isExpanded ? (
        <ChevronDown className="h-3 w-3 shrink-0" />
      ) : (
        <ChevronRight className="h-3 w-3 shrink-0" />
      )}
      <span className="text-[var(--accent-branch)]">{hunkLabel}</span>
    </button>
  );
}
