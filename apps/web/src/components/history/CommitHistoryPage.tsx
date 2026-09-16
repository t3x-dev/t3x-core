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

import {
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  GitBranch,
  GitCommit,
  GitFork,
  History,
  Keyboard,
  Loader2,
  Search,
  UserRound,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FeatureTourOverlay,
  type FeatureTourStep,
} from '@/components/onboarding/FeatureTourOverlay';
import { formatUserFacingError } from '@/domain/format/errors';
import { useCommitByHash } from '@/hooks/commits/useCommitByHash';
import { useCommitsList } from '@/hooks/commits/useCommitsList';
import { useIntroDemoCompletion } from '@/hooks/onboarding/useIntroDemoCompletion';
import { useIntroDemoQueryFlag } from '@/hooks/onboarding/useIntroDemoQueryFlag';
import { useBranchesList } from '@/hooks/shared/useBranchesList';
import { useDiffRaw } from '@/hooks/shared/useDiffRaw';
import { useKeyboardNavigation } from '@/hooks/shared/useKeyboardNavigation';
import type { ApiCommit, Branch } from '@/types/api';
import { safeInternalReturnTo } from '@/utils/navigationReturn';
import { CommitHistoryDiffView } from './CommitHistoryDiffView';
import { CommitHistoryRow } from './CommitHistoryRow';
import { HistoryCanvas } from './HistoryCanvas';
import styles from './HistoryList.module.css';

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
    title: 'Use timeline',
    description: 'Review project commits in order.',
    target: 'history-header',
    tone: 'commit',
    icon: History,
  },
  {
    id: 'filter',
    label: 'Filter',
    title: 'Filter history',
    description: 'Focus one author or search the timeline.',
    target: 'history-branch-filter',
    tone: 'pending',
    icon: GitBranch,
  },
  {
    id: 'timeline',
    label: 'Rows',
    title: 'Open commit row',
    description: 'See hash, branch, and diff stats.',
    target: 'history-timeline',
    tone: 'extract',
    icon: GitCommit,
  },
  {
    id: 'keyboard',
    label: 'Keys',
    title: 'Use keyboard shortcuts',
    description: 'Navigate with j/k and open.',
    target: 'history-keyboard',
    tone: 'success',
    icon: Keyboard,
  },
];

// ============================================================================
// Component
// ============================================================================

export function CommitHistoryPage({ projectId }: CommitHistoryPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const branchFromUrl = searchParams.get('branch')?.trim() || 'all';
  const historyView = searchParams.get('view') === 'list' ? 'list' : 'canvas';
  const returnHref = safeInternalReturnTo(
    searchParams.get('returnTo'),
    `/project/${encodeURIComponent(projectId)}`
  );
  const introDemoRequested = useIntroDemoQueryFlag();
  const { completeIntroDemo } = useIntroDemoCompletion(projectId);

  // State
  const [branches, setBranches] = useState<Branch[]>([]);
  const selectedBranch = branchFromUrl;
  const [commits, setCommits] = useState<CommitWithDiffStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  const [parentCommit, setParentCommit] = useState<ApiCommit | null>(null);
  const [parentLoading, setParentLoading] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);
  const [authorFilter, setAuthorFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { loadBranches } = useBranchesList();
  const { loadCommit } = useCommitByHash();
  const { loadCommits } = useCommitsList();
  const { loadDiff } = useDiffRaw();
  const selectedCommit = useMemo(
    () => commits.find((item) => item.commit.hash === selectedCommitHash)?.commit ?? null,
    [commits, selectedCommitHash]
  );

  const handleBranchChange = useCallback(
    (branch: string) => {
      setSelectedCommitHash(null);
      const params = new URLSearchParams(searchParams.toString());
      if (branch === 'all') params.delete('branch');
      else params.set('branch', branch);
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const handleViewChange = useCallback(
    (view: 'canvas' | 'list') => {
      setSelectedCommitHash(null);
      const params = new URLSearchParams(searchParams.toString());
      if (view === 'canvas') params.delete('view');
      else params.set('view', 'list');
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

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
        if (commitList.some((commit) => commit.project_id !== projectId)) {
          throw new Error('History response does not match the selected project.');
        }

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
        if (!cancelled) setError(formatUserFacingError(err, 'Failed to load history.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedBranch, loadCommits, loadDiff]);

  // Resolve a selected commit's first parent when it is not present in the
  // current branch-filtered history result. Root commits intentionally diff
  // against an empty state.
  useEffect(() => {
    let cancelled = false;
    const parentHash = selectedCommit?.parents?.[0];

    setParentError(null);
    if (!parentHash) {
      setParentCommit(null);
      setParentLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const listedParent = commits.find((item) => item.commit.hash === parentHash)?.commit;
    if (listedParent) {
      setParentCommit(listedParent);
      setParentLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setParentCommit(null);
    setParentLoading(true);
    void loadCommit(parentHash, projectId)
      .then((commit) => {
        if (commit.hash !== parentHash || commit.project_id !== projectId) {
          throw new Error('Parent commit response does not match this historical revision.');
        }
        if (!cancelled) setParentCommit(commit);
      })
      .catch((err) => {
        if (!cancelled) {
          setParentError(formatUserFacingError(err, 'Failed to load the parent commit.'));
        }
      })
      .finally(() => {
        if (!cancelled) setParentLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [commits, loadCommit, projectId, selectedCommit]);

  // Keyboard navigation
  const authorOptions = useMemo(() => {
    const authors = new Set<string>();
    for (const item of commits) {
      authors.add(item.commit.author?.name || item.commit.author?.type || 'Unknown');
    }
    return [...authors].sort((a, b) => a.localeCompare(b));
  }, [commits]);
  const visibleCommits = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return commits.filter(({ commit }) => {
      const author = commit.author?.name || commit.author?.type || 'Unknown';
      if (authorFilter !== 'all' && author !== authorFilter) return false;
      if (!query) return true;
      return [commit.message, commit.hash, commit.branch, author]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [authorFilter, commits, searchQuery]);
  const commitHashes = useMemo(
    () => visibleCommits.map((item) => item.commit.hash),
    [visibleCommits]
  );

  const handleNavOpen = useCallback((hash: string) => {
    setSelectedCommitHash(hash);
    setTourOpen(false);
  }, []);

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
    enabled: !loading && !selectedCommit,
  });

  useEffect(() => {
    if (!selectedCommit) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedCommitHash(null);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selectedCommit]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (!loading && !error && !selectedCommit && commits.length > 0 && historyView === 'canvas') {
    return (
      <HistoryCanvas
        branches={branches}
        commits={commits}
        selectedBranch={selectedBranch}
        onBack={() => router.replace(returnHref)}
        onBranchChange={handleBranchChange}
        onListView={() => handleViewChange('list')}
        onViewDiff={handleNavOpen}
      />
    );
  }

  return (
    <div
      className={
        selectedCommit ? 'flex h-full min-h-0 flex-col bg-[var(--surface-app)]' : styles.page
      }
    >
      {!selectedCommit && (
        <>
          <header className={styles.header} data-intro-target="history-header">
            <div className={styles.headingGroup}>
              <h1
                className={styles.title}
                data-intro-target="history-keyboard"
                title="j / k: navigate · o: open · Esc: deselect"
              >
                History
              </h1>
              <button
                className={styles.canvasButton}
                onClick={() => handleViewChange('canvas')}
                type="button"
              >
                <GitFork size={16} strokeWidth={2} />
                Open Canvas
                <ArrowUpRight size={14} strokeWidth={2} />
              </button>
            </div>
            <button
              aria-label="Back to current State"
              className={styles.backButton}
              onClick={() => router.replace(returnHref)}
              type="button"
            >
              <ArrowLeft size={15} strokeWidth={2} />
              <span>Back to current State</span>
            </button>
          </header>

          <div className={styles.controls}>
            <label className={styles.filterControl} data-intro-target="history-branch-filter">
              <UserRound size={15} strokeWidth={2} />
              <select
                aria-label="Author filter"
                value={authorFilter}
                onChange={(event) => setAuthorFilter(event.target.value)}
              >
                <option value="all">All authors</option>
                {authorOptions.map((author) => (
                  <option key={author} value={author}>
                    {author}
                  </option>
                ))}
              </select>
              <ChevronDown className={styles.filterChevron} size={13} strokeWidth={2} />
            </label>
            <span className={styles.controlDivider} />
            <label className={styles.searchControl}>
              <Search size={16} strokeWidth={2} />
              <input
                aria-label="Search commits"
                placeholder="Search commits..."
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
          </div>
        </>
      )}

      <div
        className={
          selectedCommit ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden' : styles.content
        }
      >
        {selectedCommit ? (
          parentLoading ||
          (selectedCommit.parents[0] &&
            parentCommit?.hash !== selectedCommit.parents[0] &&
            !parentError) ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
                <span className="text-sm text-[var(--text-tertiary)]">
                  Loading parent commit...
                </span>
              </div>
            </div>
          ) : parentError ? (
            <div className="mx-auto max-w-3xl px-6 py-16 text-center">
              <p className="text-sm text-[var(--status-error)]">{parentError}</p>
              <button
                type="button"
                onClick={() => setSelectedCommitHash(null)}
                className="mt-3 text-xs text-[var(--status-info)] hover:underline"
              >
                Back to history
              </button>
            </div>
          ) : (
            <CommitHistoryDiffView
              key={selectedCommit.hash}
              commit={selectedCommit}
              onBack={() => setSelectedCommitHash(null)}
              parentCommit={selectedCommit.parents.length === 0 ? null : parentCommit}
            />
          )
        ) : (
          <>
            {/* Loading */}
            {loading && (
              <div className={styles.feedback}>
                <Loader2 className={styles.spinner} size={20} />
                Loading history...
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <div className={styles.feedback} role="alert">
                {error}
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && commits.length === 0 && (
              <div className={styles.feedback}>
                <div>
                  <History size={28} strokeWidth={1.5} />
                  <p>No commits found</p>
                  {selectedBranch !== 'all' && (
                    <button
                      type="button"
                      onClick={() => handleBranchChange('all')}
                      className="mt-2 text-xs text-[var(--status-info)] hover:underline"
                    >
                      Show all branches
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Commit timeline */}
            {!loading &&
              !error &&
              commits.length > 0 &&
              (visibleCommits.length > 0 ? (
                <div className={styles.timeline} data-intro-target="history-timeline">
                  {visibleCommits.map((item, index) => (
                    <CommitHistoryRow
                      key={item.commit.hash}
                      hash={item.commit.hash}
                      message={item.commit.message}
                      author={item.commit.author}
                      committedAt={item.commit.committed_at}
                      branch={item.commit.branch}
                      parentCount={(item.commit.parents ?? []).length}
                      diffStats={item.diffStats}
                      nodeCount={item.nodeCount}
                      isFirst={index === 0}
                      isLast={index === visibleCommits.length - 1}
                      isActive={activeHash === item.commit.hash}
                      onOpen={handleNavOpen}
                    />
                  ))}
                  <div className={styles.beginning}>
                    <span />
                    <span className={styles.beginningRail}>
                      <span className={styles.beginningDot} />
                    </span>
                    <span className={styles.beginningLabel}>Beginning of history</span>
                  </div>
                </div>
              ) : (
                <div className={styles.feedback}>No commits match these filters.</div>
              ))}
          </>
        )}
      </div>
      <FeatureTourOverlay
        open={tourOpen}
        title="History"
        steps={HISTORY_TOUR_STEPS}
        onClose={() => setTourOpen(false)}
        onDone={() => void completeIntroDemo()}
      />
    </div>
  );
}
