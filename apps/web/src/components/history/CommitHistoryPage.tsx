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

import { ArrowLeft, GitBranch, GitCommit, History, Keyboard, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FeatureTourOverlay,
  type FeatureTourStep,
} from '@/components/onboarding/FeatureTourOverlay';
import { KeyboardHintBar } from '@/components/shared/KeyboardHintBar';
import { useCommitsList } from '@/hooks/commits/useCommitsList';
import { useIntroDemoCompletion } from '@/hooks/onboarding/useIntroDemoCompletion';
import { useIntroDemoQueryFlag } from '@/hooks/onboarding/useIntroDemoQueryFlag';
import { useBranchesList } from '@/hooks/shared/useBranchesList';
import { useDiffRaw } from '@/hooks/shared/useDiffRaw';
import { useKeyboardNavigation } from '@/hooks/shared/useKeyboardNavigation';
import type { ApiCommit, Branch } from '@/types/api';
import { CommitHistoryRow } from './CommitHistoryRow';

// ============================================================================
// Types
// ============================================================================

interface CommitHistoryPageProps {
  projectId: string;
}

interface CommitWithDiffStats {
  commit: ApiCommit;
  diffStats?: {
    addedCount: number;
    modifiedCount: number;
    removedCount: number;
  } | null;
  nodeCount?: number;
}

const HISTORY_TOUR_STEPS: FeatureTourStep[] = [
  {
    id: 'header',
    label: 'Tools',
    title: 'Use history as the project timeline',
    description:
      'The header gives users navigation, keyboard hints, and the branch filter before they inspect individual commits.',
    target: 'history-header',
    tone: 'commit',
    icon: History,
    details: [
      'Back returns to the canvas.',
      'Keyboard hints teach fast scanning.',
      'The branch dropdown narrows the timeline when a project grows.',
    ],
  },
  {
    id: 'filter',
    label: 'Branch',
    title: 'Filter by branch to focus the timeline',
    description:
      'The branch selector teaches that T3X projects can have multiple semantic paths, not only one linear chat.',
    target: 'history-branch-filter',
    tone: 'pending',
    icon: GitBranch,
    details: [
      'All branches is the default full-project view.',
      'Selecting a branch reloads commits for that version path.',
      'This is the safe way to review project evolution before opening a commit.',
    ],
  },
  {
    id: 'timeline',
    label: 'Rows',
    title: 'Click a row to open the commit detail page',
    description:
      'Each row is a versioned snapshot with hash, message, author, branch, and diff stats.',
    target: 'history-timeline',
    tone: 'extract',
    icon: GitCommit,
    details: [
      'Diff stats summarize what changed from the parent.',
      'The timeline dot shows root, normal, or merge commits.',
      'Opening a row continues the demo into commit inspection.',
    ],
  },
  {
    id: 'keyboard',
    label: 'Keys',
    title: 'Keyboard navigation is part of the product workflow',
    description:
      'History is designed for repeated review, so the demo should teach j/k, open, and deselect rather than only mouse clicks.',
    target: 'history-keyboard',
    tone: 'success',
    icon: Keyboard,
    details: [
      'Use j/k to move through rows.',
      'Use o or Enter to open the active commit.',
      'Use Esc to clear the active row.',
    ],
  },
];

// ============================================================================
// Component
// ============================================================================

export function CommitHistoryPage({ projectId }: CommitHistoryPageProps) {
  const router = useRouter();
  const introDemoRequested = useIntroDemoQueryFlag();
  const { completeIntroDemo } = useIntroDemoCompletion(projectId);

  // State
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [commits, setCommits] = useState<CommitWithDiffStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const { loadBranches } = useBranchesList();
  const { loadCommits } = useCommitsList();
  const { loadDiff } = useDiffRaw();

  // Fetch branches
  useEffect(() => {
    const load = async () => {
      try {
        const data = await loadBranches(projectId);
        setBranches(data.branches);
      } catch {
        // Non-critical
      }
    };
    load();
  }, [projectId, loadBranches]);

  // Fetch commits for selected branch
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const branch = selectedBranch === 'all' ? undefined : selectedBranch;
        const commitList = await loadCommits(projectId, branch, 100);

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
              if ((commit.parents ?? []).length === 1) {
                try {
                  const diff = await loadDiff(commit.parents[0], commit.hash);
                  diffStats = {
                    addedCount: diff.stats.addedCount,
                    modifiedCount: diff.stats.modifiedCount,
                    removedCount: diff.stats.removedCount,
                  };
                } catch {
                  // Diff failure is non-critical
                }
              }
              const nodeCount =
                (commit as { content?: { trees?: unknown[] } })?.content?.trees?.length ?? 0;
              return { commit, diffStats, nodeCount };
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
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedBranch, loadCommits, loadDiff]);

  // Keyboard navigation
  const commitHashes = useMemo(() => commits.map((c) => c.commit.hash), [commits]);

  const handleNavOpen = useCallback(
    (hash: string) => {
      router.push(
        `/project/${projectId}/commit/${encodeURIComponent(hash)}${introDemoRequested ? '?introDemo=1' : ''}`
      );
    },
    [router, projectId, introDemoRequested]
  );

  useEffect(() => {
    if (introDemoRequested) setTourOpen(true);
  }, [introDemoRequested]);

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
      <header
        className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4"
        data-intro-target="history-header"
      >
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
          <div data-intro-target="history-keyboard">
            <KeyboardHintBar
              hints={[
                { key: 'j k', label: 'navigate' },
                { key: 'o', label: 'open' },
                { key: 'esc', label: 'deselect' },
              ]}
            />
          </div>
          <span className="h-4 w-px bg-[var(--stroke-divider)]" />
          {/* Branch filter */}
          <div className="flex items-center gap-2" data-intro-target="history-branch-filter">
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
            <div className="space-y-0" data-intro-target="history-timeline">
              {commits.map((item, index) => (
                <CommitHistoryRow
                  key={item.commit.hash}
                  projectId={projectId}
                  hash={item.commit.hash}
                  message={item.commit.message}
                  author={item.commit.author}
                  committedAt={item.commit.committed_at}
                  branch={item.commit.branch}
                  parentCount={(item.commit.parents ?? []).length}
                  diffStats={item.diffStats}
                  nodeCount={item.nodeCount}
                  isFirst={index === 0}
                  isLast={index === commits.length - 1}
                  isActive={activeHash === item.commit.hash}
                  introDemo={introDemoRequested}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <FeatureTourOverlay
        open={tourOpen}
        title="History walkthrough"
        steps={HISTORY_TOUR_STEPS}
        onClose={() => setTourOpen(false)}
        onDone={() => void completeIntroDemo()}
      />
    </div>
  );
}
