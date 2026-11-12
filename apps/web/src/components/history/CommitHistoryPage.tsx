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
  ChevronDown,
  GitBranch,
  GitCommit,
  History,
  Keyboard,
  Loader2,
  Search,
  UserRound,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FeatureTourOverlay,
  type FeatureTourStep,
} from '@/components/onboarding/FeatureTourOverlay';
import { BranchLoadError } from '@/components/project/BranchLoadError';
import { formatUserFacingError } from '@/domain/format/errors';
import { commitStructureHref } from '@/domain/project/objectLocation';
import { getCanonicalRepositoryPath, getProjectIdRepoPath } from '@/domain/project/repoPath';
import { useCommitByHash } from '@/hooks/commits/useCommitByHash';
import { useCommitsList } from '@/hooks/commits/useCommitsList';
import { useIntroDemoCompletion } from '@/hooks/onboarding/useIntroDemoCompletion';
import { useIntroDemoQueryFlag } from '@/hooks/onboarding/useIntroDemoQueryFlag';
import { useBranchesList } from '@/hooks/shared/useBranchesList';
import { useDiffRaw } from '@/hooks/shared/useDiffRaw';
import { useKeyboardNavigation } from '@/hooks/shared/useKeyboardNavigation';
import type { ApiCommit, Branch } from '@/types/api';
import { buildReturnTo, safeInternalReturnTo } from '@/utils/navigationReturn';
import { CommitHistoryDiffCard } from './CommitHistoryDiffView';
import { CommitHistoryRow } from './CommitHistoryRow';
import styles from './HistoryList.module.css';

// ============================================================================
// Types
// ============================================================================

interface CommitHistoryPageProps {
  projectId: string;
  commitHash?: string;
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

const EMPTY_COMMITS: CommitWithDiffStats[] = [];

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

export function CommitHistoryPage({ projectId, commitHash }: CommitHistoryPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const listPath = commitHash ? pathname.replace(/\/[0-9]+\/?$/, '') : pathname;
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const queryRef = useRef(query);
  queryRef.current = query;
  const branchFromUrl = searchParams.get('branch')?.trim() || 'all';
  const stateHref = `${getProjectIdRepoPath(projectId)}?${new URLSearchParams({ view: 'overview', ...(branchFromUrl !== 'all' ? { branch: branchFromUrl } : {}) }).toString()}`;
  const returnHref = safeInternalReturnTo(searchParams.get('returnTo'), stateHref);
  const stateLocation = returnHref.split('?')[0];
  const returnsToState =
    returnHref === stateHref ||
    (stateLocation === listPath.replace(/\/history\/?$/, '') &&
      !new URL(returnHref, 'https://t3x.local').searchParams.has('tab'));
  const selectedCommitHash = commitHash ?? (searchParams.get('commit')?.trim() || null);
  const authorFilter = searchParams.get('author') || 'all';
  const searchQuery = searchParams.get('q') || '';
  const [searchInput, setSearchInput] = useState(searchQuery);
  useEffect(() => setSearchInput(searchQuery), [searchQuery]);
  const introDemoRequested = useIntroDemoQueryFlag();
  const { completeIntroDemo } = useIntroDemoCompletion(projectId);

  // State
  const [branchResult, setBranchResult] = useState<{
    projectId: string;
    branches: Branch[];
    error: string | null;
    loading: boolean;
  }>();
  const [branchRetry, setBranchRetry] = useState(0);
  const currentBranches = branchResult?.projectId === projectId ? branchResult : undefined;
  const branches = currentBranches?.branches ?? [];
  const selectedBranch = branchFromUrl;
  const [listResult, setListResult] = useState<{
    projectId: string;
    branch: string;
    commits?: CommitWithDiffStats[];
    error?: string;
  } | null>(null);
  const currentList =
    listResult?.projectId === projectId && listResult.branch === selectedBranch ? listResult : null;
  const commits = currentList?.commits ?? EMPTY_COMMITS;
  const loading = !currentList;
  const error = currentList?.error;
  const [tourOpen, setTourOpen] = useState(false);
  const [resolvedCommit, setResolvedCommit] = useState<{
    projectId: string;
    hash: string;
    commit?: ApiCommit;
    error?: string;
  } | null>(null);
  const [parentResult, setParentResult] = useState<{
    projectId: string;
    hash: string;
    commit?: ApiCommit;
    error?: string;
  } | null>(null);
  const listRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const focusDetail = useRef(false);
  const { loadBranches } = useBranchesList();
  const { loadCommit } = useCommitByHash();
  const { loadCommits } = useCommitsList();
  const { loadDiff } = useDiffRaw();
  const listedCommit = useMemo(
    () =>
      commits.find(
        (item) => item.commit.hash === selectedCommitHash && item.commit.project_id === projectId
      )?.commit ?? null,
    [commits, projectId, selectedCommitHash]
  );
  const selectedResult =
    resolvedCommit?.projectId === projectId && resolvedCommit.hash === selectedCommitHash
      ? resolvedCommit
      : null;
  const authorOptions = useMemo(() => {
    const authors = new Set<string>();
    for (const item of commits) {
      authors.add(item.commit.author?.name || item.commit.author?.type || 'Unknown');
    }
    return [...authors].sort((a, b) => a.localeCompare(b));
  }, [commits]);
  const visibleCommits = useMemo(() => {
    const query = searchInput.trim().toLocaleLowerCase();
    return commits.filter(({ commit }) => {
      const author = commit.author?.name || commit.author?.type || 'Unknown';
      if (authorFilter !== 'all' && author !== authorFilter) return false;
      if (!query) return true;
      return [commit.message, commit.hash, commit.branch, author]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [authorFilter, commits, searchInput]);
  const selectedCommit =
    listedCommit ??
    selectedResult?.commit ??
    (!selectedCommitHash && !loading ? visibleCommits[0]?.commit : null);
  const selectedError = selectedResult?.error;
  const parentHash = selectedCommit?.parents[0];
  const listedParent = commits.find(
    ({ commit }) => commit.hash === parentHash && commit.project_id === projectId
  )?.commit;
  const resolvedParent =
    parentResult?.projectId === projectId && parentResult.hash === parentHash ? parentResult : null;
  const parentCommit = listedParent ?? resolvedParent?.commit ?? null;
  const parentError = !listedParent ? resolvedParent?.error : undefined;

  const updateQuery = useCallback(
    (changes: Record<string, string | null>, push = false, addressNumber?: string) => {
      const params = new URLSearchParams(queryRef.current);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      const changingCommit = Object.hasOwn(changes, 'commit');
      if (addressNumber) params.delete('commit');
      queryRef.current = params.toString();
      const target = addressNumber
        ? `${listPath}/${addressNumber}`
        : changingCommit
          ? listPath
          : pathname;
      const href = buildReturnTo(target, params);
      if (push) router.push(href, { scroll: false });
      else if (target !== pathname) router.replace(href, { scroll: false });
      // These controls only change this client view. Native history updates keep
      // Next's search params in sync without a server navigation on every key.
      else window.history.replaceState(null, '', href);
    },
    [listPath, pathname, router]
  );
  const closeCommit = useCallback(() => updateQuery({ commit: null }), [updateQuery]);

  const handleBranchChange = useCallback(
    (branch: string) => {
      updateQuery({ branch: branch === 'all' ? null : branch, commit: null });
    },
    [updateQuery]
  );

  useEffect(() => {
    let cancelled = false;
    setBranchResult((current) => ({
      projectId,
      branches: current?.projectId === projectId ? current.branches : [],
      error: current?.projectId === projectId ? current.error : null,
      loading: true,
    }));
    const load = async () => {
      try {
        const data = await loadBranches(projectId);
        if (!cancelled) {
          setBranchResult({ projectId, branches: data.branches, error: null, loading: false });
        }
      } catch (cause) {
        if (!cancelled) {
          setBranchResult((current) => ({
            projectId,
            branches: current?.projectId === projectId ? current.branches : [],
            error: formatUserFacingError(cause, 'Could not load branches.'),
            loading: false,
          }));
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, loadBranches, branchRetry]);

  // Fetch commits for selected branch
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setListResult(null);
      const identity = { projectId, branch: selectedBranch };
      try {
        const branch = selectedBranch === 'all' ? undefined : selectedBranch;
        const commitList = [...(await loadCommits(projectId, branch, 100))];

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

        if (!cancelled) setListResult({ ...identity, commits: results });
      } catch (err) {
        if (!cancelled)
          setListResult({
            ...identity,
            error: formatUserFacingError(err, 'Failed to load history.'),
          });
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedBranch, loadCommits, loadDiff]);

  // A permalink may point outside the latest 100 commits or the selected branch.
  // Resolve it by exact identity rather than silently returning to the list.
  useEffect(() => {
    if (!selectedCommitHash || listedCommit || loading) return;
    let cancelled = false;
    const identity = { projectId, hash: selectedCommitHash };
    setResolvedCommit(null);
    void loadCommit(selectedCommitHash, projectId)
      .then((commit) => {
        if (commit.hash !== selectedCommitHash || commit.project_id !== projectId)
          throw new Error('Commit response does not match the requested historical revision.');
        if (!cancelled) setResolvedCommit({ ...identity, commit });
      })
      .catch((err) => {
        if (!cancelled)
          setResolvedCommit({
            ...identity,
            error: formatUserFacingError(err, 'Failed to load this historical revision.'),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [listedCommit, loadCommit, loading, projectId, selectedCommitHash]);

  // A non-root comparison requires the exact first parent, even across branches.
  useEffect(() => {
    if (!parentHash || listedParent) return;
    let cancelled = false;
    setParentResult(null);
    void loadCommit(parentHash, projectId)
      .then((commit) => {
        if (commit.hash !== parentHash || commit.project_id !== projectId) {
          throw new Error('Parent commit response does not match this historical revision.');
        }
        if (!cancelled) setParentResult({ projectId, hash: parentHash, commit });
      })
      .catch((err) => {
        if (!cancelled)
          setParentResult({
            projectId,
            hash: parentHash,
            error: formatUserFacingError(err, 'Failed to load the parent commit.'),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [listedParent, loadCommit, parentHash, projectId]);

  // Narrow layouts stack the panes. Move focus after the new selection renders.
  useEffect(() => {
    if (!focusDetail.current) return;
    focusDetail.current = false;
    detailRef.current?.focus();
  }, [selectedCommitHash]);

  const commitHashes = useMemo(
    () => visibleCommits.map((item) => item.commit.hash),
    [visibleCommits]
  );

  const handleNavOpen = useCallback(
    (hash: string) => {
      if (window.matchMedia?.('(max-width: 760px)').matches) {
        if (hash === selectedCommitHash) detailRef.current?.focus();
        else focusDetail.current = true;
      }
      if (hash !== selectedCommitHash) {
        const address = commits.find(({ commit }) => commit.hash === hash)?.commit.address_number;
        updateQuery(
          { commit: hash },
          true,
          address && !listPath.startsWith('/project/') ? address : undefined
        );
      }
      setTourOpen(false);
    },
    [commits, listPath, selectedCommitHash, updateQuery]
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

  useEffect(() => {
    if (!selectedCommitHash) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCommit();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [closeCommit, selectedCommitHash]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const branchFeedback = (
    <BranchLoadError
      error={currentBranches?.error ?? null}
      loading={currentBranches?.loading ?? true}
      onRetry={() => setBranchRetry((current) => current + 1)}
    />
  );

  return (
    <div className={styles.page}>
      <header className={styles.header} data-intro-target="history-header">
        <h1
          className={styles.title}
          data-intro-target="history-keyboard"
          title="j / k: navigate · o: open · Esc: deselect"
        >
          History
        </h1>
        {returnHref ? (
          <button
            className={styles.backButton}
            onClick={() => router.push(returnHref)}
            type="button"
          >
            <ArrowLeft size={15} strokeWidth={2} />
            <span>{returnsToState ? 'Back to State' : 'Back to previous page'}</span>
          </button>
        ) : null}
      </header>

      <div className={styles.split}>
        <section aria-label="Commit list" className={styles.list} ref={listRef}>
          <h2 className={styles.listTitle}>Commits</h2>
          {branchFeedback}
          <div className={styles.controls}>
            <label className={styles.filterControl}>
              <GitBranch size={15} strokeWidth={2} />
              <select
                aria-label="History branch filter"
                value={selectedBranch}
                onChange={(event) => handleBranchChange(event.target.value)}
              >
                <option value="all">All branches</option>
                {Array.from(
                  new Set([
                    ...branches.map((branch) => branch.name),
                    ...(selectedBranch === 'all' ? [] : [selectedBranch]),
                  ])
                ).map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
              <ChevronDown className={styles.filterChevron} size={13} strokeWidth={2} />
            </label>
            <label className={styles.filterControl} data-intro-target="history-branch-filter">
              <UserRound size={15} strokeWidth={2} />
              <select
                aria-label="Author filter"
                value={authorFilter}
                onChange={(event) =>
                  updateQuery({ author: event.target.value === 'all' ? null : event.target.value })
                }
              >
                <option value="all">All authors</option>
                {Array.from(
                  new Set([...authorOptions, ...(authorFilter === 'all' ? [] : [authorFilter])])
                ).map((author) => (
                  <option key={author} value={author}>
                    {author}
                  </option>
                ))}
              </select>
              <ChevronDown className={styles.filterChevron} size={13} strokeWidth={2} />
            </label>

            <label className={styles.searchControl}>
              <Search size={16} strokeWidth={2} />
              <input
                aria-label="Search commits"
                placeholder="Search commits..."
                type="search"
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  updateQuery({ q: event.target.value || null });
                }}
              />
            </label>
          </div>
          <div className={styles.content}>
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
                      isSelected={selectedCommit?.hash === item.commit.hash}
                      onOpen={handleNavOpen}
                    />
                  ))}
                </div>
              ) : (
                <div className={styles.feedback}>No commits match these filters.</div>
              ))}
          </div>
        </section>
        <section
          aria-label="Selected commit"
          className={styles.detail}
          ref={detailRef}
          tabIndex={-1}
        >
          {selectedCommitHash && !selectedCommit ? (
            <div className={styles.feedback}>
              <div>
                {selectedError ? (
                  <p role="alert">{selectedError}</p>
                ) : (
                  <output>Loading historical revision…</output>
                )}
                <button type="button" className={styles.textAction} onClick={closeCommit}>
                  Back to history
                </button>
              </div>
            </div>
          ) : selectedCommit ? (
            <CommitHistoryDiffCard
              key={selectedCommit.hash}
              commit={selectedCommit}
              structureHref={commitStructureHref(
                getCanonicalRepositoryPath(pathname),
                selectedCommit
              )}
              parentCommit={parentCommit}
              parentError={parentError}
              onParentSelect={handleNavOpen}
              onListFocus={() => {
                const row =
                  listRef.current?.querySelector<HTMLButtonElement>('[aria-current="true"]');
                (row ?? listRef.current?.querySelector('select'))?.focus();
              }}
            />
          ) : (
            <p className={styles.feedback}>Select a commit to view its changes.</p>
          )}
        </section>
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
