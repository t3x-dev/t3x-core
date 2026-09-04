'use client';

import {
  ArrowLeft,
  GitBranch,
  GitPullRequestArrow,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  ApiProjectPullRequest,
  ApiProjectPullRequestActivity,
  ApiProjectPullRequestCheck,
  ApiProjectPullRequestDetail,
} from '@/hooks/projects/useProjectPullRequestsApi';
import { useProjectPullRequestsApi } from '@/hooks/projects/useProjectPullRequestsApi';
import { cn } from '@/utils/cn';

type PullRequestStatus = 'draft' | 'open' | 'checking' | 'ready' | 'blocked' | 'merged' | 'closed';
type PullRequestListMode = 'open' | 'closed';
type PullRequestView = 'list' | 'create' | 'detail';
type PullRequestDetailTab = 'overview' | 'structured-diff' | 'checks' | 'activity' | 'merge';
type PullRequestCompareStatus = 'ready' | 'already_open' | 'no_changes' | 'base_empty';

interface ProjectPullRequest {
  id: string;
  number: number;
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
  sourceCommitId: string;
  targetBaseCommitId: string;
  mergeDraftId?: string;
  mergeCommitId?: string;
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
  checks?: PullRequestCheck[];
  activity?: PullRequestActivity[];
  diffSummary?: PullRequestDiffSummary;
}

interface PullRequestCheck {
  id: string;
  label: string;
  status: ApiProjectPullRequestCheck['status'];
  detail: string;
}

interface PullRequestActivity {
  id: string;
  label: string;
  detail: string;
  createdAt: string;
}

interface PullRequestDiffSummary {
  changedNodes: number;
  yopsOperations: number;
  outputImpacts: number;
  sourceRefs: number;
}

interface PullRequestCompareCandidate {
  id: string;
  branch: string;
  baseBranch: string;
  title: string;
  description: string;
  headCommitId: string;
  baseCommitId: string | null;
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
  base_commit_id: string | null;
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
    description: 'Open the schema rollout PR so review can decide migration coverage before merge.',
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
    description: 'Move audience handoff state into a reviewable PR before main branch merge.',
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
    statusLabel: 'Available',
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
    statusLabel: 'Available',
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
    statusLabel: 'Available',
    openPullRequestNumber: null,
  },
];

function toProjectPullRequest(api: ApiProjectPullRequest): ProjectPullRequest {
  const readiness =
    api.status === 'ready'
      ? ({ label: 'ready to merge', tone: 'success' } as const)
      : api.status === 'blocked'
        ? ({ label: 'needs decision', tone: 'warning' } as const)
        : api.status === 'checking'
          ? ({ label: 'checking', tone: 'pending' } as const)
          : api.status === 'draft'
            ? ({ label: 'draft', tone: 'muted' } as const)
            : api.status === 'merged'
              ? ({ label: 'merged', tone: 'success' } as const)
              : api.status === 'closed'
                ? ({ label: 'closed', tone: 'muted' } as const)
                : ({ label: 'checks queued', tone: 'pending' } as const);

  return {
    author: api.author_id,
    description: api.description,
    id: api.id,
    linkedWork: api.linked_work ?? undefined,
    mergeCommitId: api.merge_commit_id ?? undefined,
    mergeDraftId: api.merge_draft_id ?? undefined,
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

const ACTIVITY_LABELS: Record<ApiProjectPullRequestActivity['type'], string> = {
  created: 'Created',
  description_updated: 'Description updated',
  status_changed: 'Status changed',
  checks_reran: 'Readiness rerun',
  commented: 'Commented',
  base_updated: 'Base updated',
  merged: 'Merged',
  closed: 'Closed',
};

function toProjectPullRequestDetail(api: ApiProjectPullRequestDetail): ProjectPullRequest {
  return {
    ...toProjectPullRequest(api),
    activity: api.activity.map((item) => ({
      createdAt: new Date(item.created_at).toLocaleString(),
      detail: item.message,
      id: item.id,
      label: ACTIVITY_LABELS[item.type],
    })),
    checks: api.checks.map((check) => ({
      detail: check.message ?? 'No additional details.',
      id: check.id,
      label: check.title,
      status: check.status,
    })),
    diffSummary: {
      changedNodes: api.diff_summary.changed_nodes,
      outputImpacts: api.diff_summary.output_impacts,
      sourceRefs: api.diff_summary.source_refs,
      yopsOperations: api.diff_summary.yops_operations,
    },
  };
}

function withLocalPullRequestDetail(
  pullRequest: ProjectPullRequest,
  candidate?: PullRequestCompareCandidate
): ProjectPullRequest {
  const mergeStatus =
    pullRequest.status === 'ready' || pullRequest.status === 'merged'
      ? 'passed'
      : pullRequest.status === 'blocked'
        ? 'blocked'
        : pullRequest.status === 'closed'
          ? 'warning'
          : 'pending';
  const activity: PullRequestActivity[] = [
    {
      createdAt: pullRequest.updatedAt,
      detail: `${pullRequest.author} opened this pull request.`,
      id: `${pullRequest.id}:activity:created`,
      label: 'Created',
    },
  ];
  if (pullRequest.status === 'merged') {
    activity.push({
      createdAt: pullRequest.updatedAt,
      detail: 'Pull request merged through deterministic merge.',
      id: `${pullRequest.id}:activity:merged`,
      label: 'Merged',
    });
  } else if (pullRequest.status === 'closed') {
    activity.push({
      createdAt: pullRequest.updatedAt,
      detail: 'Pull request closed without merging.',
      id: `${pullRequest.id}:activity:closed`,
      label: 'Closed',
    });
  }

  return {
    ...pullRequest,
    activity,
    checks: [
      {
        detail: `${pullRequest.sourceCommitId} exists on ${pullRequest.sourceBranch}.`,
        id: `${pullRequest.id}:check:source`,
        label: 'Source commit',
        status: 'passed',
      },
      {
        detail: `${pullRequest.targetBaseCommitId} exists on ${pullRequest.targetBranch}.`,
        id: `${pullRequest.id}:check:target`,
        label: 'Target commit',
        status: 'passed',
      },
      {
        detail:
          mergeStatus === 'blocked'
            ? 'A merge-level decision is still required.'
            : mergeStatus === 'warning'
              ? 'Pull request closed before merge simulation completed.'
              : 'Deterministic merge simulation reflects the current PR status.',
        id: `${pullRequest.id}:check:merge`,
        label: 'Merge simulation',
        status: mergeStatus,
      },
    ],
    diffSummary: {
      changedNodes: candidate?.changedNodes ?? 0,
      outputImpacts: candidate?.outputImpacts ?? 0,
      sourceRefs: candidate?.sourceRefs ?? 0,
      yopsOperations: candidate?.yopsChanges ?? 0,
    },
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
    closePullRequest: closeProjectPullRequest,
    createPullRequest: createProjectPullRequest,
    fetchCompareCandidates,
    fetchPullRequest: fetchProjectPullRequest,
    fetchPullRequests,
    mergePullRequest: mergeProjectPullRequest,
    rerunReadiness: rerunProjectPullRequestReadiness,
  } = useProjectPullRequestsApi();
  const [pullRequests, setPullRequests] = useState(() => (projectId ? [] : INITIAL_PULL_REQUESTS));
  const [baseBranches, setBaseBranches] = useState(() => (projectId ? [] : BASE_BRANCHES));
  const [compareCandidates, setCompareCandidates] = useState(() =>
    projectId ? [] : INITIAL_COMPARE_CANDIDATES
  );
  const [mode, setMode] = useState<PullRequestListMode>('open');
  const [view, setView] = useState<PullRequestView>('list');
  const [selectedId, setSelectedId] = useState(INITIAL_PULL_REQUESTS[0]?.id ?? '');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<PullRequestDetailTab>('overview');
  const [query, setQuery] = useState('');
  const [closeConfirmId, setCloseConfirmId] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [rerunningId, setRerunningId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareRefreshKey, setCompareRefreshKey] = useState(0);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState(() => ({
    title: projectId ? '' : 'Output bundle refresh',
    description: projectId
      ? ''
      : '## Summary\n- Refresh generated output bundle state after release-note source changes.\n- Review structured diff and output impact before merging into main.\n- Merge readiness runs after the PR opens.',
    sourceBranch: projectId ? '' : 'outputs/bundle-refresh',
    targetBranch: 'main',
  }));
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
    if (!projectId || view !== 'create') return;

    let cancelled = false;
    setApiError(null);
    setCompareCandidates([]);
    setCompareLoading(true);
    fetchCompareCandidates(projectId, createForm.targetBranch)
      .then((data) => {
        if (cancelled) return;
        setBaseBranches(data.base_branches);
        if (!data.base_branches.includes(createForm.targetBranch)) {
          const nextBaseBranch = data.base_branches[0];
          setCompareCandidates([]);
          if (nextBaseBranch) {
            setCreateForm((form) => ({
              ...form,
              sourceBranch: '',
              targetBranch: nextBaseBranch,
            }));
          }
          return;
        }
        const mappedCandidates = data.compare_branches.map(toCompareCandidate);
        setCompareCandidates(mappedCandidates);
      })
      .catch((err) => {
        if (!cancelled) {
          setApiError(err instanceof Error ? err.message : 'Could not load comparable branches');
        }
      })
      .finally(() => {
        if (!cancelled) setCompareLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [compareRefreshKey, createForm.targetBranch, fetchCompareCandidates, projectId, view]);

  useEffect(() => {
    if (!projectId) return;

    const refreshForProject = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      if (!('projectId' in payload) || payload.projectId !== projectId) return;
      setCompareRefreshKey((key) => key + 1);
    };
    const handleWindowCommit = (event: Event) => {
      refreshForProject((event as CustomEvent<unknown>).detail);
    };
    const handleWindowFocus = (event: FocusEvent) => {
      if (event.target !== window) return;
      setCompareRefreshKey((key) => key + 1);
    };

    window.addEventListener('t3x:commit-created', handleWindowCommit);
    window.addEventListener('focus', handleWindowFocus);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('t3x-commits');
      channel.onmessage = (event: MessageEvent<unknown>) => refreshForProject(event.data);
    }

    return () => {
      window.removeEventListener('t3x:commit-created', handleWindowCommit);
      window.removeEventListener('focus', handleWindowFocus);
      channel?.close();
    };
  }, [projectId]);

  const openPullRequests = pullRequests.filter((item) =>
    ['draft', 'open', 'checking', 'ready', 'blocked'].includes(item.status)
  );
  const closedPullRequests = pullRequests.filter((item) =>
    ['merged', 'closed'].includes(item.status)
  );
  const selectedPullRequest =
    pullRequests.find((item) => item.id === selectedId) ?? openPullRequests[0] ?? pullRequests[0];

  const visiblePullRequests = useMemo(() => {
    const source = mode === 'open' ? openPullRequests : closedPullRequests;
    const normalized = query.toLowerCase().trim();
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

  const visibleCompareCandidates = useMemo(
    () =>
      compareCandidates.filter(
        (candidate) =>
          candidate.baseBranch === createForm.targetBranch &&
          candidate.branch !== createForm.targetBranch
      ),
    [compareCandidates, createForm.targetBranch]
  );
  const availableCompareCandidates = useMemo(
    () =>
      visibleCompareCandidates.filter(
        (candidate) => candidate.status === 'ready' && candidate.aheadBy > 0
      ),
    [visibleCompareCandidates]
  );
  const selectedCompareCandidate =
    visibleCompareCandidates.find(
      (candidate) =>
        candidate.branch === createForm.sourceBranch &&
        candidate.baseBranch === createForm.targetBranch
    ) ??
    availableCompareCandidates[0] ??
    visibleCompareCandidates[0] ??
    null;
  const canCreatePullRequest = Boolean(
    !compareLoading &&
      selectedCompareCandidate?.status === 'ready' &&
      Boolean(selectedCompareCandidate.baseCommitId) &&
      selectedCompareCandidate.aheadBy > 0 &&
      selectedCompareCandidate.branch === createForm.sourceBranch &&
      selectedCompareCandidate.baseBranch === createForm.targetBranch
  );

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
    setCloseConfirmId(null);
    setCloseError(null);
    setMergeError(null);
    setReadinessError(null);
    setDetailError(null);
    setDetailTab('overview');
    setView('detail');

    if (!projectId) {
      const candidate = compareCandidates.find(
        (item) =>
          item.branch === pullRequest.sourceBranch && item.baseBranch === pullRequest.targetBranch
      );
      const detailed = withLocalPullRequestDetail(pullRequest, candidate);
      setPullRequests((items) => items.map((item) => (item.id === detailed.id ? detailed : item)));
      return;
    }

    setDetailLoadingId(pullRequest.id);
    fetchProjectPullRequest(projectId, pullRequest.number)
      .then((detail) => {
        const mapped = toProjectPullRequestDetail(detail);
        setPullRequests((items) => items.map((item) => (item.id === mapped.id ? mapped : item)));
      })
      .catch((err) => {
        setDetailError(err instanceof Error ? err.message : 'Could not load pull request details.');
      })
      .finally(() => {
        setDetailLoadingId(null);
      });
  };

  const markCompareCandidateOpened = (
    sourceBranch: string,
    targetBranch: string,
    number: number
  ) => {
    setCompareCandidates((items) =>
      items.map((candidate) =>
        candidate.branch === sourceBranch && candidate.baseBranch === targetBranch
          ? {
              ...candidate,
              openPullRequestNumber: number,
              status: 'already_open',
              statusLabel: `PR #${number} already open`,
            }
          : candidate
      )
    );
  };

  const createLocalPullRequest = () => {
    const nextNumber = Math.max(0, ...pullRequests.map((item) => item.number)) + 1;
    const nowLabel = 'created just now';
    const next: ProjectPullRequest = {
      id: `pr_${nextNumber}`,
      number: nextNumber,
      title: createForm.title.trim() || 'Untitled pull request',
      description: createForm.description,
      sourceBranch: createForm.sourceBranch,
      targetBranch: createForm.targetBranch,
      sourceCommitId: 'sha:pending',
      targetBaseCommitId: 'sha:6de18a0',
      status: 'open',
      author: 'You',
      readinessLabel: 'checks queued',
      readinessTone: 'pending',
      updatedAt: nowLabel,
    };

    setPullRequests((items) => [next, ...items]);
    markCompareCandidateOpened(next.sourceBranch, next.targetBranch, next.number);
    setSelectedId(next.id);
    setHighlightedId(next.id);
    setMode('open');
    setQuery('');
    setView('list');
    return next;
  };

  const createPullRequest = () => {
    if (!canCreatePullRequest || creating || !selectedCompareCandidate?.baseCommitId) return;

    if (!projectId) {
      createLocalPullRequest();
      return;
    }

    setCreating(true);
    setApiError(null);
    createProjectPullRequest(projectId, {
      description: createForm.description,
      expected_source_commit_id: selectedCompareCandidate.headCommitId,
      expected_target_commit_id: selectedCompareCandidate.baseCommitId,
      source_branch: selectedCompareCandidate.branch,
      target_branch: selectedCompareCandidate.baseBranch,
      title: createForm.title.trim() || 'Untitled pull request',
    })
      .then((created) => {
        const mapped = toProjectPullRequestDetail(created);
        setPullRequests((items) => [mapped, ...items]);
        markCompareCandidateOpened(mapped.sourceBranch, mapped.targetBranch, mapped.number);
        setSelectedId(mapped.id);
        setHighlightedId(mapped.id);
        setMode('open');
        setQuery('');
        setView('list');
        setApiError(null);
      })
      .catch((err) => {
        setApiError(err instanceof Error ? err.message : 'Could not create pull request');
      })
      .finally(() => {
        setCreating(false);
      });
  };

  const showFinishedPullRequest = (finished: ProjectPullRequest) => {
    setPullRequests((items) =>
      items.map((item) =>
        item.id === finished.id || item.number === finished.number ? finished : item
      )
    );
    setSelectedId(finished.id);
    setHighlightedId(finished.id);
    setMode('closed');
    setQuery('');
    setCloseConfirmId(null);
    setCloseError(null);
    setMergeError(null);
    setReadinessError(null);
    setView('list');
  };

  const mergePullRequest = (pullRequest: ProjectPullRequest) => {
    if (pullRequest.status !== 'ready' || mergingId) return;

    setMergingId(pullRequest.id);
    setMergeError(null);

    if (!projectId) {
      showFinishedPullRequest({
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
        showFinishedPullRequest(toProjectPullRequestDetail(merged));
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

  const closePullRequest = (pullRequest: ProjectPullRequest) => {
    if (['merged', 'closed'].includes(pullRequest.status) || closingId) return;

    if (closeConfirmId !== pullRequest.id) {
      setCloseConfirmId(pullRequest.id);
      setCloseError(null);
      return;
    }

    setClosingId(pullRequest.id);
    setCloseError(null);

    if (!projectId) {
      showFinishedPullRequest({
        ...pullRequest,
        readinessLabel: 'closed',
        readinessTone: 'muted',
        status: 'closed',
        updatedAt: 'closed just now',
      });
      setClosingId(null);
      return;
    }

    closeProjectPullRequest(projectId, { number: pullRequest.number })
      .then((closed) => {
        showFinishedPullRequest(toProjectPullRequest(closed));
      })
      .catch((err) => {
        setCloseError(
          err instanceof Error ? err.message : 'Could not close this pull request without merging.'
        );
      })
      .finally(() => {
        setClosingId(null);
      });
  };

  const rerunReadiness = (pullRequest: ProjectPullRequest) => {
    if (!['open', 'ready', 'blocked'].includes(pullRequest.status) || rerunningId) return;

    setRerunningId(pullRequest.id);
    setReadinessError(null);

    if (!projectId) {
      const nextStatus = pullRequest.status === 'open' ? 'ready' : pullRequest.status;
      const next: ProjectPullRequest = {
        ...pullRequest,
        readinessLabel: nextStatus === 'ready' ? 'ready to merge' : pullRequest.readinessLabel,
        readinessTone: nextStatus === 'ready' ? 'success' : pullRequest.readinessTone,
        status: nextStatus,
        updatedAt: 'readiness checked just now',
      };
      const candidate = compareCandidates.find(
        (item) => item.branch === next.sourceBranch && item.baseBranch === next.targetBranch
      );
      const detailed = withLocalPullRequestDetail(next, candidate);
      detailed.activity = [
        ...(pullRequest.activity ?? detailed.activity ?? []),
        {
          createdAt: 'just now',
          detail: 'Merge readiness checks rerun.',
          id: `${pullRequest.id}:activity:rerun`,
          label: 'Readiness rerun',
        },
      ];
      setPullRequests((items) => items.map((item) => (item.id === detailed.id ? detailed : item)));
      setRerunningId(null);
      return;
    }

    rerunProjectPullRequestReadiness(projectId, { number: pullRequest.number })
      .then((updated) => {
        const mapped = toProjectPullRequestDetail(updated);
        setPullRequests((items) => items.map((item) => (item.id === mapped.id ? mapped : item)));
      })
      .catch((err) => {
        setReadinessError(
          err instanceof Error ? err.message : 'Could not rerun pull request readiness.'
        );
      })
      .finally(() => {
        setRerunningId(null);
      });
  };

  if (view === 'create') {
    return (
      <PullRequestCreateView
        baseBranches={baseBranches}
        canCreate={canCreatePullRequest}
        candidates={visibleCompareCandidates}
        compareLoading={compareLoading}
        creating={creating}
        error={apiError}
        form={createForm}
        onBack={() => setView('list')}
        onChange={setCreateForm}
        onCreate={createPullRequest}
        onRefresh={() => setCompareRefreshKey((key) => key + 1)}
        selectedCandidate={selectedCompareCandidate}
      />
    );
  }

  if (view === 'detail' && selectedPullRequest) {
    return (
      <PullRequestDetailView
        closeConfirmationActive={closeConfirmId === selectedPullRequest.id}
        closeError={closeError}
        closing={closingId === selectedPullRequest.id}
        detailError={detailError}
        detailLoading={detailLoadingId === selectedPullRequest.id}
        detailTab={detailTab}
        mergeError={mergeError}
        merging={mergingId === selectedPullRequest.id}
        onBack={() => setView('list')}
        onClose={() => closePullRequest(selectedPullRequest)}
        onChangeTab={setDetailTab}
        onMerge={() => mergePullRequest(selectedPullRequest)}
        onRerun={() => rerunReadiness(selectedPullRequest)}
        pullRequest={selectedPullRequest}
        readinessError={readinessError}
        rerunning={rerunningId === selectedPullRequest.id}
      />
    );
  }

  return (
    <section className="grid h-full min-h-0 overflow-hidden bg-[var(--surface-app)] min-[1121px]:grid-cols-[210px_minmax(0,1fr)]">
      <ReviewsQueueRail
        closedCount={closedPullRequests.length}
        mode={mode}
        onCreate={() => {
          setApiError(null);
          setView('create');
        }}
        onModeChange={(nextMode) => {
          setMode(nextMode);
          setQuery('');
        }}
        onOpenPullRequest={openPullRequest}
        openCount={openPullRequests.length}
        pullRequests={pullRequests}
      />
      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--surface-panel)]">
        <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-3 py-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold leading-tight text-[var(--text-primary)]">
              Pull requests
            </h2>
            <p className="sr-only">Review branch changes and merge structured state.</p>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <label className="relative block h-8 min-w-[220px] max-w-[420px] flex-1 overflow-hidden rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-card)] shadow-[var(--fx-shadow-sm)]">
              <Search
                aria-hidden="true"
                className="-translate-y-1/2 absolute top-1/2 left-2.5 h-3.5 w-3.5 text-[var(--text-tertiary)]"
              />
              <input
                aria-label="Search pull requests"
                className="h-full w-full bg-transparent pr-3 pl-8 text-xs font-medium text-[var(--text-primary)] outline-none placeholder:font-normal placeholder:text-[var(--text-tertiary)] focus:ring-2 focus:ring-inset focus:ring-[var(--accent-commit)]/30"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title, branch, or author"
                value={query}
              />
            </label>
            <Button
              className="h-8 px-3 text-xs font-semibold"
              onClick={() => {
                setApiError(null);
                setView('create');
              }}
              size="sm"
              type="button"
              variant="branch"
            >
              Create PR
            </Button>
          </div>
        </header>

        {apiError ? (
          <div className="mx-3 mt-2 rounded-[5px] border border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            Could not load pull requests: {apiError}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
          <div className="overflow-hidden rounded-[6px] border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-[var(--fx-shadow-sm)]">
            {visiblePullRequests.length > 0 ? (
              visiblePullRequests.map((pullRequest) => (
                <PullRequestRow
                  highlighted={pullRequest.id === highlightedId}
                  key={pullRequest.id}
                  onOpen={() => openPullRequest(pullRequest)}
                  pullRequest={pullRequest}
                />
              ))
            ) : (
              <section className="px-6 py-10 text-center">
                <h3 className="font-semibold text-[var(--text-primary)]">No pull requests found</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {query
                    ? 'Try a different title, branch, or author.'
                    : `There are no ${mode} pull requests in this project.`}
                </p>
              </section>
            )}
          </div>
        </div>
      </main>
    </section>
  );
}

function ReviewsQueueRail({
  closedCount,
  mode,
  onCreate,
  onModeChange,
  onOpenPullRequest,
  openCount,
  pullRequests,
}: {
  closedCount: number;
  mode: PullRequestListMode;
  onCreate: () => void;
  onModeChange: (mode: PullRequestListMode) => void;
  onOpenPullRequest: (pullRequest: ProjectPullRequest) => void;
  openCount: number;
  pullRequests: ProjectPullRequest[];
}) {
  const readyCount = pullRequests.filter((item) => item.status === 'ready').length;
  const blockedCount = pullRequests.filter((item) => item.status === 'blocked').length;
  const checkingCount = pullRequests.filter((item) =>
    ['draft', 'open', 'checking'].includes(item.status)
  ).length;
  const latestPullRequests = pullRequests
    .filter((item) =>
      mode === 'open'
        ? ['draft', 'open', 'checking', 'ready', 'blocked'].includes(item.status)
        : ['merged', 'closed'].includes(item.status)
    )
    .slice(0, 4);

  return (
    <aside
      aria-label="Review queue"
      className="hidden min-h-0 flex-col border-r border-[var(--stroke-divider)] bg-[var(--surface-card)] min-[1121px]:flex"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-2 py-2">
        <section className="grid gap-1" aria-labelledby="review-queue-heading">
          <div className="flex h-7 items-center justify-between px-1">
            <h3
              className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]"
              id="review-queue-heading"
            >
              Queue
            </h3>
          </div>
          <ModeButton
            active={mode === 'open'}
            className="w-full justify-start"
            count={openCount}
            label="Open"
            onClick={() => onModeChange('open')}
          />
          <ModeButton
            active={mode === 'closed'}
            className="w-full justify-start"
            count={closedCount}
            label="Closed"
            onClick={() => onModeChange('closed')}
          />
        </section>

        <section className="grid gap-1.5" aria-label="Review readiness">
          <ReviewRailMetric label="Ready" tone="success" value={readyCount} />
          <ReviewRailMetric label="Blocked" tone="warning" value={blockedCount} />
          <ReviewRailMetric label="Checking" tone="pending" value={checkingCount} />
        </section>

        <section className="grid gap-1.5" aria-labelledby="review-latest-heading">
          <h3
            className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]"
            id="review-latest-heading"
          >
            Latest
          </h3>
          {latestPullRequests.length > 0 ? (
            latestPullRequests.map((pullRequest) => (
              <button
                className="group grid gap-1 rounded-[6px] border border-transparent px-2 py-2 text-left transition-colors hover:border-[var(--stroke-divider)] hover:bg-[var(--hover-bg)]"
                key={pullRequest.id}
                onClick={() => onOpenPullRequest(pullRequest)}
                type="button"
              >
                <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
                  {pullRequest.title}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
                  <span className="font-mono">#{pullRequest.number}</span>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{pullRequest.readinessLabel}</span>
                </span>
              </button>
            ))
          ) : (
            <p className="rounded-[6px] bg-[var(--surface-app)] px-2 py-2 text-xs leading-5 text-[var(--text-tertiary)]">
              No {mode} PRs.
            </p>
          )}
        </section>

        <Button
          className="mt-auto h-7 rounded-[5px] px-2.5 text-xs font-semibold shadow-[var(--fx-shadow-sm)]"
          onClick={onCreate}
          size="sm"
          type="button"
          variant="branch"
        >
          New PR
        </Button>
      </div>
    </aside>
  );
}

function ReviewRailMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'pending' | 'success' | 'warning';
  value: number;
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-[var(--status-success)]/10 text-[var(--status-success)]'
      : tone === 'warning'
        ? 'bg-[var(--status-warning)]/12 text-[var(--status-warning)]'
        : 'bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]';

  return (
    <div className="flex h-8 items-center justify-between rounded-[6px] bg-[var(--surface-app)] px-2 text-xs">
      <span className="font-medium text-[var(--text-secondary)]">{label}</span>
      <span className={cn('rounded-[4px] px-1.5 py-0.5 font-mono font-semibold', toneClass)}>
        {value}
      </span>
    </div>
  );
}

function ModeButton({
  active,
  className,
  count,
  label,
  onClick,
}: {
  active: boolean;
  className?: string;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-[5px] px-2.5 text-sm font-semibold transition-colors',
        active
          ? 'bg-[var(--accent-commit)] text-[var(--on-accent)] shadow-[var(--fx-shadow-sm)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]',
        className
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
        'grid gap-3 border-b border-[var(--stroke-divider)] px-3 py-3 transition-colors last:border-b-0 sm:grid-cols-[4px_minmax(0,1fr)_auto]',
        highlighted ? 'bg-[var(--accent-commit-soft)]' : 'hover:bg-[var(--hover-bg)]'
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          'hidden rounded-[4px] sm:block',
          highlighted ? 'bg-[var(--status-success)]' : 'bg-[var(--accent-commit)]'
        )}
      />
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {pullRequest.title}
          </h3>
          {highlighted ? (
            <Badge variant="branch">
              {pullRequest.status === 'merged'
                ? 'Just merged'
                : pullRequest.status === 'closed'
                  ? 'Just closed'
                  : 'New'}
            </Badge>
          ) : null}
          <ReadinessBadge pullRequest={pullRequest} />
        </div>
        <p className="mt-1.5 text-xs leading-5 text-[var(--text-secondary)]">
          PR #{pullRequest.number} · {pullRequest.author} ·{' '}
          <BranchPill>{pullRequest.sourceBranch}</BranchPill> →{' '}
          <BranchPill>{pullRequest.targetBranch}</BranchPill> · {pullRequest.updatedAt}
        </p>
      </div>
      <div className="flex items-center">
        <Button
          className="h-7 rounded-[5px] px-2.5 text-xs font-medium shadow-[var(--fx-shadow-sm)]"
          onClick={onOpen}
          size="sm"
          type="button"
          variant="canvas-outline"
        >
          View PR
        </Button>
      </div>
    </article>
  );
}

function PullRequestCreateView({
  baseBranches,
  canCreate,
  candidates,
  compareLoading,
  creating,
  error,
  form,
  onBack,
  onChange,
  onCreate,
  onRefresh,
  selectedCandidate,
}: {
  baseBranches: string[];
  canCreate: boolean;
  candidates: PullRequestCompareCandidate[];
  compareLoading: boolean;
  creating: boolean;
  error: string | null;
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
  onRefresh: () => void;
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
    <section className="grid h-full min-h-0 overflow-hidden bg-[var(--surface-app)] min-[1121px]:grid-cols-[210px_minmax(0,1fr)]">
      <aside
        aria-label="PR compare setup"
        className="hidden min-h-0 flex-col border-r border-[var(--stroke-divider)] bg-[var(--surface-card)] min-[1121px]:flex"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-2 py-2">
          <Button
            className="h-7 justify-start rounded-[5px] px-2 text-xs font-medium"
            onClick={onBack}
            size="sm"
            type="button"
            variant="ghost"
          >
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Pull requests
          </Button>

          <section className="grid gap-1.5" aria-label="Compare summary">
            <h3 className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              Compare
            </h3>
            <ReviewRailMetric label="Branches" tone="pending" value={candidates.length} />
            <ReviewRailMetric
              label="Available"
              tone="success"
              value={candidates.filter((candidate) => candidate.status === 'ready').length}
            />
            <ReviewRailMetric
              label="Unavailable"
              tone="warning"
              value={candidates.filter((candidate) => candidate.status !== 'ready').length}
            />
          </section>

          {selectedCandidate ? (
            <section className="grid gap-2 rounded-[6px] bg-[var(--surface-app)] p-2 text-xs">
              <h3 className="font-semibold text-[var(--text-primary)]">
                {selectedCandidate.title}
              </h3>
              <p className="font-mono leading-5 text-[var(--text-secondary)]">
                {selectedCandidate.branch} → {selectedCandidate.baseBranch}
              </p>
              <Badge variant={canCreate ? 'branch' : 'secondary'}>
                {selectedCandidate.statusLabel}
              </Badge>
            </section>
          ) : null}
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--surface-panel)]">
        <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              className="h-7 rounded-[5px] px-2 text-xs font-medium min-[1121px]:hidden"
              onClick={onBack}
              size="sm"
              type="button"
              variant="ghost"
            >
              <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
              Pull requests
            </Button>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-[var(--text-primary)]">
                Open pull request
              </h2>
              <p className="sr-only">
                Select a source branch, verify the comparison, then create a project PR.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              aria-label="Refresh branch comparisons"
              className="h-7 rounded-[5px] px-2.5 text-xs font-medium shadow-[var(--fx-shadow-sm)]"
              disabled={compareLoading}
              onClick={onRefresh}
              size="sm"
              type="button"
              variant="canvas-outline"
            >
              <RefreshCw
                aria-hidden="true"
                className={cn('h-3.5 w-3.5', compareLoading && 'animate-spin')}
              />
              Refresh
            </Button>
            <Badge variant={canCreate ? 'branch' : 'secondary'}>
              {compareLoading ? 'Comparing...' : canCreate ? 'Available' : 'Choose branch'}
            </Badge>
          </div>
        </header>

        {error ? (
          <div className="mx-3 mt-2 rounded-[5px] border border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            {error}
          </div>
        ) : null}

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2">
          <GitBranch aria-hidden="true" className="h-4 w-4 text-[var(--text-tertiary)]" />
          <BranchSelect
            label="base"
            onChange={(targetBranch) => update({ sourceBranch: '', targetBranch })}
            options={baseBranches}
            value={form.targetBranch}
          />
          <span className="text-xs font-medium text-[var(--text-tertiary)]">← compare</span>
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

        <div className="grid min-h-0 flex-1 overflow-hidden min-[980px]:grid-cols-[340px_minmax(0,1fr)]">
          <section className="flex min-h-0 flex-col border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] min-[980px]:border-r min-[980px]:border-b-0">
            <div className="shrink-0 border-b border-[var(--stroke-divider)] px-3 py-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Branches with commits
              </h3>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                Registered branches with a HEAD commit, compared against {form.targetBranch}.
              </p>
            </div>
            <div className="grid min-h-0 flex-1 content-start gap-1.5 overflow-auto p-2">
              {compareLoading ? (
                <div className="flex items-center gap-2 rounded-[6px] bg-[var(--surface-card)] px-3 py-3 text-xs text-[var(--text-secondary)]">
                  <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                  Loading branch comparisons...
                </div>
              ) : candidates.length > 0 ? (
                candidates.map((candidate) => (
                  <CompareCandidateRow
                    active={candidate.branch === form.sourceBranch}
                    candidate={candidate}
                    key={candidate.id}
                    onSelect={() => selectCandidate(candidate)}
                  />
                ))
              ) : (
                <div className="rounded-[6px] bg-[var(--surface-card)] px-3 py-3 text-xs text-[var(--text-secondary)]">
                  No other committed branches can be compared with this base.
                </div>
              )}
            </div>
          </section>

          <section className="min-h-0 overflow-auto">
            <div className="grid max-w-5xl gap-4 p-3">
              <div className="rounded-[6px] border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-[var(--fx-shadow-sm)]">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--stroke-divider)] px-3 py-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {selectedCandidate ? selectedCandidate.title : 'Choose a branch to compare'}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {selectedCandidate
                        ? `${selectedCandidate.branch} into ${selectedCandidate.baseBranch}`
                        : 'Select one available branch to preview the PR.'}
                    </p>
                  </div>
                  <Badge variant={canCreate ? 'branch' : 'secondary'}>
                    {selectedCandidate?.statusLabel ?? 'No comparison'}
                  </Badge>
                </div>

                {selectedCandidate ? (
                  <div className="grid gap-3 px-3 py-3">
                    <div className="grid gap-2 sm:grid-cols-4">
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
                    <div className="overflow-hidden rounded-[6px] border border-[var(--stroke-divider)]">
                      <ReadinessRow label="Head commit" value={selectedCandidate.headCommitId} />
                      <ReadinessRow
                        label="Base commit"
                        value={selectedCandidate.baseCommitId ?? 'No commit'}
                      />
                      <ReadinessRow label="Schema" value={selectedCandidate.schema} />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 rounded-[6px] border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3 shadow-[var(--fx-shadow-sm)]">
                <label className="grid gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                  Title
                  <input
                    className="h-8 rounded-[5px] border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 text-sm font-normal outline-none focus:border-[var(--accent-commit)] focus:ring-2 focus:ring-[var(--accent-commit)]/20"
                    onChange={(event) => update({ title: event.target.value })}
                    value={form.title}
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                  Description
                  <textarea
                    className="min-h-32 resize-y rounded-[5px] border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3 font-mono text-xs font-normal leading-5 outline-none focus:border-[var(--accent-commit)] focus:ring-2 focus:ring-[var(--accent-commit)]/20"
                    onChange={(event) => update({ description: event.target.value })}
                    value={form.description}
                  />
                </label>
              </div>
            </div>
          </section>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2">
          <Button
            className="h-8 rounded-[5px] px-3 text-xs font-medium shadow-[var(--fx-shadow-sm)]"
            onClick={onBack}
            size="sm"
            type="button"
            variant="canvas-outline"
          >
            Cancel
          </Button>
          <Button
            className="h-8 rounded-[5px] px-3 text-xs font-semibold shadow-[var(--fx-shadow-sm)]"
            disabled={!canCreate || creating}
            onClick={onCreate}
            size="sm"
            type="button"
            variant="branch"
          >
            {creating ? (
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            {creating ? 'Creating...' : 'Create PR'}
          </Button>
        </footer>
      </main>
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
        'grid gap-1.5 rounded-[6px] border px-2.5 py-2 text-left transition-colors',
        active
          ? 'border-[var(--accent-commit)] bg-[var(--accent-commit-soft)] shadow-[var(--fx-shadow-sm)]'
          : 'border-[var(--stroke-divider)] bg-[var(--surface-card)] hover:bg-[var(--hover-bg)]'
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-mono text-xs font-semibold text-[var(--accent-commit)]">
          {candidate.branch}
        </span>
        <Badge variant={candidate.status === 'ready' ? 'branch' : 'secondary'}>
          {candidate.statusLabel}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
        <span>{candidate.aheadBy} ahead</span>
        <span>{candidate.behindBy} behind</span>
        <span>{candidate.yopsChanges} YOps</span>
        <span>{candidate.updatedAt}</span>
      </div>
      <p className="line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">
        {candidate.description}
      </p>
    </button>
  );
}

function CompareMetric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-[6px] bg-[var(--surface-app)] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{value}</p>
    </article>
  );
}

function PullRequestDetailView({
  closeConfirmationActive,
  closeError,
  closing,
  detailError,
  detailLoading,
  detailTab,
  mergeError,
  merging,
  onBack,
  onClose,
  onChangeTab,
  onMerge,
  onRerun,
  pullRequest,
  readinessError,
  rerunning,
}: {
  closeConfirmationActive: boolean;
  closeError: string | null;
  closing: boolean;
  detailError: string | null;
  detailLoading: boolean;
  detailTab: PullRequestDetailTab;
  mergeError: string | null;
  merging: boolean;
  onBack: () => void;
  onClose: () => void;
  onChangeTab: (tab: PullRequestDetailTab) => void;
  onMerge: () => void;
  onRerun: () => void;
  pullRequest: ProjectPullRequest;
  readinessError: string | null;
  rerunning: boolean;
}) {
  const closeable = !['merged', 'closed'].includes(pullRequest.status);
  const rerunnable = ['open', 'ready', 'blocked'].includes(pullRequest.status);
  const closeButtonLabel = closing
    ? 'Closing...'
    : closeConfirmationActive
      ? 'Confirm close'
      : 'Close PR';

  return (
    <section className="grid h-full min-h-0 overflow-hidden bg-[var(--surface-app)] min-[1121px]:grid-cols-[210px_minmax(0,1fr)]">
      <PullRequestDetailRail onBack={onBack} pullRequest={pullRequest} />

      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--surface-panel)]">
        <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              className="h-7 rounded-[5px] px-2 text-xs font-medium min-[1121px]:hidden"
              onClick={onBack}
              size="sm"
              type="button"
              variant="ghost"
            >
              <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
              Pull requests
            </Button>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-bold text-[var(--text-primary)]">
                  {pullRequest.title}
                </h2>
                <ReadinessBadge pullRequest={pullRequest} />
              </div>
              <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                PR #{pullRequest.number} · {pullRequest.author} · {pullRequest.updatedAt}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {closeable ? (
              <Button
                className={cn(
                  'h-7 rounded-[5px] px-2.5 text-xs font-medium shadow-[var(--fx-shadow-sm)]',
                  closeConfirmationActive &&
                    'border-[var(--status-warning)]/50 bg-[var(--status-warning)]/10 text-[var(--text-primary)]'
                )}
                disabled={closing}
                onClick={onClose}
                size="sm"
                type="button"
                variant="canvas-outline"
              >
                {closing ? (
                  <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <XCircle aria-hidden="true" className="h-3.5 w-3.5" />
                )}
                {closeButtonLabel}
              </Button>
            ) : null}
            {rerunnable ? (
              <Button
                className="h-7 rounded-[5px] px-2.5 text-xs font-medium shadow-[var(--fx-shadow-sm)]"
                disabled={detailLoading || rerunning}
                onClick={onRerun}
                size="sm"
                type="button"
                variant="canvas-outline"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={cn('h-3.5 w-3.5', rerunning && 'animate-spin')}
                />
                {rerunning ? 'Rerunning...' : 'Rerun readiness'}
              </Button>
            ) : null}
          </div>
        </header>

        {closeConfirmationActive || closeError ? (
          <div className="mx-3 mt-2 rounded-[5px] border border-[var(--status-warning)]/30 bg-[var(--status-warning)]/10 px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">
            {closeError ??
              'Close without merging? This moves the PR to Closed and leaves the target branch unchanged.'}
          </div>
        ) : null}
        {readinessError ? (
          <div className="mx-3 mt-2 rounded-[5px] border border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">
            {readinessError}
          </div>
        ) : null}
        {detailError ? (
          <div className="mx-3 mt-2 rounded-[5px] border border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">
            {detailError}
          </div>
        ) : null}

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2">
          <div
            aria-label="Pull request detail views"
            className="inline-flex h-8 shrink-0 items-center overflow-hidden rounded-[5px] bg-[var(--surface-app)] p-[2px] text-xs font-medium"
            role="toolbar"
          >
            {DETAIL_TABS.map((tab) => (
              <button
                className={cn(
                  'inline-flex h-full items-center rounded-[4px] px-2.5 transition-colors',
                  detailTab === tab.id
                    ? 'border border-[var(--stroke-divider)] bg-[var(--surface-card)] text-[var(--accent-commit)] shadow-[var(--fx-shadow-sm)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
                )}
                key={tab.id}
                onClick={() => onChangeTab(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
          <p className="hidden text-xs text-[var(--text-tertiary)] sm:block">
            <BranchPill>{pullRequest.sourceBranch}</BranchPill> →{' '}
            <BranchPill>{pullRequest.targetBranch}</BranchPill>
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {detailTab === 'overview' && <OverviewPanel pullRequest={pullRequest} />}
          {detailLoading && ['structured-diff', 'checks', 'activity'].includes(detailTab) ? (
            <DetailLoadingState />
          ) : null}
          {!detailLoading && detailTab === 'structured-diff' ? (
            <StructuredDiffPanel summary={pullRequest.diffSummary} />
          ) : null}
          {!detailLoading && detailTab === 'checks' ? (
            <ChecksPanel checks={pullRequest.checks ?? []} />
          ) : null}
          {!detailLoading && detailTab === 'activity' ? (
            <ActivityPanel activity={pullRequest.activity ?? []} />
          ) : null}
          {detailTab === 'merge' && (
            <MergePanel
              error={mergeError}
              merging={merging}
              onMerge={onMerge}
              pullRequest={pullRequest}
            />
          )}
        </div>
      </main>
    </section>
  );
}

function PullRequestDetailRail({
  onBack,
  pullRequest,
}: {
  onBack: () => void;
  pullRequest: ProjectPullRequest;
}) {
  const summary = pullRequest.diffSummary;

  return (
    <aside
      aria-label="PR review context"
      className="hidden min-h-0 flex-col border-r border-[var(--stroke-divider)] bg-[var(--surface-card)] min-[1121px]:flex"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-2 py-2">
        <Button
          className="h-7 justify-start rounded-[5px] px-2 text-xs font-medium"
          onClick={onBack}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          Pull requests
        </Button>

        <section className="grid gap-2 rounded-[6px] bg-[var(--surface-app)] p-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-semibold text-[var(--accent-commit)]">
                PR #{pullRequest.number}
              </p>
              <h3 className="mt-1 line-clamp-2 text-xs font-semibold text-[var(--text-primary)]">
                {pullRequest.title}
              </h3>
            </div>
            <ReadinessBadge pullRequest={pullRequest} />
          </div>
          <p className="font-mono text-[11px] leading-5 text-[var(--text-secondary)]">
            {pullRequest.sourceBranch} → {pullRequest.targetBranch}
          </p>
        </section>

        <section className="grid gap-1.5" aria-label="Structured diff summary">
          <h3 className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
            Review
          </h3>
          <ReviewRailMetric label="Nodes" tone="pending" value={summary?.changedNodes ?? 0} />
          <ReviewRailMetric label="YOps" tone="pending" value={summary?.yopsOperations ?? 0} />
          <ReviewRailMetric label="Outputs" tone="success" value={summary?.outputImpacts ?? 0} />
          <ReviewRailMetric label="Sources" tone="success" value={summary?.sourceRefs ?? 0} />
        </section>

        <section className="grid gap-1.5" aria-label="Review ownership">
          {pullRequest.reviewOwner ? (
            <ReadinessRow label="Reviewer" value={pullRequest.reviewOwner} />
          ) : null}
          {pullRequest.linkedWork ? (
            <ReadinessRow label="Linked work" value={pullRequest.linkedWork} />
          ) : null}
          {pullRequest.mergeCommitId ? (
            <ReadinessRow label="Merge commit" value={pullRequest.mergeCommitId} />
          ) : null}
        </section>
      </div>
    </aside>
  );
}

function OverviewPanel({ pullRequest }: { pullRequest: ProjectPullRequest }) {
  const metadataItems: Array<[string, string]> = [];
  if (pullRequest.reviewOwner) {
    metadataItems.push(['Reviewer', pullRequest.reviewOwner]);
  }
  if (pullRequest.linkedWork) {
    metadataItems.push(['Linked work', pullRequest.linkedWork]);
  }
  if (pullRequest.mergeCommitId) {
    metadataItems.push(['Merge commit', pullRequest.mergeCommitId]);
  }

  return (
    <div
      className={cn(
        'grid max-w-5xl gap-3',
        metadataItems.length > 0 && 'lg:grid-cols-[minmax(0,1fr)_280px]'
      )}
    >
      <div className="rounded-[6px] border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4 shadow-[var(--fx-shadow-sm)]">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Description</h3>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--text-secondary)]">
          {pullRequest.description}
        </p>
      </div>
      {metadataItems.length > 0 ? <MetadataRail items={metadataItems} /> : null}
    </div>
  );
}

function DetailLoadingState() {
  return (
    <div className="flex max-w-5xl items-center gap-2 rounded-[6px] border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-3 text-xs text-[var(--text-secondary)] shadow-[var(--fx-shadow-sm)]">
      <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" />
      Loading pull request details...
    </div>
  );
}

function StructuredDiffPanel({ summary }: { summary?: PullRequestDiffSummary }) {
  if (!summary) {
    return <DetailEmptyState message="Structured diff summary is unavailable for this PR." />;
  }

  return (
    <div className="max-w-5xl overflow-hidden rounded-[6px] border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-[var(--fx-shadow-sm)]">
      {[
        [
          'Changed nodes',
          String(summary.changedNodes),
          'Schema-aware field updates across PR state.',
        ],
        [
          'YOps operations',
          String(summary.yopsOperations),
          'Deterministic operations retained for review.',
        ],
        [
          'Output impacts',
          String(summary.outputImpacts),
          'Downstream outputs that may need regeneration after merge.',
        ],
        [
          'Source refs',
          String(summary.sourceRefs),
          'Conversation and document provenance attached.',
        ],
      ].map(([label, value, detail]) => (
        <article
          className="grid gap-2 border-b border-[var(--stroke-divider)] px-3 py-3 last:border-b-0 sm:grid-cols-[180px_80px_minmax(0,1fr)] sm:items-center"
          key={label}
        >
          <p className="text-xs font-semibold text-[var(--text-primary)]">{label}</p>
          <p className="font-mono text-lg font-semibold text-[var(--accent-commit)]">{value}</p>
          <p className="text-xs leading-5 text-[var(--text-secondary)]">{detail}</p>
        </article>
      ))}
    </div>
  );
}

function ChecksPanel({ checks }: { checks: PullRequestCheck[] }) {
  if (checks.length === 0) {
    return <DetailEmptyState message="No readiness checks have been recorded for this PR." />;
  }

  return (
    <div className="max-w-5xl overflow-hidden rounded-[6px] border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-[var(--fx-shadow-sm)]">
      {checks.map((check) => (
        <article
          className="flex items-start gap-3 border-b border-[var(--stroke-divider)] px-3 py-3 last:border-b-0"
          key={check.id}
        >
          <CheckIcon status={check.status} />
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{check.label}</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{check.detail}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function ActivityPanel({ activity }: { activity: PullRequestActivity[] }) {
  if (activity.length === 0) {
    return <DetailEmptyState message="No activity has been recorded for this PR." />;
  }

  return (
    <div className="max-w-5xl overflow-hidden rounded-[6px] border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-[var(--fx-shadow-sm)]">
      {activity.map((item) => (
        <article
          className="border-b border-[var(--stroke-divider)] px-3 py-3 last:border-b-0"
          key={item.id}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{item.label}</h3>
            <time className="text-xs text-[var(--text-tertiary)]">{item.createdAt}</time>
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{item.detail}</p>
        </article>
      ))}
    </div>
  );
}

function DetailEmptyState({ message }: { message: string }) {
  return (
    <div className="max-w-5xl rounded-[6px] border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-card)] px-5 py-8 text-center text-sm text-[var(--text-secondary)]">
      {message}
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
  const closed = pullRequest.status === 'closed';
  const checking = pullRequest.status === 'checking';
  const resolvable = pullRequest.status === 'blocked' && Boolean(pullRequest.mergeDraftId);
  const finished = merged || closed;
  const title = merged
    ? 'Merged'
    : closed
      ? 'Closed without merging'
      : ready
        ? 'Ready to merge'
        : checking
          ? 'Checking merge readiness'
          : resolvable
            ? 'Resolve merge conflicts'
            : 'Merge readiness required';
  const message = merged
    ? `This PR was merged into ${pullRequest.targetBranch} through a deterministic merge.`
    : closed
      ? `This PR was closed without changing ${pullRequest.targetBranch}.`
      : ready
        ? `Readiness checks passed. Merge will update ${pullRequest.targetBranch}.`
        : checking
          ? 'The server is preparing a deterministic merge against the reviewed branch heads.'
          : resolvable
            ? 'The deterministic merge is prepared, but conflicting structured state needs your decision.'
            : 'Merge is available after deterministic merge simulation and review requirements pass.';

  return (
    <div className="max-w-5xl rounded-[6px] border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4 shadow-[var(--fx-shadow-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--text-secondary)]">{message}</p>
          {!finished && error ? (
            <p className="mt-3 rounded-[5px] border border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] px-3 py-2 text-xs text-[var(--text-secondary)]">
              {error}
            </p>
          ) : null}
        </div>
        {!finished && resolvable ? (
          <Button
            disabled
            title="Conflict resolution is not available in this view yet"
            className="h-8 rounded-[5px] px-3 text-xs font-medium shadow-[var(--fx-shadow-sm)]"
            size="sm"
            variant="canvas-outline"
          >
            Resolve conflicts
          </Button>
        ) : null}
        {!finished && !resolvable ? (
          <Button
            disabled={!ready || merging}
            className="h-8 rounded-[5px] px-3 text-xs font-semibold shadow-[var(--fx-shadow-sm)]"
            onClick={onMerge}
            size="sm"
            type="button"
            variant={ready ? 'commit' : 'canvas-outline'}
          >
            {merging ? (
              <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle aria-hidden="true" className="h-4 w-4" />
            )}
            {merging ? 'Merging...' : 'Merge PR'}
          </Button>
        ) : null}
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
  const accessibleLabel = label ? `${label}:` : 'compare branch';

  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
      {label ? `${label}:` : null}
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger
          aria-label={accessibleLabel}
          className="h-8 w-[min(17rem,calc(100vw-5rem))] rounded-[5px] border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-2.5 text-xs font-semibold text-[var(--text-primary)] shadow-[var(--fx-shadow-sm)] transition-[background-color,border-color,box-shadow] hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)] focus-visible:border-[var(--accent-commit)] focus-visible:ring-2 focus-visible:ring-[var(--accent-commit)]/20 data-[size=default]:h-8 data-[state=open]:border-[var(--accent-commit)] data-[state=open]:bg-[var(--surface-panel)] data-[state=open]:ring-2 data-[state=open]:ring-[var(--accent-commit)]/20 sm:w-56"
        >
          <SelectValue className="min-w-0 flex-1 truncate text-left" placeholder="Choose branch" />
        </SelectTrigger>
        <SelectContent
          align="start"
          className="min-w-56 rounded-[6px] border-[var(--stroke-divider)] bg-[var(--surface-elevated)] p-1.5 shadow-[var(--fx-shadow-lg)]"
          position="popper"
          sideOffset={8}
        >
          {options.map((option) => (
            <SelectItem
              className="h-8 rounded-[5px] pr-9 pl-3 text-xs font-medium text-[var(--text-primary)] focus:bg-[var(--hover-bg)] focus:text-[var(--text-primary)] data-[state=checked]:bg-[var(--accent-commit-soft)] data-[state=checked]:font-semibold data-[state=checked]:text-[var(--accent-commit)]"
              key={option}
              value={option}
            >
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function BranchPill({ children }: { children: string }) {
  return (
    <span className="inline-flex rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-primary)]">
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
    <div className="flex items-center justify-between gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2 text-xs last:border-b-0">
      <span className="font-semibold text-[var(--text-primary)]">{label}</span>
      <span className="min-w-0 truncate font-mono font-semibold text-[var(--text-secondary)]">
        {value}
      </span>
    </div>
  );
}

function MetadataRail({ items }: { items: Array<[string, string]> }) {
  return (
    <aside className="grid content-start gap-3">
      {items.map(([label, value]) => (
        <section
          className="rounded-[6px] border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3 shadow-[var(--fx-shadow-sm)]"
          key={label}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">{label}</h3>
            <UserRound aria-hidden="true" className="h-4 w-4 text-[var(--text-tertiary)]" />
          </div>
          <p className="text-xs leading-5 text-[var(--text-secondary)]">{value}</p>
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
    return <XCircle aria-hidden="true" className="mt-0.5 h-5 w-5 text-[var(--status-warning)]" />;
  }

  if (status === 'failed') {
    return <XCircle aria-hidden="true" className="mt-0.5 h-5 w-5 text-[var(--status-error)]" />;
  }

  if (status === 'warning') {
    return <RefreshCw aria-hidden="true" className="mt-0.5 h-5 w-5 text-[var(--status-warning)]" />;
  }

  return (
    <RefreshCw
      aria-hidden="true"
      className={cn(
        'mt-0.5 h-5 w-5 text-[var(--accent-commit)]',
        status === 'running' && 'animate-spin'
      )}
    />
  );
}
