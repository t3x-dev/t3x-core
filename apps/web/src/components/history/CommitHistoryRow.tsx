'use client';

/**
 * CommitHistoryRow — a single row in the commit history timeline.
 *
 * Displays: commit hash, message, author, relative time, diff stats, branch badge.
 * Clickable → navigates to commit detail page.
 */

import { Minus, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { formatDate, relativeTime, shortHash } from '@/domain/format/formatters';
import { cn } from '@/utils/cn';

// ============================================================================
// Types
// ============================================================================

export interface CommitHistoryRowProps {
  projectId: string;
  hash: string;
  message: string | null;
  author: { type: string; name?: string } | null;
  committedAt: string;
  branch: string | null;
  /** Number of parents (0 = root, 1 = normal, 2+ = merge) */
  parentCount: number;
  /** Diff stats vs parent (if available) */
  diffStats?: {
    addedCount: number;
    modifiedCount: number;
    removedCount: number;
  } | null;
  /** Number of trees in this commit */
  nodeCount?: number;
  /** Whether this is the first row (no top connector line) */
  isFirst: boolean;
  /** Whether this is the last row (no bottom connector line) */
  isLast: boolean;
  /** Whether this row is keyboard-active */
  isActive?: boolean;
  /** Whether the demo tour should continue after opening this commit */
  introDemo?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function CommitHistoryRow({
  projectId,
  hash,
  message,
  author,
  committedAt,
  branch,
  parentCount,
  diffStats,
  nodeCount,
  isFirst,
  isLast,
  isActive,
  introDemo = false,
}: CommitHistoryRowProps) {
  return (
    <Link
      href={`/project/${projectId}/commit/${encodeURIComponent(hash)}${introDemo ? '?introDemo=1' : ''}`}
      data-commit-hash={hash}
      className={cn(
        'group flex items-stretch hover:bg-[var(--hover-bg)] transition-colors rounded-md -mx-2 px-2',
        isActive && 'bg-[var(--hover-bg)] ring-1 ring-[var(--accent-commit)]/30'
      )}
    >
      {/* DAG column */}
      <div className="w-8 flex flex-col items-center shrink-0 py-1">
        {/* Top connector line */}
        {!isFirst && <div className="w-px flex-1 bg-[var(--stroke-divider)]" />}
        {isFirst && <div className="flex-1" />}

        {/* Commit dot */}
        <div
          className={cn(
            'w-3 h-3 rounded-full border-2 shrink-0',
            parentCount >= 2
              ? 'border-[var(--accent-merge)] bg-[var(--accent-merge)]/20'
              : parentCount === 0
                ? 'border-[var(--accent-commit)] bg-[var(--accent-commit)]'
                : 'border-[var(--accent-commit)] bg-[var(--surface-card)]'
          )}
        />

        {/* Bottom connector line */}
        {!isLast && <div className="w-px flex-1 bg-[var(--stroke-divider)]" />}
        {isLast && <div className="flex-1" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-2.5 pl-2">
        {/* First line: hash + message */}
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-xs text-[var(--status-info)] group-hover:underline">
            {shortHash(hash)}
          </span>
          <span className="text-sm text-[var(--text-primary)] truncate">
            {message || 'No message'}
          </span>
        </div>

        {/* Second line: stats + branch + author + time */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-tertiary)]">
          {/* Diff stats */}
          {diffStats && (
            <span className="flex items-center gap-1.5">
              {diffStats.addedCount > 0 && (
                <span className="flex items-center gap-0.5 text-[var(--diff-added-line)]">
                  <Plus size={10} />
                  {diffStats.addedCount}
                </span>
              )}
              {diffStats.modifiedCount > 0 && (
                <span className="flex items-center gap-0.5 text-[var(--diff-modified-line)]">
                  <Pencil size={10} />
                  {diffStats.modifiedCount}
                </span>
              )}
              {diffStats.removedCount > 0 && (
                <span className="flex items-center gap-0.5 text-[var(--diff-removed-line)]">
                  <Minus size={10} />
                  {diffStats.removedCount}
                </span>
              )}
            </span>
          )}

          {/* Tree count */}
          {nodeCount != null && (
            <span className="text-[var(--text-tertiary)]">
              {nodeCount} tree{nodeCount !== 1 ? 's' : ''}
            </span>
          )}

          {/* Branch badge */}
          {branch && (
            <span className="px-1.5 py-0.5 rounded text-[0.6rem] font-medium border border-[var(--stroke-divider)] bg-[var(--hover-bg)]">
              {branch}
            </span>
          )}

          {/* Author */}
          <span>{author?.name || author?.type || 'unknown'}</span>

          {/* Time */}
          <span title={formatDate(committedAt)}>{relativeTime(committedAt)}</span>
        </div>
      </div>
    </Link>
  );
}
