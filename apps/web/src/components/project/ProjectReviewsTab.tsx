'use client';

import {
  ArrowLeft,
  CheckCircle2,
  GitBranch,
  GitPullRequestArrow,
  ListFilter,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useProjectPullRequestsApi } from '@/hooks/projects/useProjectPullRequestsApi';
import { cn } from '@/utils/cn';

type PullRequestStatus = 'draft' | 'open' | 'ready' | 'blocked' | 'merged' | 'closed';
type PullRequestListMode = 'open' | 'closed';
type PullRequestView = 'list' | 'create' | 'detail';
type PullRequestDetailTab = 'overview' | 'structured-diff' | 'checks' | 'activity' | 'merge';
type PullRequestCompareStatus = 'ready' | 'already_open' | 'no_changes';

interface ProjectPullRequest {
  id: string;
  number: number;
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
  sourceCommitId: string;
  targetBaseCommitId: string;
  status: PullRequestStatus;
  author: string;
  steward?: string;
  reviewOwner?: string;
  workspace?: string;
  releaseLane?: string;
  linkedWork?: string;
  readinessLabel: string;
  readinessTone: 'success' | 'pending' | 'warning' | 'muted';
  updatedAt: string;
}

interface PullRequestCheck {
  id: string;
  label: string;
  status: 'passed' | 'pending' | 'blocked';
  detail: string;
}

interface ApiProjectPullRequestResponse {
  author_id: string;
  closed_at: string | null;
  created_at: string;
  description: string;
  id: string;
  linked_work: string | null;
  merged_at: string | null;
  number: number;
  project_id: string;
  release_lane_id: string | null;
  review_owner_id: string | null;
  source_branch: string;
  source_commit_id: string;
  status: PullRequestStatus;
  steward_id: string | null;
  target_base_commit_id: string;
  target_branch: string;
  title: string;
  updated_at: string;
  workspace_id: string | null;
}

interface PullRequestCompareCandidate {
  id: string;
  branch: string;
  baseBranch: string;
  title: string;
  description: string;
  headCommitId: string;
  baseCommitId: string;
  updatedAt: string;
  aheadBy: number;
  behindBy: number;
  yopsChanges: number;
  changedNodes: number;
  outputImpacts: number;
  sourceRefs: number;
  schema: string;
  status: PullRequestCompareStatus;
  statusLabel: string;
  openPullRequestNumber: number | null;
}

interface ApiProjectPullRequestCompareCandidate {
  id: string;
  branch: string;
  base_branch: string;
  title: string;
  description: string;
  head_commit_id: string;
  base_commit_id: string;
  updated_at: string;
  ahead_by: number;
  behind_by: number;
  yops_changes: number;
  changed_nodes: number;
  output_impacts: number;
  source_refs: number;
  schema: string;
  status: PullRequestCompareStatus;
  status_label: string;
  open_pull_request_number: number | null;
}

const INITIAL_PULL_REQUESTS: ProjectPullRequest[] = [
  {
    id: 'pr_release_cleanup',
    number: 17,
    title: 'Release note cleanup',
    description:
      'Prepare release-note state for merge into main while retaining provenance and output impact.',
    sourceBranch: 'release-notes/cleanup',
    targetBranch: 'main',
    sourceCommitId: 'sha:12cc0d4',
    targetBaseCommitId: 'sha:6de18a0',
    status: 'ready',
    author: 'Noah Park',
    steward: 'Noah Park',
    reviewOwner: 'Iris Zhang',
    workspace: 'Product foundation',
    releaseLane: '2026.07',
    linkedWork: 'Release notes cleanup workspace',
    readinessLabel: 'ready to merge',
    readinessTone: 'success',
    updatedAt: 'updated 2 days ago',
  },
  {
    id: 'pr_prd_schema_v3',
    number: 18,
    title: 'PRD Schema v3 rollout',
    description:
      'Open the schema rollout proposal so review can decide migration coverage before merge.',
    sourceBranch: 'schema/prd-v3',
    targetBranch: 'main',
    sourceCommitId: 'sha:5c10b29',
    targetBaseCommitId: 'sha:6de18a0',
    status: 'blocked',
    author: 'Iris Zhang',
    steward: 'Iris Zhang',
    reviewOwner: 'Maya Chen',
    workspace: 'Product foundation',
    releaseLane: 'Schema track',
    linkedWork: 'PRD schema upgrade',
    readinessLabel: 'needs decision',
    readinessTone: 'warning',
    updatedAt: 'updated 1 day ago',
  },
  {
    id: 'pr_audience_handoff',
    number: 19,
    title: 'Audience handoff updates',
    description:
      'Move audience handoff state into a reviewable merge proposal before main branch merge.',
    sourceBranch: 'workspace/audience-handoff',
    targetBranch: 'main',
    sourceCommitId: 'sha:8ab61ef',
    targetBaseCommitId: 'sha:6de18a0',
    status: 'draft',
    author: 'Maya Chen',
    workspace: 'Product foundation',
    linkedWork: 'Audience handoff workspace',
    readinessLabel: 'draft',
    readinessTone: 'muted',
    updatedAt: 'updated 18 minutes ago',
  },
  {
    id: 'pr_limitations_copy',
    number: 14,
    title: 'Limitations wording alignment',
    description: 'Merged wording alignment for the limitations state.',
    sourceBranch: 'docs/limitations-copy',
    targetBranch: 'main',
    sourceCommitId: 'sha:72af006',
    targetBaseCommitId: 'sha:12cc0d4',
    status: 'merged',
    author: 'Iris Zhang',
    steward: 'Iris Zhang',
    reviewOwner: 'Noah Park',
    workspace: 'Product foundation',
    linkedWork: 'Limitations wording cleanup',
    readinessLabel: 'merged',
    readinessTone: 'success',
    updatedAt: 'merged 6 days ago',
  },
];

const DETAIL_TABS: Array<{ id: PullRequestDetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'structured-diff', label: 'Structured diff' },
  { id: 'checks', label: 'Checks' },
  { id: 'activity', label: 'Activity' },
  { id: 'merge', label: 'Merge' },
];

const BASE_BRANCHES = ['main', 'release/2026-07'];
const INITIAL_COMPARE_CANDIDATES: PullRequestCompareCandidate[] = [
  {
    id: 'compare_outputs_bundle_refresh',
    branch: 'outputs/bundle-refresh',
    baseBranch: 'main',
    title: 'Output bundle refresh',
    description:
      'Refresh generated output bundle state after the latest release-note source changes.',
    headCommitId: 'sha:31af8d2',
    baseCommitId: 'sha:6de18a0',
    updatedAt: 'updated 5 days ago',
    aheadBy: 3,
    behindBy: 0,
    yopsChanges: 18,
    changedNodes: 11,
    outputImpacts: 4,
    sourceRefs: 5,
    schema: 'Output Bundle Schema v1',
    status: 'ready',
    statusLabel: 'Ready to create',
    openPullRequestNumber: null,
  },
  {
    id: 'compare_yschema_contract_source',
    branch: 'yschema-p0/1145-contract-source',
    baseBranch: 'main',
    title: 'YSchema contract source alignment',
    description: 'Align contract source state before promoting the validation contract branch.',
    headCommitId: 'sha:44d2c0b',
    baseCommitId: 'sha:6de18a0',
    updatedAt: 'updated last week',
    aheadBy: 2,
    behindBy: 1,
    yopsChanges: 9,
    changedNodes: 6,
    outputImpacts: 1,
    sourceRefs: 3,
    schema: 'YSchema Contract v1',
    status: 'ready',
    statusLabel: 'Ready to create',
    openPullRequestNumber: null,
  },
  {
    id: 'compare_dev',
    branch: 'dev',
    baseBranch: 'main',
    title: 'Development branch sync',
    description: 'Review development branch state before deciding whether it should merge.',
    headCommitId: 'sha:92bd3aa',
    baseCommitId: 'sha:6de18a0',
    updatedAt: 'updated last week',
    aheadBy: 5,
    behindBy: 2,
    yopsChanges: 24,
    changedNodes: 16,
    outputImpacts: 3,
    sourceRefs: 8,
    schema: 'Product Foundation Schema v2',
    status: 'ready',
    statusLabel: 'Ready to create',
    openPullRequestNumber: null,
  },
];

function toProjectPullRequest(api: ApiProjectPullRequestResponse): ProjectPullRequest {
  const readiness =
    api.status === 'ready'
      ? ({ label: 'ready to merge', tone: 'success' } as const)
      : api.status === 'blocked'
        ? ({ label: 'needs decision', tone: 'warning' } as const)
        : api.status === 'draft'
          ? ({ label: 'draft', tone: 'muted' } as const)
          : api.status === 'merged'
            ? ({ label: 'merged', tone: 'success' } as const)
            : ({ label: 'checks queued', tone: 'pending' } as const);

  return {
    author: api.author_id,
    description: api.description,
    id: api.id,
    linkedWork: api.linked_work ?? undefined,
    number: api.number,
    readinessLabel: readiness.label,
    readinessTone: readiness.tone,
    releaseLane: api.release_lane_id ?? undefined,
    reviewOwner: api.review_owner_id ?? undefined,
    sourceBranch: api.source_branch,
    sourceCommitId: api.source_commit_id,
    status: api.status,
    steward: api.steward_id ?? undefined,
    targetBaseCommitId: api.target_base_commit_id,
    targetBranch: api.target_branch,
    title: api.title,
    updatedAt: new Date(api.updated_at).toLocaleString(),
    workspace: api.workspace_id ?? undefined,
  };
}

function toCompareCandidate(
  api: ApiProjectPullRequestCompareCandidate
): PullRequestCompareCandidate {
  return {
    aheadBy: api.ahead_by,
    baseBranch: api.base_branch,
    baseCommitId: api.base_commit_id,
    behindBy: api.behind_by,
    branch: api.branch,
    changedNodes: api.changed_nodes,
    description: api.description,
    headCommitId: api.head_commit_id,
    id: api.id,
    openPullRequestNumber: api.open_pull_request_number,
    outputImpacts: api.output_impacts,
    schema: api.schema,
    sourceRefs: api.source_refs,
    status: api.status,
    statusLabel: api.status_label,
    title: api.title,
    updatedAt: new Date(api.updated_at).toLocaleString(),
    yopsChanges: api.yops_changes,
  };
}

export function ProjectReviewsTab({ projectId }: { projectId?: string } = {}) {
  const {
    createPullRequest: createProjectPullRequest,
    fetchCompareCandidates,
    fetchPullRequests,
    mergePullRequest: mergeProjectPullRequest,
  } = useProjectPullRequestsApi();
  const [pullRequests, setPullRequests] = useState(INITIAL_PULL_REQUESTS);
  const [baseBranches, setBaseBranches] = useState(BASE_BRANCHES);
  const [compareCandidates, setCompareCandidates] = useState(INITIAL_COMPARE_CANDIDATES);
  const [mode, setMode] = useState<PullRequestListMode>('open');
  const [view, setView] = useState<PullRequestView>('list');
  const [selectedId, setSelectedId] = useState(INITIAL_PULL_REQUESTS[0]?.id ?? '');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<PullRequestDetailTab>('overview');
  const [query, setQuery] = useState('is:open type:pr');
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    title: 'Output bundle refresh',
    description:
      '## Summary\n- Refresh generated output bundle state after release-note source changes.\n- Review structured diff and output impact before merging into main.\n- Merge readiness runs after the PR opens.',
    sourceBranch: 'outputs/bundle-refresh',
    targetBranch: 'main',
  });
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    setApiError(null);
    fetchPullRequests(projectId)
      .then((data) => {
        if (!cancelled) setPullRequests(data.pull_requests.map(toProjectPullRequest));
      })
      .catch((err) => {
        if (!cancelled) {
          setApiError(err instanceof Error ? err.message : 'Could not load pull requests');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchPullRequests, projectId]);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    fetchCompareCandidates(projectId, createForm.targetBranch)
      .then((data) => {
        if (cancelled) return;
        const mappedCandidates = data.compare_branches.map(toCompareCandidate);
        setBaseBranches(data.base_branches.length > 0 ? data.base_branches : BASE_BRANCHES);
        setCompareCandidates(
          mappedCandidates.length > 0 ? mappedCandidates : INITIAL_COMPARE_CANDIDATES
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setApiError(err instanceof Error ? err.message : 'Could not load comparable branches');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [createForm.targetBranch, fetchCompareCandidates, projectId]);

  const openPullRequests = pullRequests.filter((item) =>
    ['draft', 'open', 'ready', 'blocked'].includes(item.status)
  );
  const closedPullRequests = pullRequests.filter((item) =>
    ['merged', 'closed'].includes(item.status)
  );
  const selectedPullRequest =
    pullRequests.find((item) => item.id === selectedId) ?? openPullRequests[0] ?? pullRequests[0];

  const visiblePullRequests = useMemo(() => {
    const source = mode === 'open' ? openPullRequests : closedPullRequests;
    const normalized = query
      .toLowerCase()
      .replace(/status:(active|open|merged|closed)/g, '')
      .replace(/is:(open|closed)/g, '')
      .replace(/type:pr/g, '')
      .trim();
    if (!normalized) return source;

    return source.filter((item) =>
      [
        item.title,
        item.description,
        item.sourceBranch,
        item.targetBranch,
        item.author,
        item.reviewOwner,
        item.steward,
        item.workspace,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    );
  }, [closedPullRequests, mode, openPullRequests, query]);

  const availableCompareCandidates = useMemo(
    () =>
      compareCandidates.filter(
        (candidate) =>
          candidate.status === 'ready' &&
          candidate.branch !== createForm.targetBranch &&
          (candidate.aheadBy > 0 || candidate.yopsChanges > 0)
      ),
    [compareCandidates, createForm.targetBranch]
  );
  const selectedCompareCandidate =
    compareCandidates.find(
      (candidate) =>
        candidate.branch === createForm.sourceBranch &&
        candidate.baseBranch === createForm.targetBranch
    ) ??
    availableCompareCandidates[0] ??
    null;
  const canCreatePullRequest = selectedCompareCandidate?.status === 'ready';

  useEffect(() => {
    if (view !== 'create') return;
    if (!selectedCompareCandidate || selectedCompareCandidate.branch === createForm.sourceBranch) {
      return;
    }

    setCreateForm((form) => ({
      ...form,
      description: `## Summary\n- ${selectedCompareCandidate.description}\n- Review structured diff and output impact before merging into ${selectedCompareCandidate.baseBranch}.\n- Merge readiness runs after the PR opens.`,
      sourceBranch: selectedCompareCandidate.branch,
      targetBranch: selectedCompareCandidate.baseBranch,
      title: selectedCompareCandidate.title,
    }));
  }, [createForm.sourceBranch, selectedCompareCandidate, view]);

  const openPullRequest = (pullRequest: ProjectPullRequest) => {
    setSelectedId(pullRequest.id);
    setHighlightedId(null);
    setMergeError(null);
    setDetailTab('overview');
    setView('detail');
  };

  const createLocalPullRequest = () => {
    const nextNumber = Math.max(0, ...pullRequests.map((item) => item.number)) + 1;
    const nowLabel = 'created just now';
    const next: ProjectPullRequest = {
      id: `pr_${nextNumber}`,
      number: nextNumber,
      title: createForm.title.trim() || 'Untitled merge proposal',
      description: createForm.description,
      sourceBranch: createForm.sourceBranch,
      targetBranch: createForm.targetBranch,
      sourceCommitId: 'sha:pending',
      targetBaseCommitId: 'sha:6de18a0',
      status: 'open',
      author: 'You',
      workspace: 'Product foundation',
      linkedWork: 'Created from PR workbench',
      readinessLabel: 'checks queued',
      readinessTone: 'pending',
      updatedAt: nowLabel,
    };

    setPullRequests((items) => [next, ...items]);
    setSelectedId(next.id);
    setHighlightedId(next.id);
    setMode('open');
    setQuery('is:open type:pr');
    setView('list');
    return next;
  };

  const createPullRequest = () => {
    if (!canCreatePullRequest) return;

    if (!projectId) {
      createLocalPullRequest();
      return;
    }

    createProjectPullRequest(projectId, {
      description: createForm.description,
      source_branch: createForm.sourceBranch,
      target_branch: createForm.targetBranch,
      title: createForm.title.trim() || 'Untitled merge proposal',
    })
      .then((created) => {
        const mapped = toProjectPullRequest(created);
        setPullRequests((items) => [mapped, ...items]);
        setSelectedId(mapped.id);
        setHighlightedId(mapped.id);
        setMode('open');
        setQuery('is:open type:pr');
        setView('list');
        setApiError(null);
      })
      .catch((err) => {
        setApiError(err instanceof Error ? err.message : 'Could not create pull request');
        createLocalPullRequest();
      });
  };

  const showMergedPullRequest = (merged: ProjectPullRequest) => {
    setPullRequests((items) =>
      items.map((item) => (item.id === merged.id || item.number === merged.number ? merged : item))
    );
    setSelectedId(merged.id);
    setHighlightedId(merged.id);
    setMode('closed');
    setQuery('is:closed type:pr');
    setMergeError(null);
    setView('list');
  };

  const mergePullRequest = (pullRequest: ProjectPullRequest) => {
    if (pullRequest.status !== 'ready' || mergingId) return;

    setMergingId(pullRequest.id);
    setMergeError(null);

    if (!projectId) {
      showMergedPullRequest({
        ...pullRequest,
        readinessLabel: 'merged',
        readinessTone: 'success',
        status: 'merged',
        updatedAt: 'merged just now',
      });
      setMergingId(null);
      return;
    }

    mergeProjectPullRequest(projectId, {
      expected_source_commit_id: pullRequest.sourceCommitId,
      expected_target_commit_id: pullRequest.targetBaseCommitId,
      number: pullRequest.number,
    })
      .then((merged) => {
        showMergedPullRequest(toProjectPullRequest(merged));
      })
      .catch((err) => {
        setMergeError(
          err instanceof Error
            ? err.message
            : 'Merge readiness changed. Rerun readiness before merging.'
        );
      })
      .finally(() => {
        setMergingId(null);
      });
  };

  if (view === 'create') {
    return (
      <PullRequestCreateView
        baseBranches={baseBranches}
        canCreate={canCreatePullRequest}
        candidates={availableCompareCandidates}
        form={createForm}
        onBack={() => setView('list')}
        onChange={setCreateForm}
        onCreate={createPullRequest}
        selectedCandidate={selectedCompareCandidate}
      />
    );
  }

  if (view === 'detail' && selectedPullRequest) {
    return (
      <PullRequestDetailView
        detailTab={detailTab}
        mergeError={mergeError}
        merging={mergingId === selectedPullRequest.id}
        onBack={() => setView('list')}
        onChangeTab={setDetailTab}
        onMerge={() => mergePullRequest(selectedPullRequest)}
        pullRequest={selectedPullRequest}
      />
    );
  }

  return (
    <section className="h-full overflow-auto bg-[var(--surface-canvas)] p-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <section className="rounded-3xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--text-primary)] text-sm font-bold text-[var(--surface-panel)]">
                PR
              </div>
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
                Merge proposals for structured state
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-5 text-[var(--text-secondary)]">
                Create a PR from any branch, inspect structured diff in the detail view, run merge
                readiness, then merge when the project is ready.
              </p>
            </div>
            <Button type="button" variant="ghost">
              Dismiss
            </Button>
          </div>
        </section>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <div className="flex min-w-0 overflow-hidden rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] shadow-sm">
            <Button
              className="h-11 rounded-none border-0 border-r border-[var(--stroke-divider)]"
              type="button"
              variant="ghost"
            >
              <ListFilter aria-hidden="true" className="h-4 w-4" />
              Scope
            </Button>
            <label className="relative min-w-0 flex-1">
              <Search
                aria-hidden="true"
                className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-[var(--text-tertiary)]"
              />
              <input
                aria-label="Search pull requests"
                className="h-11 w-full bg-transparent pr-3 pl-9 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                onChange={(event) => setQuery(event.target.value)}
                value={query}
              />
            </label>
          </div>
          <Button type="button" variant="canvas-outline">
            Owners <Badge variant="secondary">12</Badge>
          </Button>
          <Button type="button" variant="canvas-outline">
            Release lane <Badge variant="secondary">1</Badge>
          </Button>
          <Button onClick={() => setView('create')} type="button" variant="commit">
            Create PR
          </Button>
        </div>

        {apiError ? (
          <div className="rounded-2xl border border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] p-3 text-sm text-[var(--text-secondary)]">
            Showing local PR preview data because the API request failed: {apiError}
          </div>
        ) : null}

        <section className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <ModeButton
                active={mode === 'open'}
                count={openPullRequests.length}
                label="Open"
                onClick={() => {
                  setMode('open');
                  setQuery('is:open type:pr');
                }}
              />
              <ModeButton
                active={mode === 'closed'}
                count={closedPullRequests.length}
                label="Closed"
                onClick={() => {
                  setMode('closed');
                  setQuery('is:closed type:pr');
                }}
              />
            </div>
            <div className="flex flex-wrap gap-1 text-xs text-[var(--text-secondary)]">
              {['Owner', 'Source', 'Target', 'Checks', 'Review', 'Updated'].map((label) => (
                <Button key={label} size="sm" type="button" variant="ghost">
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-3">
          {visiblePullRequests.map((pullRequest) => (
            <PullRequestRow
              highlighted={pullRequest.id === highlightedId}
              key={pullRequest.id}
              onOpen={() => openPullRequest(pullRequest)}
              pullRequest={pullRequest}
            />
          ))}
        </div>

        <p className="px-2 text-sm text-[var(--text-secondary)]">
          <span aria-hidden="true">💡</span>{' '}
          <span className="font-semibold text-[var(--text-primary)]">Tip:</span> Try{' '}
          <span className="text-[var(--status-info)]">owner:</span>,{' '}
          <span className="text-[var(--status-info)]">source:</span>, or{' '}
          <span className="text-[var(--status-info)]">target:</span> to narrow proposals.
        </p>
      </div>
    </section>
  );
}

function ModeButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors',
        active
          ? 'bg-[var(--status-info)]/10 text-[var(--status-info)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
      )}
      onClick={onClick}
      type="button"
    >
      <GitPullRequestArrow aria-hidden="true" className="h-4 w-4" />
      <span>{count}</span>
      <span>{label}</span>
    </button>
  );
}

function PullRequestRow({
  highlighted,
  onOpen,
  pullRequest,
}: {
  highlighted: boolean;
  onOpen: () => void;
  pullRequest: ProjectPullRequest;
}) {
  return (
    <article
      className={cn(
        'grid gap-4 rounded-2xl border bg-[var(--surface-panel)] p-4 shadow-sm transition-colors sm:grid-cols-[6px_minmax(0,1fr)_auto]',
        highlighted ? 'border-[var(--status-info)]' : 'border-[var(--stroke-divider)]'
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          'hidden rounded-full sm:block',
          highlighted ? 'bg-[var(--status-success)]' : 'bg-[var(--status-info)]'
        )}
      />
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="truncate text-base font-semibold text-[var(--text-primary)]">
            {pullRequest.title}
          </h3>
          {highlighted ? (
            <Badge variant="branch">
              {pullRequest.status === 'merged' ? 'Just merged' : 'New'}
            </Badge>
          ) : null}
          <ReadinessBadge pullRequest={pullRequest} />
        </div>
        <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">
          Proposal #{pullRequest.number} · {pullRequest.author} ·{' '}
          <BranchPill>{pullRequest.sourceBranch}</BranchPill> →{' '}
          <BranchPill>{pullRequest.targetBranch}</BranchPill> · {pullRequest.updatedAt}
        </p>
      </div>
      <div className="flex items-center">
        <Button onClick={onOpen} type="button" variant="canvas-outline">
          Open
        </Button>
      </div>
    </article>
  );
}

function PullRequestCreateView({
  baseBranches,
  canCreate,
  candidates,
  form,
  onBack,
  onChange,
  onCreate,
  selectedCandidate,
}: {
  baseBranches: string[];
  canCreate: boolean;
  candidates: PullRequestCompareCandidate[];
  form: {
    description: string;
    sourceBranch: string;
    targetBranch: string;
    title: string;
  };
  onBack: () => void;
  onChange: (form: {
    description: string;
    sourceBranch: string;
    targetBranch: string;
    title: string;
  }) => void;
  onCreate: () => void;
  selectedCandidate: PullRequestCompareCandidate | null;
}) {
  const update = (patch: Partial<typeof form>) => onChange({ ...form, ...patch });
  const compareOptions =
    candidates.length > 0
      ? candidates.map((candidate) => candidate.branch)
      : form.sourceBranch
        ? [form.sourceBranch]
        : [];

  const selectCandidate = (candidate: PullRequestCompareCandidate) => {
    onChange({
      description: `## Summary\n- ${candidate.description}\n- Review structured diff and output impact before merging into ${candidate.baseBranch}.\n- Merge readiness runs after the PR opens.`,
      sourceBranch: candidate.branch,
      targetBranch: candidate.baseBranch,
      title: candidate.title,
    });
  };

  return (
    <section className="h-full overflow-auto bg-[var(--surface-canvas)] p-4">
      <div className="mx-auto grid w-full max-w-6xl gap-4">
        <Button className="w-fit" onClick={onBack} type="button" variant="ghost">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          PR workbench
        </Button>

        <section className="rounded-3xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
                Open pull request
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-5 text-[var(--text-secondary)]">
                Select the branch you want to propose, confirm the base branch, then add the PR
                title and description before opening it for review.
              </p>
            </div>
            <Badge variant={canCreate ? 'branch' : 'secondary'}>
              {canCreate ? 'Ready to create' : 'Choose branch'}
            </Badge>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4">
            <GitBranch aria-hidden="true" className="h-4 w-4 text-[var(--text-tertiary)]" />
            <BranchSelect
              label="base"
              onChange={(targetBranch) => update({ targetBranch })}
              options={baseBranches}
              value={form.targetBranch}
            />
            <span className="text-sm text-[var(--text-tertiary)]">← compare:</span>
            <BranchSelect
              label=""
              onChange={(sourceBranch) => {
                const next = candidates.find((candidate) => candidate.branch === sourceBranch);
                if (next) {
                  selectCandidate(next);
                  return;
                }
                update({ sourceBranch });
              }}
              options={compareOptions}
              value={form.sourceBranch}
            />
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[var(--status-warning)]/10 p-4 text-sm text-[var(--text-secondary)]">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-[var(--status-warning)]" />
            <span>
              Branches that already have an open PR are omitted here. Validation remains in the
              workspace flow; this page only prepares a branch comparison for PR review.
            </span>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
          <section className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] shadow-sm">
            <div className="border-b border-[var(--stroke-divider)] p-4">
              <h3 className="font-semibold text-[var(--text-primary)]">Available branches</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Branches with changes against {form.targetBranch} and no open PR.
              </p>
            </div>
            <div className="grid gap-2 p-3">
              {candidates.length > 0 ? (
                candidates.map((candidate) => (
                  <CompareCandidateRow
                    active={candidate.branch === form.sourceBranch}
                    candidate={candidate}
                    key={candidate.id}
                    onSelect={() => selectCandidate(candidate)}
                  />
                ))
              ) : (
                <div className="rounded-2xl bg-[var(--surface-card)] p-4 text-sm text-[var(--text-secondary)]">
                  No branches are currently available for a new pull request.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--stroke-divider)] p-5">
              <div>
                <h3 className="font-semibold text-[var(--text-primary)]">
                  {selectedCandidate ? selectedCandidate.title : 'Choose a branch to compare'}
                </h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {selectedCandidate
                    ? `${selectedCandidate.branch} into ${selectedCandidate.baseBranch}`
                    : 'Select one available branch to preview the PR.'}
                </p>
              </div>
              <Badge variant={canCreate ? 'branch' : 'secondary'}>
                {selectedCandidate?.statusLabel ?? 'No comparison'}
              </Badge>
            </div>

            <div className="grid gap-5 p-5">
              {selectedCandidate ? (
                <>
                  <div className="grid gap-3 md:grid-cols-4">
                    <CompareMetric label="Ahead" value={String(selectedCandidate.aheadBy)} />
                    <CompareMetric
                      label="YOps changes"
                      value={String(selectedCandidate.yopsChanges)}
                    />
                    <CompareMetric
                      label="Changed nodes"
                      value={String(selectedCandidate.changedNodes)}
                    />
                    <CompareMetric
                      label="Output impact"
                      value={String(selectedCandidate.outputImpacts)}
                    />
                  </div>

                  <div className="grid gap-2">
                    <ReadinessRow label="Head commit" value={selectedCandidate.headCommitId} />
                    <ReadinessRow label="Base commit" value={selectedCandidate.baseCommitId} />
                    <ReadinessRow label="Schema" value={selectedCandidate.schema} />
                  </div>
                </>
              ) : null}

              <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
                Title
                <input
                  className="h-11 rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-[var(--status-info)]/30"
                  onChange={(event) => update({ title: event.target.value })}
                  value={form.title}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
                Description
                <textarea
                  className="min-h-36 resize-y rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3 font-mono text-xs font-normal leading-5 outline-none focus:ring-2 focus:ring-[var(--status-info)]/30"
                  onChange={(event) => update({ description: event.target.value })}
                  value={form.description}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--stroke-divider)] p-5">
              <p className="text-xs text-[var(--text-secondary)]">
                Create PR opens the review page; checks, structured diff, and merge stay there.
              </p>
              <div className="flex gap-2">
                <Button onClick={onBack} type="button" variant="canvas-outline">
                  Cancel
                </Button>
                <Button disabled={!canCreate} onClick={onCreate} type="button" variant="commit">
                  Create PR
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function CompareCandidateRow({
  active,
  candidate,
  onSelect,
}: {
  active: boolean;
  candidate: PullRequestCompareCandidate;
  onSelect: () => void;
}) {
  return (
    <button
      className={cn(
        'grid gap-2 rounded-xl border p-3 text-left transition-colors',
        active
          ? 'border-[var(--status-info)] bg-[var(--status-info)]/8'
          : 'border-[var(--stroke-divider)] bg-[var(--surface-card)] hover:bg-[var(--hover-bg)]'
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-mono text-sm font-semibold text-[var(--status-info)]">
          {candidate.branch}
        </span>
        <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{candidate.updatedAt}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
        <span>{candidate.aheadBy} ahead</span>
        <span>{candidate.behindBy} behind</span>
        <span>{candidate.yopsChanges} YOps</span>
      </div>
      <p className="line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">
        {candidate.description}
      </p>
    </button>
  );
}

function CompareMetric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{value}</p>
    </article>
  );
}

function PullRequestDetailView({
  detailTab,
  mergeError,
  merging,
  onBack,
  onChangeTab,
  onMerge,
  pullRequest,
}: {
  detailTab: PullRequestDetailTab;
  mergeError: string | null;
  merging: boolean;
  onBack: () => void;
  onChangeTab: (tab: PullRequestDetailTab) => void;
  onMerge: () => void;
  pullRequest: ProjectPullRequest;
}) {
  const checks: PullRequestCheck[] = [
    {
      id: 'source_commit',
      label: 'Source commit',
      status: 'passed',
      detail: `${pullRequest.sourceCommitId} exists on ${pullRequest.sourceBranch}.`,
    },
    {
      id: 'target_commit',
      label: 'Base commit',
      status: 'passed',
      detail: `${pullRequest.targetBaseCommitId} exists on ${pullRequest.targetBranch}.`,
    },
    {
      id: 'merge_simulation',
      label: 'Merge simulation',
      status: pullRequest.status === 'blocked' ? 'blocked' : 'pending',
      detail:
        pullRequest.status === 'blocked'
          ? 'Schema migration decision is required before deterministic merge can run.'
          : 'Runs before final merge; no workspace validation is shown here.',
    },
  ];

  return (
    <section className="h-full overflow-auto bg-[var(--surface-canvas)] p-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <Button className="w-fit" onClick={onBack} type="button" variant="ghost">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          PR workbench
        </Button>

        <section className="rounded-3xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
                  {pullRequest.title}
                </h2>
                <ReadinessBadge pullRequest={pullRequest} />
              </div>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Proposal #{pullRequest.number} · {pullRequest.author} wants to merge{' '}
                <BranchPill>{pullRequest.sourceBranch}</BranchPill> into{' '}
                <BranchPill>{pullRequest.targetBranch}</BranchPill>
              </p>
            </div>
            <Button type="button" variant="canvas-outline">
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Rerun readiness
            </Button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-b border-[var(--stroke-divider)]">
            {DETAIL_TABS.map((tab) => (
              <button
                className={cn(
                  '-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors',
                  detailTab === tab.id
                    ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                )}
                key={tab.id}
                onClick={() => onChangeTab(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="pt-5">
            {detailTab === 'overview' && <OverviewPanel pullRequest={pullRequest} />}
            {detailTab === 'structured-diff' && <StructuredDiffPanel />}
            {detailTab === 'checks' && <ChecksPanel checks={checks} />}
            {detailTab === 'activity' && <ActivityPanel pullRequest={pullRequest} />}
            {detailTab === 'merge' && (
              <MergePanel
                error={mergeError}
                merging={merging}
                onMerge={onMerge}
                pullRequest={pullRequest}
              />
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function OverviewPanel({ pullRequest }: { pullRequest: ProjectPullRequest }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-5">
        <h3 className="font-semibold text-[var(--text-primary)]">Proposal note</h3>
        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[var(--text-secondary)]">
          {pullRequest.description}
        </p>
      </div>
      <MetadataRail
        items={[
          ['Review owner', pullRequest.reviewOwner ?? 'Not requested'],
          ['Steward', pullRequest.steward ?? 'No one assigned'],
          ['Workspace', pullRequest.workspace ?? 'Not linked'],
          ['Release lane', pullRequest.releaseLane ?? 'No lane selected'],
          ['Linked work', pullRequest.linkedWork ?? 'No linked work'],
        ]}
      />
    </div>
  );
}

function StructuredDiffPanel() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {[
        ['Changed nodes', '8', 'Schema-aware field updates across proposal state.'],
        ['YOps operations', '12', 'Deterministic operations retained for review.'],
        ['Output impacts', '2', 'Downstream outputs may need regeneration after merge.'],
        ['Source refs', '4', 'Conversation and document provenance attached.'],
      ].map(([label, value, detail]) => (
        <article
          className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
          key={label}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
          <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">{detail}</p>
        </article>
      ))}
    </div>
  );
}

function ChecksPanel({ checks }: { checks: PullRequestCheck[] }) {
  return (
    <div className="grid gap-3">
      {checks.map((check) => (
        <article
          className="flex items-start gap-3 rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
          key={check.id}
        >
          <CheckIcon status={check.status} />
          <div>
            <h3 className="font-semibold text-[var(--text-primary)]">{check.label}</h3>
            <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{check.detail}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function ActivityPanel({ pullRequest }: { pullRequest: ProjectPullRequest }) {
  return (
    <div className="grid gap-3">
      {[
        ['Created', `${pullRequest.author} opened this merge proposal.`],
        ['Readiness queued', 'Merge readiness will run against source and target commits.'],
        ['Review pending', 'Reviewer decision is tracked separately from workspace validation.'],
      ].map(([label, detail]) => (
        <article className="rounded-2xl bg-[var(--surface-card)] p-4" key={label}>
          <h3 className="font-semibold text-[var(--text-primary)]">{label}</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{detail}</p>
        </article>
      ))}
    </div>
  );
}

function MergePanel({
  error,
  merging,
  onMerge,
  pullRequest,
}: {
  error: string | null;
  merging: boolean;
  onMerge: () => void;
  pullRequest: ProjectPullRequest;
}) {
  const ready = pullRequest.status === 'ready';
  const merged = pullRequest.status === 'merged';
  const title = merged ? 'Already merged' : ready ? 'Ready to merge' : 'Merge readiness required';
  const buttonLabel = merged ? 'Merged' : merging ? 'Merging...' : 'Merge PR';

  return (
    <div className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-[var(--text-primary)]">{title}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-5 text-[var(--text-secondary)]">
            {merged
              ? 'This PR has already moved to Closed after a successful deterministic merge.'
              : 'Merge is only available after deterministic merge simulation and review requirements pass. Workspace validation failures are not surfaced here; PR blockers are merge-level only.'}
          </p>
          {error ? (
            <p className="mt-3 rounded-xl border border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] px-3 py-2 text-sm text-[var(--text-secondary)]">
              {error}
            </p>
          ) : null}
        </div>
        <Button
          disabled={!ready || merging}
          onClick={onMerge}
          type="button"
          variant={ready ? 'commit' : 'canvas-outline'}
        >
          {merging ? (
            <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <PlayCircle aria-hidden="true" className="h-4 w-4" />
          )}
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}

function BranchSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
      {label ? `${label}:` : null}
      <select
        className="h-10 rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--status-info)]/30"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function BranchPill({ children }: { children: string }) {
  return (
    <span className="inline-flex rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2 py-0.5 font-mono text-xs text-[var(--text-primary)]">
      {children}
    </span>
  );
}

function ReadinessBadge({ pullRequest }: { pullRequest: ProjectPullRequest }) {
  const variant =
    pullRequest.readinessTone === 'success'
      ? 'branch'
      : pullRequest.readinessTone === 'warning'
        ? 'warning'
        : pullRequest.readinessTone === 'pending'
          ? 'pending'
          : 'secondary';

  return <Badge variant={variant}>{pullRequest.readinessLabel}</Badge>;
}

function ReadinessRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-[var(--surface-card)] px-4 py-3 text-sm">
      <span className="font-semibold text-[var(--text-primary)]">{label}</span>
      <span className="font-semibold text-[var(--status-success)]">{value}</span>
    </div>
  );
}

function MetadataRail({ items }: { items: Array<[string, string]> }) {
  return (
    <aside className="grid content-start gap-3">
      {items.map(([label, value]) => (
        <section
          className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4 shadow-sm"
          key={label}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{label}</h3>
            <UserRound aria-hidden="true" className="h-4 w-4 text-[var(--text-tertiary)]" />
          </div>
          <p className="text-sm leading-5 text-[var(--text-secondary)]">{value}</p>
        </section>
      ))}
    </aside>
  );
}

function CheckIcon({ status }: { status: PullRequestCheck['status'] }) {
  if (status === 'passed') {
    return (
      <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 text-[var(--status-success)]" />
    );
  }

  if (status === 'blocked') {
    return <RefreshCw aria-hidden="true" className="mt-0.5 h-5 w-5 text-[var(--status-warning)]" />;
  }

  return <RefreshCw aria-hidden="true" className="mt-0.5 h-5 w-5 text-[var(--status-info)]" />;
}
