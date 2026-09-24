'use client';

/**
 * CommitHistoryRow — a single row in the commit history timeline.
 *
 * Displays: commit hash, message, author, relative time, diff stats, branch badge.
 * Clickable → opens the shared State structure and audit view inside History.
 */

import { ChevronRight, GitBranch } from 'lucide-react';
import { formatDate, relativeTime, shortHash } from '@/domain/format/formatters';
import { cn } from '@/utils/cn';
import styles from './HistoryList.module.css';

// ============================================================================
// Types
// ============================================================================

export interface CommitHistoryRowProps {
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
  /** Opens this commit in the History diff review. */
  onOpen: (hash: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function CommitHistoryRow({
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
  onOpen,
}: CommitHistoryRowProps) {
  const authorName = author?.name || author?.type || 'Unknown';
  const authorInitial = authorName.trim().charAt(0).toUpperCase() || 'U';
  const date = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(committedAt));

  return (
    <button
      type="button"
      onClick={() => onOpen(hash)}
      data-commit-hash={hash}
      data-history-last={isLast || undefined}
      className={cn(styles.row, isActive && styles.rowActive)}
    >
      <span className={styles.date} title={formatDate(committedAt)}>
        <span>{date}</span>
        <span className={styles.dateRelative}>{relativeTime(committedAt)}</span>
      </span>

      <span className={styles.rail}>
        <span
          className={cn(
            styles.dot,
            isFirst && styles.dotFirst,
            parentCount === 0 && styles.dotRoot
          )}
        />
      </span>

      <span className={styles.commit}>
        <span className={styles.message}>{message || 'Untitled commit'}</span>
        <span className={styles.meta}>
          <span className={styles.hash}>{shortHash(hash)}</span>
          <span className={styles.author}>
            <span className={styles.avatar}>{authorInitial}</span>
            <span>{authorName}</span>
          </span>
          <span className={styles.metaDivider} />
          {branch && (
            <span className={styles.branch}>
              <GitBranch size={13} strokeWidth={2} />
              <span>{branch}</span>
            </span>
          )}
          {parentCount === 0 && <span className={styles.rootBadge}>Root commit</span>}
          {parentCount >= 2 && <span className={styles.rootBadge}>Merge commit</span>}
          {nodeCount == null ? null : <span className="sr-only">{nodeCount} trees</span>}
        </span>
      </span>

      <span className={styles.stats}>
        {diffStats && diffStats.addedCount > 0 && (
          <span className={`${styles.stat} ${styles.added}`}>
            <strong>+{diffStats.addedCount}</strong>
            <span>{diffStats.addedCount} added</span>
          </span>
        )}
        {diffStats && diffStats.modifiedCount > 0 && (
          <span className={`${styles.stat} ${styles.modified}`}>
            <strong>~{diffStats.modifiedCount}</strong>
            <span>{diffStats.modifiedCount} modified</span>
          </span>
        )}
        {diffStats && diffStats.removedCount > 0 && (
          <span className={`${styles.stat} ${styles.removed}`}>
            <strong>−{diffStats.removedCount}</strong>
            <span>{diffStats.removedCount} removed</span>
          </span>
        )}
      </span>

      <ChevronRight className={styles.chevron} size={20} strokeWidth={2} />
    </button>
  );
}
