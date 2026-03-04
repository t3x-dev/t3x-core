'use client';

/**
 * CommitHistoryPage — git log style commit history view.
 *
 * Features:
 * - Fixed h-14 header matching other detail pages
 * - Branch filter dropdown
 * - Keyboard navigation (j/k/Enter/o/Esc)
 * - Timeline with DAG lines
 * - Diff stats inline
 * - Relative time + hover tooltip
 */

import { ArrowLeft, GitBranch, History, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardHintBar } from '@/components/shared/KeyboardHintBar';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import type { Branch, CommitV4 } from '@/lib/api';
import { diffRaw, listBranches, listCommitsV4 } from '@/lib/api';
import { CommitHistoryRow } from './CommitHistoryRow';

// ============================================================================
// Types
// ============================================================================

interface CommitHistoryPageProps {
  projectId: string;
}

interface CommitWithDiffStats {
  commit: CommitV4;
  diffStats?: {
    addedCount: number;
    modifiedCount: number;
    removedCount: number;
  } | null;
}

// ============================================================================
// Component
// ============================================================================

export function CommitHistoryPage({ projectId }: CommitHistoryPageProps) {
  const router = useRouter();

  // State
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [commits, setCommits] = useState<CommitWithDiffStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch branches
  useEffect(() => {
    const load = async () => {
      try {
        const data = await listBranches(projectId);
        setBranches(data.branches);
      } catch {
        // Non-critical
      }
    };
    load();
  }, [projectId]);

  // Fetch commits for selected branch
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const branch = selectedBranch === 'all' ? undefined : selectedBranch;
        const commitList = await listCommitsV4(projectId, branch, 100, 0);

        if (cancelled) return;

        // Sort by committed_at descending (newest first)
        commitList.sort(
          (a, b) => new Date(b.committed_at).getTime() - new Date(a.committed_at).getTime()
        );

        // Fetch diff stats for each commit (batched, max 10 concurrent)
        const results: CommitWithDiffStats[] = [];
        const BATCH_SIZE = 10;

        for (let i = 0; i < commitList.length; i += BATCH_SIZE) {
          if (cancelled) return;
          const batch = commitList.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.all(
            batch.map(async (commit) => {
              let diffStats: CommitWithDiffStats['diffStats'] = null;
              if (commit.parents.length === 1) {
                try {
                  const diff = await diffRaw(commit.parents[0], commit.hash);
                  diffStats = {
                    addedCount: diff.stats.addedCount,
                    modifiedCount: diff.stats.modifiedCount,
                    removedCount: diff.stats.removedCount,
                  };
                } catch {
                  // Diff failure is non-critical
                }
              }
              return { commit, diffStats };
            })
          );
          results.push(...batchResults);
        }

        if (!cancelled) setCommits(results);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [projectId, selectedBranch]);

  // Keyboard navigation
  const commitHashes = useMemo(() => commits.map((c) => c.commit.hash), [commits]);

  const handleNavOpen = useCallback(
    (hash: string) => {
      router.push(`/project/${projectId}/commit/${encodeURIComponent(hash)}`);
    },
    [router, projectId]
  );

  const { activeId: activeHash } = useKeyboardNavigation({
    ids: commitHashes,
    onSelect: (id) => {
      if (id) {
        const el = document.querySelector(`[data-commit-hash="${id}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    },
    onAction: handleNavOpen,
    enabled: !loading,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col bg-[var(--surface-app)]">
      {/* ═══════ HEADER ═══════ */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/project/${projectId}`)}
            className="rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <History size={16} className="text-[var(--text-secondary)]" />
            <h1 className="text-[14px] font-semibold text-[var(--text-primary)]">Commit History</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Keyboard hints */}
          <KeyboardHintBar
            hints={[
              { key: 'j k', label: 'navigate' },
              { key: 'o', label: 'open' },
              { key: 'esc', label: 'deselect' },
            ]}
          />
          <span className="h-4 w-px bg-[var(--stroke-divider)]" />
          {/* Branch filter */}
          <div className="flex items-center gap-2">
            <GitBranch size={14} className="text-[var(--text-tertiary)]" />
            <select
              className="py-1 px-2 border border-[var(--stroke-default)] rounded-md text-xs bg-[var(--surface-card)] text-[var(--text-primary)] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--status-info)]/30"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
            >
              <option value="all">All branches</option>
              {branches.map((b) => (
                <option key={b.branch_id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* ═══════ SCROLLABLE CONTENT ═══════ */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">
          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
                <span className="text-sm text-[var(--text-tertiary)]">Loading history...</span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="text-center py-8">
              <p className="text-sm text-[var(--status-error)]">{error}</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && commits.length === 0 && (
            <div className="text-center py-16">
              <History
                size={32}
                className="mx-auto mb-3 text-[var(--text-tertiary)]"
                strokeWidth={1}
              />
              <p className="text-sm text-[var(--text-tertiary)]">No commits found</p>
              {selectedBranch !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedBranch('all')}
                  className="mt-2 text-xs text-[var(--status-info)] hover:underline"
                >
                  Show all branches
                </button>
              )}
            </div>
          )}

          {/* Commit timeline */}
          {!loading && !error && commits.length > 0 && (
            <div className="space-y-0">
              {commits.map((item, index) => (
                <CommitHistoryRow
                  key={item.commit.hash}
                  projectId={projectId}
                  hash={item.commit.hash}
                  message={item.commit.message}
                  author={item.commit.author}
                  committedAt={item.commit.committed_at}
                  branch={item.commit.branch}
                  parentCount={item.commit.parents.length}
                  diffStats={item.diffStats}
                  isFirst={index === 0}
                  isLast={index === commits.length - 1}
                  isActive={activeHash === item.commit.hash}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
