'use client';

import {
  ArrowLeft,
  CheckCircle2,
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
type PullRequestListMode = 'active' | 'merged';
type PullRequestView = 'list' | 'create' | 'detail';
type PullRequestDetailTab = 'overview' | 'structured-diff' | 'checks' | 'activity' | 'merge';

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
const COMPARE_BRANCHES = [
  'workspace/audience-handoff',
  'schema/prd-v3',
  'outputs/bundle-refresh',
  'docs/limitations-copy',
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

export function ProjectReviewsTab({ projectId }: { projectId?: string } = {}) {
  const { createPullRequest: createProjectPullRequest, fetchPullRequests } =
    useProjectPullRequestsApi();
  const [pullRequests, setPullRequests] = useState(INITIAL_PULL_REQUESTS);
  const [mode, setMode] = useState<PullRequestListMode>('active');
  const [view, setView] = useState<PullRequestView>('list');
  const [selectedId, setSelectedId] = useState(INITIAL_PULL_REQUESTS[0]?.id ?? '');
  const [detailTab, setDetailTab] = useState<PullRequestDetailTab>('overview');
  const [query, setQuery] = useState('status:active type:pr');
  const [createForm, setCreateForm] = useState({
    title: 'Audience handoff updates',
    description:
      '## Summary\n- Update workspace handoff content before merge.\n- Keep validation in workspace flow; PR merge checks only confirm merge readiness.\n- Review structured diff and metadata before merging into main.',
    sourceBranch: 'workspace/audience-handoff',
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

  const activePullRequests = pullRequests.filter((item) =>
    ['draft', 'open', 'ready', 'blocked'].includes(item.status)
  );
  const mergedPullRequests = pullRequests.filter((item) =>
    ['merged', 'closed'].includes(item.status)
  );
  const selectedPullRequest =
    pullRequests.find((item) => item.id === selectedId) ?? activePullRequests[0] ?? pullRequests[0];

  const visiblePullRequests = useMemo(() => {
    const source = mode === 'active' ? activePullRequests : mergedPullRequests;
    const normalized = query
      .toLowerCase()
      .replace(/status:(active|open|merged|closed)/g, '')
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
  }, [activePullRequests, mergedPullRequests, mode, query]);

  const openPullRequest = (pullRequest: ProjectPullRequest) => {
    setSelectedId(pullRequest.id);
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
    setMode('active');
    setDetailTab('checks');
    setView('detail');
    return next;
  };

  const createPullRequest = () => {
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
        setMode('active');
        setDetailTab('checks');
        setView('detail');
        setApiError(null);
      })
      .catch((err) => {
        setApiError(err instanceof Error ? err.message : 'Could not create pull request');
        createLocalPullRequest();
      });
  };

  if (view === 'create') {
    return (
      <PullRequestCreateView
        form={createForm}
        onBack={() => setView('list')}
        onChange={setCreateForm}
        onCreate={createPullRequest}
      />
    );
  }

  if (view === 'detail' && selectedPullRequest) {
    return (
      <PullRequestDetailView
        detailTab={detailTab}
        onBack={() => setView('list')}
        onChangeTab={setDetailTab}
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
                active={mode === 'active'}
                count={activePullRequests.length}
                label="Active proposals"
                onClick={() => {
                  setMode('active');
                  setQuery('status:active type:pr');
                }}
              />
              <ModeButton
                active={mode === 'merged'}
                count={mergedPullRequests.length}
                label="Merged archive"
                onClick={() => {
                  setMode('merged');
                  setQuery('status:merged type:pr');
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
  onOpen,
  pullRequest,
}: {
  onOpen: () => void;
  pullRequest: ProjectPullRequest;
}) {
  return (
    <article className="grid gap-4 rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4 shadow-sm sm:grid-cols-[6px_minmax(0,1fr)_auto]">
      <div aria-hidden="true" className="hidden rounded-full bg-[var(--status-info)] sm:block" />
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="truncate text-base font-semibold text-[var(--text-primary)]">
            {pullRequest.title}
          </h3>
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
  form,
  onBack,
  onChange,
  onCreate,
}: {
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
}) {
  const update = (patch: Partial<typeof form>) => onChange({ ...form, ...patch });

  return (
    <section className="h-full overflow-auto bg-[var(--surface-canvas)] p-4">
      <div className="mx-auto grid w-full max-w-6xl gap-4">
        <Button className="w-fit" onClick={onBack} type="button" variant="ghost">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          PR workbench
        </Button>

        <section className="rounded-3xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-6 shadow-sm">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
            Compose merge proposal
          </h2>
          <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">
            Choose the source and target branches, describe the intent, then open a PR for review
            and merge readiness.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4">
            <BranchSelect
              label="base"
              onChange={(targetBranch) => update({ targetBranch })}
              options={BASE_BRANCHES}
              value={form.targetBranch}
            />
            <span className="text-sm text-[var(--text-tertiary)]">← compare:</span>
            <BranchSelect
              label=""
              onChange={(sourceBranch) => update({ sourceBranch })}
              options={COMPARE_BRANCHES}
              value={form.sourceBranch}
            />
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[var(--status-success)]/10 p-4 text-sm text-[var(--text-secondary)]">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-[var(--status-success)]" />
            <strong className="text-[var(--text-primary)]">2 commits ahead</strong>
            <span>
              Source and target commits are valid. Merge readiness runs after the PR opens.
            </span>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-3xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--stroke-divider)] p-5">
              <h3 className="font-semibold text-[var(--text-primary)]">Proposal note</h3>
              <Badge variant="secondary">Draft allowed</Badge>
            </div>
            <div className="grid gap-4 p-5">
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

              <div className="grid gap-2">
                <ReadinessRow label="Source commit" value="Valid" />
                <ReadinessRow label="Base commit" value="Valid" />
                <ReadinessRow label="Merge checks" value="Runs after creation" />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--stroke-divider)] p-5">
              <p className="text-xs text-[var(--text-secondary)]">
                After creation, the PR page owns review, checks, structured diff, and final merge.
              </p>
              <div className="flex gap-2">
                <Button onClick={onBack} type="button" variant="canvas-outline">
                  Cancel
                </Button>
                <Button onClick={onCreate} type="button" variant="commit">
                  Create PR
                </Button>
              </div>
            </div>
          </section>

          <MetadataRail
            items={[
              ['Review owner', 'Suggested · Request Iris Zhang'],
              ['Steward', 'No one — take ownership'],
              ['Tags', 'None yet'],
              ['Workspace', 'Product foundation'],
              ['Release lane', 'No lane selected'],
              ['Linked work', 'Merging this PR may close linked workspace tasks.'],
            ]}
          />
        </div>
      </div>
    </section>
  );
}

function PullRequestDetailView({
  detailTab,
  onBack,
  onChangeTab,
  pullRequest,
}: {
  detailTab: PullRequestDetailTab;
  onBack: () => void;
  onChangeTab: (tab: PullRequestDetailTab) => void;
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
            {detailTab === 'merge' && <MergePanel pullRequest={pullRequest} />}
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

function MergePanel({ pullRequest }: { pullRequest: ProjectPullRequest }) {
  const ready = pullRequest.status === 'ready';

  return (
    <div className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-[var(--text-primary)]">
            {ready ? 'Ready to merge' : 'Merge readiness required'}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-5 text-[var(--text-secondary)]">
            Merge is only available after deterministic merge simulation and review requirements
            pass. Workspace validation failures are not surfaced here; PR blockers are merge-level
            only.
          </p>
        </div>
        <Button disabled={!ready} type="button" variant={ready ? 'commit' : 'canvas-outline'}>
          <PlayCircle aria-hidden="true" className="h-4 w-4" />
          Merge PR
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
