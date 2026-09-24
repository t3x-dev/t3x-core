'use client';

import {
  ArrowDown as PhArrowDown,
  ArrowRight as PhArrowRight,
  CaretDown as PhCaretDown,
  CaretRight as PhCaretRight,
  CheckCircle as PhCheckCircle,
  CircleDashed as PhCircleDashed,
  Cube as PhCube,
  File as PhFile,
  FileText as PhFileText,
  Gear as PhGear,
  GitBranch as PhGitBranch,
  GitCommit as PhGitCommit,
  GitPullRequest as PhGitPullRequest,
  Info as PhInfo,
  Play as PhPlay,
  Tilde as PhTilde,
} from '@phosphor-icons/react';
import type { MergeDecision } from '@t3x-dev/core';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Copy,
  GitCompareArrows,
  GitMerge,
  GitPullRequestArrow,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { shortHash } from '@/domain/format/formatters';
import type { PullRequestConflictSide } from '@/domain/project/pullRequestConflictDecision';
import type {
  ApiProjectPullRequest,
  ApiProjectPullRequestActivity,
  ApiProjectPullRequestCheck,
  ApiProjectPullRequestDetail,
} from '@/hooks/projects/useProjectPullRequestsApi';
import { useProjectPullRequestsApi } from '@/hooks/projects/useProjectPullRequestsApi';
import { cn } from '@/utils/cn';
import createStyles from './ProjectReviewsCreate.module.css';
import detailStyles from './ProjectReviewsDetail.module.css';
import listStyles from './ProjectReviewsList.module.css';

type PullRequestStatus = 'draft' | 'open' | 'checking' | 'ready' | 'blocked' | 'merged' | 'closed';
type PullRequestListMode = 'open' | 'merged' | 'closed';
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
  { id: 'structured-diff', label: 'Changes' },
  { id: 'checks', label: 'Checks' },
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
    applyConflictDecision: applyProjectConflictDecision,
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
  const [statusFilter, setStatusFilter] = useState<'all' | PullRequestStatus>('all');
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
      : 'Refresh generated output bundle state after the latest release-note source changes.',
    sourceBranch: projectId ? '' : 'outputs/bundle-refresh',
    targetBranch: 'main',
  }));
  const [apiError, setApiError] = useState<string | null>(null);
  const [conflictDecision, setConflictDecision] = useState<MergeDecision | null>(null);
  const [applyingResolution, setApplyingResolution] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);

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
  const closedPullRequests = pullRequests.filter((item) => item.status === 'closed');
  const mergedPullRequests = pullRequests.filter((item) => item.status === 'merged');
  const selectedPullRequest =
    pullRequests.find((item) => item.id === selectedId) ?? openPullRequests[0] ?? pullRequests[0];

  const visiblePullRequests = useMemo(() => {
    const source =
      mode === 'open'
        ? openPullRequests
        : mode === 'merged'
          ? mergedPullRequests
          : closedPullRequests;
    const normalized = query.toLowerCase().trim();
    return source.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!normalized) return true;
      return [
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
        .includes(normalized);
    });
  }, [closedPullRequests, mergedPullRequests, mode, openPullRequests, query, statusFilter]);

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
      description: selectedCompareCandidate.description,
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
    setConflictDecision(null);
    setResolutionError(null);
    setDetailTab('structured-diff');
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
    setMode(finished.status === 'merged' ? 'merged' : 'closed');
    setQuery('');
    setCloseConfirmId(null);
    setCloseError(null);
    setMergeError(null);
    setReadinessError(null);
    setView('list');
  };

  const canMergePullRequest = (pullRequest: ProjectPullRequest) =>
    pullRequest.status === 'ready' ||
    (pullRequest.status === 'blocked' && conflictDecision !== null);

  const applyResolution = (side: PullRequestConflictSide | null) => {
    const pullRequest = selectedPullRequest;
    if (!pullRequest || applyingResolution) return;

    setResolutionError(null);
    if (side === null) {
      setConflictDecision(null);
      return;
    }
    if (!projectId || !pullRequest.mergeDraftId) {
      setConflictDecision({
        conflictResolutions: { fixture: side === 'feature' ? 'source' : 'target' },
        keepFromSource: [],
        keepFromTarget: [],
        keepRelationsFromSource: true,
        keepRelationsFromTarget: true,
      });
      return;
    }

    setApplyingResolution(true);
    applyProjectConflictDecision(pullRequest.mergeDraftId, side)
      .then((decision) => {
        setConflictDecision(decision);
      })
      .catch((err) => {
        setResolutionError(
          err instanceof Error ? err.message : 'Could not save the conflict resolution.'
        );
      })
      .finally(() => {
        setApplyingResolution(false);
      });
  };

  const mergePullRequest = (pullRequest: ProjectPullRequest) => {
    if (!canMergePullRequest(pullRequest) || mergingId) return;

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
      ...(conflictDecision ? { decisions: conflictDecision } : {}),
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
        applyingResolution={applyingResolution}
        closeConfirmationActive={closeConfirmId === selectedPullRequest.id}
        closeError={closeError}
        closing={closingId === selectedPullRequest.id}
        conflictResolved={conflictDecision !== null}
        detailError={detailError}
        detailLoading={detailLoadingId === selectedPullRequest.id}
        detailTab={detailTab}
        mergeError={mergeError}
        merging={mergingId === selectedPullRequest.id}
        onApplyResolution={applyResolution}
        onBack={() => setView('list')}
        onClose={() => closePullRequest(selectedPullRequest)}
        onChangeTab={setDetailTab}
        onMerge={() => mergePullRequest(selectedPullRequest)}
        onRerun={() => rerunReadiness(selectedPullRequest)}
        pullRequest={selectedPullRequest}
        readinessError={readinessError}
        resolutionError={resolutionError}
        rerunning={rerunningId === selectedPullRequest.id}
      />
    );
  }

  return (
    <section className={listStyles.page}>
      <header className={listStyles.pageHeader}>
        <div>
          <h1>Pull requests</h1>
          <p>Changes proposed to release-control</p>
        </div>
        <Button
          aria-label="Create PR"
          className={listStyles.newButton}
          onClick={() => {
            setApiError(null);
            setView('create');
          }}
          type="button"
          variant="commit"
        >
          <Plus aria-hidden="true" />
          New pull request
        </Button>
      </header>

      <div className={listStyles.controls}>
        <div aria-label="Pull request states" className={listStyles.modes} role="tablist">
          <ModeButton
            active={mode === 'open'}
            count={openPullRequests.length}
            label="Open"
            onClick={() => {
              setMode('open');
              setQuery('');
              setStatusFilter('all');
            }}
          />
          <ModeButton
            active={mode === 'merged'}
            count={mergedPullRequests.length}
            label="Merged"
            onClick={() => {
              setMode('merged');
              setQuery('');
              setStatusFilter('all');
            }}
          />
          <ModeButton
            active={mode === 'closed'}
            count={closedPullRequests.length}
            label="Closed"
            onClick={() => {
              setMode('closed');
              setQuery('');
              setStatusFilter('all');
            }}
          />
        </div>
        <div className={listStyles.filters}>
          <label className={listStyles.search}>
            <Search aria-hidden="true" />
            <input
              aria-label="Search pull requests"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title or branch..."
              value={query}
            />
          </label>
          <label className={listStyles.statusSelect}>
            <select
              aria-label="Pull request status"
              onChange={(event) => setStatusFilter(event.target.value as 'all' | PullRequestStatus)}
              value={statusFilter}
            >
              <option value="all">All statuses</option>
              <option value="ready">Ready to merge</option>
              <option value="checking">Checks running</option>
              <option value="blocked">Needs decision</option>
              <option value="draft">Draft</option>
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
        </div>
      </div>

      {apiError ? (
        <div className={listStyles.error}>Could not load pull requests: {apiError}</div>
      ) : null}

      <div className={listStyles.tableWrap}>
        <div aria-hidden="true" className={listStyles.tableHeader}>
          <div>#</div>
          <div>Title</div>
          <div>Branches</div>
          <div>Status</div>
          <div>Author</div>
          <div>Updated</div>
          <div />
        </div>
        <div className={listStyles.rows}>
          {visiblePullRequests.length > 0 ? (
            visiblePullRequests.map((pullRequest, index) => (
              <PullRequestRow
                highlighted={pullRequest.id === highlightedId}
                key={pullRequest.id}
                onOpen={() => openPullRequest(pullRequest)}
                pullRequest={pullRequest}
                selected={
                  pullRequest.id === selectedId ||
                  (index === 0 && !visiblePullRequests.some((item) => item.id === selectedId))
                }
              />
            ))
          ) : (
            <section className={listStyles.empty}>
              <h3>No pull requests found</h3>
              <p>
                {query
                  ? 'Try a different title or branch.'
                  : `There are no ${mode} pull requests in this project.`}
              </p>
            </section>
          )}
        </div>
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
      aria-label={`${count} ${label}`}
      aria-selected={active}
      className={cn(listStyles.mode, active && listStyles.modeActive)}
      onClick={onClick}
      role="tab"
      type="button"
    >
      <span>{label}</span>
      <span className={listStyles.modeCount}>{count}</span>
    </button>
  );
}

function PullRequestRow({
  highlighted,
  onOpen,
  pullRequest,
  selected,
}: {
  highlighted: boolean;
  onOpen: () => void;
  pullRequest: ProjectPullRequest;
  selected: boolean;
}) {
  return (
    <button
      aria-label="View PR"
      className={cn(listStyles.row, selected && listStyles.rowSelected)}
      onClick={onOpen}
      type="button"
    >
      <div className={listStyles.number}>
        <GitPullRequestArrow aria-hidden="true" />
        <span>#{pullRequest.number}</span>
      </div>
      <div className={listStyles.title}>
        <span>{pullRequest.title}</span>
        {highlighted ? <em>New</em> : null}
      </div>
      <div className={listStyles.branches}>
        <code>{pullRequest.sourceBranch}</code>
        <ArrowRight aria-hidden="true" />
        <code>{pullRequest.targetBranch}</code>
      </div>
      <ListReadinessBadge pullRequest={pullRequest} />
      <div className={listStyles.author}>
        <span className={listStyles.avatar}>{authorInitials(pullRequest.author)}</span>
        <span>{pullRequest.author}</span>
      </div>
      <time className={listStyles.updated}>{pullRequest.updatedAt}</time>
      <ChevronRight aria-hidden="true" className={listStyles.rowArrow} />
    </button>
  );
}

function ListReadinessBadge({ pullRequest }: { pullRequest: ProjectPullRequest }) {
  const icon =
    pullRequest.readinessTone === 'success' ? (
      <CheckCircle2 aria-hidden="true" />
    ) : pullRequest.readinessTone === 'warning' ? (
      <CircleAlert aria-hidden="true" />
    ) : pullRequest.readinessTone === 'pending' ? (
      <RefreshCw
        aria-hidden="true"
        className={pullRequest.status === 'checking' ? 'animate-spin' : ''}
      />
    ) : (
      <UserRound aria-hidden="true" />
    );

  return (
    <span
      className={cn(
        listStyles.readiness,
        pullRequest.readinessTone === 'success'
          ? listStyles.readinessSuccess
          : pullRequest.readinessTone === 'warning'
            ? listStyles.readinessWarning
            : pullRequest.readinessTone === 'pending'
              ? listStyles.readinessPending
              : listStyles.readinessMuted
      )}
    >
      {icon}
      {pullRequest.readinessLabel}
    </span>
  );
}

function authorInitials(author: string): string {
  return author
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function compareCommitLabel(hash: string | null | undefined): string {
  if (!hash) return 'No commit';
  const normalized = hash.startsWith('sha:') ? `sha256:${hash.slice(4)}` : hash;
  return shortHash(normalized);
}

function scrollToChangePreview() {
  document.getElementById('change-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const sourceOptions =
    candidates.length > 0
      ? candidates.map((candidate) => ({
          status: candidate.statusLabel,
          value: candidate.branch,
        }))
      : form.sourceBranch
        ? [{ value: form.sourceBranch }]
        : [];
  const changedNodeCount = selectedCandidate?.changedNodes ?? 0;
  const previewRows = selectedCandidate
    ? [
        {
          kind: selectedCandidate.changedNodes > 0 ? 'modified' : 'unchanged',
          label: 'Changed nodes',
          value: String(selectedCandidate.changedNodes),
        },
        {
          kind: selectedCandidate.yopsChanges > 0 ? 'modified' : 'unchanged',
          label: 'YOps changes',
          value: String(selectedCandidate.yopsChanges),
        },
        {
          kind: selectedCandidate.outputImpacts > 0 ? 'modified' : 'unchanged',
          label: 'Output impact',
          value: String(selectedCandidate.outputImpacts),
        },
      ]
    : [];

  const selectCandidate = (candidate: PullRequestCompareCandidate) => {
    onChange({
      description: candidate.description,
      sourceBranch: candidate.branch,
      targetBranch: candidate.baseBranch,
      title: candidate.title,
    });
  };

  return (
    <section className={createStyles.page}>
      <main className={createStyles.mainColumn}>
        <header className={createStyles.header}>
          <nav className={createStyles.breadcrumb}>
            <button onClick={onBack} type="button">
              Pull requests
            </button>
            <span>/</span>
            <span>New</span>
          </nav>
          <h1>New pull request</h1>
          <p>Create a pull request to propose and review your changes.</p>
          <button
            aria-label="Refresh branch comparisons"
            className={createStyles.srOnly}
            disabled={compareLoading}
            onClick={onRefresh}
            type="button"
          >
            Refresh branch comparisons
          </button>
        </header>

        {selectedCandidate ? (
          <div className={createStyles.commitNotice}>
            <PhCheckCircle aria-hidden="true" size={20} weight="fill" />
            <span className={createStyles.commitLabel}>Committed to</span>
            <code>{selectedCandidate.branch}</code>
            <strong>·</strong>
            <code>{compareCommitLabel(selectedCandidate.headCommitId)}</code>
          </div>
        ) : null}

        <div className={createStyles.branchBar}>
          <CreateBranchSelect
            ariaLabel="Source branch"
            disabled={compareLoading || sourceOptions.length === 0}
            onChange={(sourceBranch) => {
              const next = candidates.find((candidate) => candidate.branch === sourceBranch);
              if (next) {
                selectCandidate(next);
                return;
              }
              update({ sourceBranch });
            }}
            options={sourceOptions}
            placeholder="Choose branch"
            value={form.sourceBranch}
          />
          <PhArrowRight aria-hidden="true" className={createStyles.branchArrow} size={20} />
          <CreateBranchSelect
            ariaLabel="Base branch"
            disabled={compareLoading || baseBranches.length === 0}
            onChange={(targetBranch) => update({ sourceBranch: '', targetBranch })}
            options={baseBranches.map((branch) => ({ value: branch }))}
            placeholder="Choose base"
            value={form.targetBranch}
          />
          {selectedCandidate ? (
            <button
              className={createStyles.changedPathsLink}
              onClick={scrollToChangePreview}
              type="button"
            >
              <PhFileText aria-hidden="true" size={18} />
              {changedNodeCount} changed paths
            </button>
          ) : null}
        </div>

        {compareLoading ? (
          <div className={createStyles.inlineMessage}>Loading branch comparisons...</div>
        ) : null}
        {!compareLoading && candidates.length === 0 ? (
          <div className={createStyles.inlineMessage}>
            No other committed branches can be compared with this base.
          </div>
        ) : null}
        {selectedCandidate && !canCreate && !compareLoading ? (
          <div className={createStyles.warningMessage}>
            {selectedCandidate.statusLabel}. Branches with an open PR, no semantic changes, or no
            commits ahead of the base cannot create another PR.
          </div>
        ) : null}

        <div className={createStyles.rule} />

        <div className={createStyles.formFields}>
          <label>
            <span>Title</span>
            <input
              aria-label="Title"
              onChange={(event) => update({ title: event.target.value })}
              value={form.title}
            />
          </label>
          <label>
            <span>Description</span>
            <textarea
              aria-label="Description"
              onChange={(event) => update({ description: event.target.value })}
              value={form.description}
            />
          </label>
          <div className={createStyles.authorRow}>
            <span>Author</span>
            <button type="button">
              <b>YO</b>
              <span>YOps (you)</span>
              <PhCaretDown aria-hidden="true" size={14} />
            </button>
          </div>
          {error ? <div className={createStyles.warningMessage}>{error}</div> : null}
        </div>

        <div className={createStyles.rule} />

        <section className={createStyles.preview} id="change-preview">
          <h2>Change preview</h2>
          <p>
            {selectedCandidate
              ? `Showing key changes from ${selectedCandidate.branch} to ${selectedCandidate.baseBranch}.`
              : 'Select a source branch to preview the structured comparison.'}
          </p>
          <div className={createStyles.previewList}>
            {previewRows.length > 0 ? (
              previewRows.map((row) => (
                <button className={createStyles.previewRow} key={row.label} type="button">
                  <PhCube aria-hidden="true" className={createStyles.cubeIcon} size={24} />
                  <span className={createStyles.previewLabel}>{row.label}</span>
                  <ChangeKindBadge kind={row.kind} />
                  <span className={createStyles.previewValue}>{row.value}</span>
                  <PhCaretRight aria-hidden="true" className={createStyles.rowCaret} size={18} />
                </button>
              ))
            ) : (
              <div className={createStyles.previewEmpty}>
                No structured comparison is ready yet.
              </div>
            )}
          </div>
        </section>
      </main>

      <aside className={createStyles.sidebar}>
        <div className={createStyles.readyCard}>
          <h2>Ready to open</h2>
          <p>Review the details below and create the pull request.</p>

          <div className={createStyles.metaList}>
            <CreateMetaRow
              icon={<PhGitBranch aria-hidden="true" size={18} />}
              label="Source branch"
              value={(selectedCandidate?.branch ?? form.sourceBranch) || '—'}
            />
            <CreateMetaRow
              icon={<PhGitCommit aria-hidden="true" size={18} />}
              label="Source commit"
              value={compareCommitLabel(selectedCandidate?.headCommitId)}
              valueClassName={createStyles.monoValue}
            />
            <CreateMetaRow
              icon={<PhGitBranch aria-hidden="true" size={18} />}
              label="Base branch"
              value={(selectedCandidate?.baseBranch ?? form.targetBranch) || '—'}
            />
            <CreateMetaRow
              icon={<PhGitCommit aria-hidden="true" size={18} />}
              label="Base commit"
              value={
                selectedCandidate?.baseCommitId
                  ? compareCommitLabel(selectedCandidate.baseCommitId)
                  : 'No commit'
              }
              valueClassName={createStyles.monoValue}
            />
          </div>

          <div className={createStyles.cardSection}>
            <h3>Changes</h3>
            <div className={createStyles.changesRow}>
              <span>
                <PhFileText aria-hidden="true" size={22} />
                {changedNodeCount} paths changed
              </span>
              <button onClick={scrollToChangePreview} type="button">
                View files
              </button>
            </div>
          </div>

          <div className={createStyles.cardSection}>
            <h3>Checks run after opening</h3>
            <div className={createStyles.checkRow}>
              <PhCircleDashed aria-hidden="true" size={22} />
              <div>
                <span>Schema validation</span>
                <small>Will run on the pull request</small>
              </div>
              <span
                className={createStyles.infoIcon}
                title="Schema and merge readiness checks run after the pull request is opened."
              >
                <PhInfo aria-hidden="true" size={20} />
              </span>
            </div>
          </div>

          <button
            className={createStyles.createButton}
            data-variant="commit"
            disabled={!canCreate || creating}
            onClick={onCreate}
            type="button"
          >
            {creating ? (
              <RefreshCw aria-hidden="true" className="animate-spin" size={20} />
            ) : (
              <PhGitPullRequest aria-hidden="true" size={20} />
            )}
            {creating ? 'Creating...' : 'Create pull request'}
          </button>

          <button className={createStyles.openLink} onClick={onBack} type="button">
            <PhArrowRight aria-hidden="true" size={15} />
            Opens in Pull requests
          </button>
        </div>
      </aside>
    </section>
  );
}

function CreateBranchSelect({
  ariaLabel,
  disabled,
  onChange,
  options,
  placeholder,
  value,
}: {
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  options: Array<{ status?: string; value: string }>;
  placeholder: string;
  value: string;
}) {
  return (
    <Select disabled={disabled} onValueChange={onChange} value={value}>
      <SelectTrigger aria-label={ariaLabel} className={createStyles.branchSelect}>
        <PhGitBranch aria-hidden="true" size={18} />
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        align="start"
        className="min-w-64 rounded-md border-[var(--stroke-divider)] bg-[var(--surface-elevated)] p-1.5 shadow-[var(--fx-shadow-lg)]"
        position="popper"
        sideOffset={8}
      >
        {options.map((option) => (
          <SelectItem
            className="h-9 rounded-sm pr-9 pl-3 font-medium text-[var(--text-primary)] focus:bg-[var(--hover-bg)] focus:text-[var(--text-primary)] data-[state=checked]:bg-[var(--accent-commit-soft)] data-[state=checked]:font-semibold data-[state=checked]:text-[var(--accent-commit)]"
            key={option.value}
            value={option.value}
          >
            {option.status ? `${option.value} · ${option.status}` : option.value}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CreateMetaRow({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className={createStyles.metaRow}>
      <div className={createStyles.metaIcon}>{icon}</div>
      <div className={createStyles.metaLabel}>{label}</div>
      <div className={cn(createStyles.metaValue, valueClassName)}>{value}</div>
    </div>
  );
}

function ChangeKindBadge({ kind }: { kind: string }) {
  if (kind === 'unchanged') {
    return (
      <span className={cn(createStyles.changeBadge, createStyles.unchangedBadge)}>Unchanged</span>
    );
  }

  return (
    <span className={cn(createStyles.changeBadge, createStyles.modifiedBadge)}>
      <PhTilde aria-hidden="true" size={14} weight="bold" />
      Modified
    </span>
  );
}

function PullRequestDetailView({
  applyingResolution,
  closeConfirmationActive,
  closeError,
  closing,
  conflictResolved,
  detailError,
  detailLoading,
  detailTab,
  mergeError,
  merging,
  onApplyResolution,
  onBack,
  onClose,
  onChangeTab,
  onMerge,
  onRerun,
  pullRequest,
  readinessError,
  resolutionError,
  rerunning,
}: {
  applyingResolution: boolean;
  closeConfirmationActive: boolean;
  closeError: string | null;
  closing: boolean;
  conflictResolved: boolean;
  detailError: string | null;
  detailLoading: boolean;
  detailTab: PullRequestDetailTab;
  mergeError: string | null;
  merging: boolean;
  onApplyResolution: (side: PullRequestConflictSide | null) => void;
  onBack: () => void;
  onClose: () => void;
  onChangeTab: (tab: PullRequestDetailTab) => void;
  onMerge: () => void;
  onRerun: () => void;
  pullRequest: ProjectPullRequest;
  readinessError: string | null;
  resolutionError: string | null;
  rerunning: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const closeable = !['merged', 'closed'].includes(pullRequest.status);
  const rerunnable = ['open', 'ready', 'blocked'].includes(pullRequest.status);
  const closeButtonLabel = closing
    ? 'Closing...'
    : closeConfirmationActive
      ? 'Confirm close'
      : 'Close PR';

  const conflictCount = pullRequest.status === 'blocked' && !conflictResolved ? 1 : 0;
  const passedChecks = (pullRequest.checks ?? []).filter(
    (check) => check.status === 'passed'
  ).length;
  const ready = pullRequest.status === 'ready' || conflictResolved;

  return (
    <section className={detailStyles.page}>
      <header className={detailStyles.header}>
        <div className={detailStyles.headerMain}>
          <button className={detailStyles.breadcrumb} onClick={onBack} type="button">
            <GitPullRequestArrow aria-hidden="true" />
            Pull requests / <strong>#{pullRequest.number}</strong>
          </button>
          <h1>{pullRequest.title}</h1>
          <div className={detailStyles.refs}>
            <span>
              <PhGitBranch aria-hidden="true" />
              Base <b>{pullRequest.targetBranch}</b>
              <code>@ {shortHash(pullRequest.targetBaseCommitId)}</code>
            </span>
            <ArrowLeft aria-hidden="true" />
            <span>
              <PhGitBranch aria-hidden="true" />
              Compare <b>{pullRequest.sourceBranch}</b>
              <code>@ {shortHash(pullRequest.sourceCommitId)}</code>
            </span>
            <span>
              <GitCompareArrows aria-hidden="true" />
              Common ancestor <b>{shortHash(pullRequest.targetBaseCommitId)}</b>
            </span>
          </div>
        </div>
        <div className={detailStyles.headerAside}>
          <ReadinessBadge pullRequest={pullRequest} />
          <span>Opened by {pullRequest.author}</span>
          <span>{pullRequest.updatedAt}</span>
        </div>
      </header>

      {closeConfirmationActive ||
      closeError ||
      readinessError ||
      detailError ||
      mergeError ||
      resolutionError ? (
        <div className={detailStyles.notice}>
          {closeError ??
            readinessError ??
            detailError ??
            mergeError ??
            resolutionError ??
            'Close without merging? This moves the PR to Closed and leaves the target branch unchanged.'}
        </div>
      ) : null}

      <nav aria-label="Pull request detail" className={detailStyles.tabs}>
        {DETAIL_TABS.map((tab) => (
          <button
            aria-current={detailTab === tab.id ? 'page' : undefined}
            className={detailTab === tab.id ? detailStyles.tabActive : undefined}
            key={tab.id}
            onClick={() => onChangeTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className={detailStyles.content}>
        {detailTab === 'overview' ? (
          <OverviewPanel onChangeTab={onChangeTab} pullRequest={pullRequest} />
        ) : detailLoading ? (
          <DetailLoadingState />
        ) : detailTab === 'checks' ? (
          <ChecksPanel checks={pullRequest.checks ?? []} />
        ) : (
          <StructuredDiffPanel
            applyingResolution={applyingResolution}
            conflictResolved={conflictResolved}
            copied={copied}
            onApplyResolution={onApplyResolution}
            onCopy={() => {
              void navigator.clipboard?.writeText('release_plan.rollout.branch');
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            }}
            pullRequest={pullRequest}
          />
        )}
      </div>

      <footer className={detailStyles.footer}>
        <div>
          {conflictResolved
            ? 'Resolution saved. Merge is ready.'
            : conflictCount > 0
              ? `Choose ${conflictCount} conflict to continue.`
              : `${passedChecks} checks passed.`}
        </div>
        <div className={detailStyles.footerActions}>
          {closeable ? (
            <button
              className={detailStyles.secondaryAction}
              disabled={closing}
              onClick={onClose}
              type="button"
            >
              {closing ? 'Closing…' : closeButtonLabel}
            </button>
          ) : null}
          {rerunnable ? (
            <button
              aria-label="Rerun readiness"
              className={detailStyles.secondaryAction}
              disabled={rerunning}
              onClick={onRerun}
              type="button"
            >
              <RefreshCw aria-hidden="true" className={rerunning ? 'animate-spin' : undefined} />
              {rerunning ? 'Rerunning…' : 'Rerun checks'}
            </button>
          ) : null}
          {!['merged', 'closed'].includes(pullRequest.status) ? (
            <button
              aria-label="Merge PR"
              className={detailStyles.mergeButton}
              disabled={!ready || merging}
              onClick={onMerge}
              type="button"
            >
              <GitMerge aria-hidden="true" />
              {merging ? 'Merging…' : `Merge into ${pullRequest.targetBranch}`}
            </button>
          ) : null}
        </div>
      </footer>
    </section>
  );
}

function OverviewPanel({
  onChangeTab,
  pullRequest,
}: {
  onChangeTab: (tab: PullRequestDetailTab) => void;
  pullRequest: ProjectPullRequest;
}) {
  const checks = pullRequest.checks ?? [];
  const conflictCount = pullRequest.status === 'blocked' ? 1 : 0;
  const changedCount = Math.max(pullRequest.diffSummary?.changedNodes ?? 0, conflictCount);
  const autoMergedCount = Math.max(0, changedCount - conflictCount);
  const baseHash = shortHash(pullRequest.targetBaseCommitId);
  const headHash = shortHash(pullRequest.sourceCommitId);
  const impactRows = [
    ['rollout.stage', pullRequest.targetBranch, pullRequest.sourceBranch],
    ['rollout.revision', baseHash, headHash],
    [
      'requirements.checksPassed',
      'false',
      String(checks.every((check) => check.status === 'passed')),
    ],
  ];

  return (
    <div className={detailStyles.overviewGrid}>
      <div className={detailStyles.overviewMain}>
        <section className={detailStyles.descriptionCard}>
          <h3>Description</h3>
          <p>{pullRequest.description}</p>
        </section>

        <section className={detailStyles.readinessSection}>
          <div className={detailStyles.readinessHeading}>
            <h2>Merge readiness</h2>
            <div>
              <span className={detailStyles.autoMerged}>
                <Plus aria-hidden="true" />
                {autoMergedCount} paths auto-merged
              </span>
              <span className={detailStyles.conflicts}>
                <CircleAlert aria-hidden="true" />
                {conflictCount} conflict{conflictCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <div className={detailStyles.readinessCard}>
            <div className={detailStyles.readinessColumns}>
              <span />
              <span>{pullRequest.targetBranch}</span>
              <span>{pullRequest.sourceBranch}</span>
              <span />
            </div>
            {conflictCount > 0 ? (
              <div className={detailStyles.conflictRow}>
                <div className={detailStyles.impactPath}>
                  <PhFileText aria-hidden="true" weight="fill" />
                  <b>release_plan.rollout.branch</b>
                </div>
                <div>
                  <strong>{pullRequest.targetBranch}</strong>
                  <code>@ {baseHash}</code>
                </div>
                <div>
                  <strong>{pullRequest.sourceBranch}</strong>
                  <code>@ {headHash}</code>
                </div>
                <button onClick={() => onChangeTab('structured-diff')} type="button">
                  Resolve conflict <PhArrowRight aria-hidden="true" weight="bold" />
                </button>
              </div>
            ) : null}
            <div className={detailStyles.otherImpact}>
              <h3>
                Other merge impact <span>(auto-merge)</span>
              </h3>
            </div>
            <div className={detailStyles.impactList}>
              {impactRows.map(([path, before, after]) => (
                <div className={detailStyles.impactRow} key={path}>
                  <i />
                  <PhFileText aria-hidden="true" />
                  <b>{path}</b>
                  <span>Updated</span>
                  <div>
                    <code>{before}</code>
                    <PhArrowRight aria-hidden="true" />
                    <code>{after}</code>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <aside className={detailStyles.overviewRail}>
        <section className={detailStyles.overviewCard}>
          <h2>Branch relationship</h2>
          <div className={detailStyles.relationshipRows}>
            <div>
              <PhGitBranch aria-hidden="true" />
              <span>From</span>
              <code>
                {pullRequest.sourceBranch} @ {headHash}
              </code>
            </div>
            <div>
              <PhArrowDown aria-hidden="true" />
              <span>Into</span>
              <code>
                {pullRequest.targetBranch} @ {baseHash}
              </code>
            </div>
            <div>
              <PhGitCommit aria-hidden="true" />
              <span>Common ancestor</span>
              <code>{baseHash}</code>
            </div>
          </div>
          <div className={detailStyles.lastReview}>
            <b>Last review</b>
            <span>{pullRequest.updatedAt}</span>
          </div>
        </section>

        <section className={detailStyles.overviewCard}>
          <h2>
            Checks <span>(reviewed branch heads)</span>
          </h2>
          <div className={detailStyles.overviewChecks}>
            {checks.slice(0, 4).map((check, index) => (
              <div key={check.id}>
                {index === 0 ? (
                  <PhPlay aria-hidden="true" weight="fill" />
                ) : index === 1 ? (
                  <PhFile aria-hidden="true" />
                ) : (
                  <PhGear aria-hidden="true" weight="fill" />
                )}
                <b>{check.label}</b>
                <span
                  className={
                    check.status === 'passed' ? detailStyles.checkPassed : detailStyles.checkPending
                  }
                >
                  <CheckIcon status={check.status} />
                  {check.status === 'passed'
                    ? 'Passed'
                    : check.status === 'running'
                      ? 'Running'
                      : 'Pending'}
                </span>
                <small>{pullRequest.updatedAt}</small>
              </div>
            ))}
            <div>
              <PhCircleDashed aria-hidden="true" weight="fill" />
              <b>Merged result</b>
              <span className={detailStyles.checkPending}>
                <PhCircleDashed aria-hidden="true" weight="fill" />
                Pending
              </span>
              <small>
                {conflictCount > 0 ? 'Waiting for conflict resolution' : 'Waiting for merge'}
              </small>
            </div>
          </div>
          <button
            className={detailStyles.viewChecks}
            onClick={() => onChangeTab('checks')}
            type="button"
          >
            View all checks <PhArrowRight aria-hidden="true" weight="bold" />
          </button>
        </section>
      </aside>
    </div>
  );
}

function DetailLoadingState() {
  return (
    <div className="flex items-center gap-3 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-5 text-sm text-[var(--text-secondary)]">
      <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" />
      Loading pull request details...
    </div>
  );
}

interface PullRequestTreeRow {
  depth: number;
  feature: string;
  id: string;
  key: string;
  main: string;
  merged: string;
  path: string;
  status: 'same' | 'merged' | 'conflict';
  type: 'object' | 'string' | 'number' | 'boolean';
}

function StructuredDiffPanel({
  applyingResolution,
  conflictResolved,
  copied,
  onApplyResolution,
  onCopy,
  pullRequest,
}: {
  applyingResolution: boolean;
  conflictResolved: boolean;
  copied: boolean;
  onApplyResolution: (side: PullRequestConflictSide | null) => void;
  onCopy: () => void;
  pullRequest: ProjectPullRequest;
}) {
  const conflict = pullRequest.status === 'blocked' && !conflictResolved;
  const canEditMergedValue = pullRequest.status === 'blocked';
  const [selectedId, setSelectedId] = useState(conflict ? 'branch' : 'commit');
  const [choice, setChoice] = useState<PullRequestConflictSide | null>(null);
  const [editingMergedValue, setEditingMergedValue] = useState(false);
  const rows = useMemo<PullRequestTreeRow[]>(() => {
    const summary = pullRequest.diffSummary;
    return [
      {
        depth: 0,
        feature: 'object',
        id: 'root',
        key: 'release_plan',
        main: 'object',
        merged: 'object',
        path: 'release_plan',
        status: 'same',
        type: 'object',
      },
      {
        depth: 1,
        feature: 'object',
        id: 'summary',
        key: 'summary',
        main: 'object',
        merged: 'object',
        path: 'release_plan.summary',
        status: 'same',
        type: 'object',
      },
      {
        depth: 2,
        feature: pullRequest.title,
        id: 'title',
        key: 'title',
        main: pullRequest.title,
        merged: pullRequest.title,
        path: 'release_plan.summary.title',
        status: 'same',
        type: 'string',
      },
      {
        depth: 2,
        feature: pullRequest.description,
        id: 'description',
        key: 'description',
        main: pullRequest.description,
        merged: pullRequest.description,
        path: 'release_plan.summary.description',
        status: 'same',
        type: 'string',
      },
      {
        depth: 1,
        feature: 'object',
        id: 'rollout',
        key: 'rollout',
        main: 'object',
        merged: 'object',
        path: 'release_plan.rollout',
        status: 'same',
        type: 'object',
      },
      {
        depth: 2,
        feature: pullRequest.sourceBranch,
        id: 'branch',
        key: 'branch',
        main: pullRequest.targetBranch,
        merged:
          choice === 'main'
            ? pullRequest.targetBranch
            : conflict
              ? 'Choose value'
              : pullRequest.sourceBranch,
        path: 'release_plan.rollout.branch',
        status: conflict ? 'conflict' : 'merged',
        type: 'string',
      },
      {
        depth: 2,
        feature: shortHash(pullRequest.sourceCommitId),
        id: 'commit',
        key: 'revision',
        main: shortHash(pullRequest.targetBaseCommitId),
        merged: shortHash(pullRequest.sourceCommitId),
        path: 'release_plan.rollout.revision',
        status: 'merged',
        type: 'string',
      },
      {
        depth: 1,
        feature: 'object',
        id: 'requirements',
        key: 'requirements',
        main: 'object',
        merged: 'object',
        path: 'release_plan.requirements',
        status: 'same',
        type: 'object',
      },
      {
        depth: 2,
        feature: String(summary?.changedNodes ?? 0),
        id: 'changedNodes',
        key: 'changedNodes',
        main: '0',
        merged: String(summary?.changedNodes ?? 0),
        path: 'release_plan.requirements.changedNodes',
        status: 'merged',
        type: 'number',
      },
      {
        depth: 2,
        feature: String((pullRequest.checks ?? []).every((check) => check.status === 'passed')),
        id: 'checks',
        key: 'checksPassed',
        main: 'false',
        merged: String((pullRequest.checks ?? []).every((check) => check.status === 'passed')),
        path: 'release_plan.requirements.checksPassed',
        status: 'merged',
        type: 'boolean',
      },
    ];
  }, [choice, conflict, pullRequest]);
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0];
  const showingChoices = selected.id === 'branch' && (conflict || editingMergedValue);
  const mergedCount = rows.filter((row) => row.status === 'merged').length;
  const conflictCount = rows.filter((row) => row.status === 'conflict').length;
  const passedChecks = (pullRequest.checks ?? []).filter(
    (check) => check.status === 'passed'
  ).length;

  return (
    <div className={detailStyles.changesLayout}>
      <section className={detailStyles.diffPanel}>
        <div className={detailStyles.diffToolbar}>
          <div>
            <span className={detailStyles.addedCount}>
              ＋ {pullRequest.diffSummary?.sourceRefs ?? 0} added
            </span>
            <span className={detailStyles.modifiedCount}>∿ {mergedCount} auto-merged</span>
            <span className={detailStyles.conflictCount}>! {conflictCount} conflict</span>
          </div>
          <div className={detailStyles.viewSwitch}>
            <button className={detailStyles.viewActive} type="button">
              Structure
            </button>
            <button type="button">YAML</button>
          </div>
        </div>
        <div className={detailStyles.treeWrap}>
          <table className={detailStyles.tree}>
            <colgroup>
              <col className={detailStyles.pathColumn} />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>Path</th>
                <th>
                  Main
                  <br />
                  <code>@ {shortHash(pullRequest.targetBaseCommitId)}</code>
                </th>
                <th>
                  Feature / {pullRequest.sourceBranch}
                  <br />
                  <code>@ {shortHash(pullRequest.sourceCommitId)}</code>
                </th>
                <th>Merged result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  className={cn(
                    row.id === selected.id && detailStyles.treeSelected,
                    row.status === 'conflict' && detailStyles.treeConflict
                  )}
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                >
                  <td>
                    <span
                      className={detailStyles.treeField}
                      style={{ paddingLeft: row.depth * 22 }}
                    >
                      {row.type === 'object' ? (
                        <>
                          <PhCaretDown aria-hidden="true" />
                          <PhCube aria-hidden="true" className={detailStyles.cube} />
                        </>
                      ) : (
                        <PhFileText aria-hidden="true" className={detailStyles.file} />
                      )}
                      <b>{row.key}</b>
                      <em>{row.type}</em>
                    </span>
                  </td>
                  <td title={row.main}>{row.main}</td>
                  <td title={row.feature}>{row.feature}</td>
                  <td title={row.merged}>
                    {row.status === 'merged' ? (
                      <PhCheckCircle
                        aria-hidden="true"
                        className={detailStyles.okIcon}
                        weight="fill"
                      />
                    ) : null}
                    {row.status === 'conflict' ? (
                      <PhTilde aria-hidden="true" className={detailStyles.warnIcon} weight="bold" />
                    ) : null}
                    <span>{row.merged}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={detailStyles.previewBar}>
          <span>
            <PhFileText aria-hidden="true" />
            Merged result preview {conflict ? '(partial)' : ''}
          </span>
          <code>{selected.path}</code>
          <button type="button">View as YAML</button>
        </div>
      </section>

      <aside className={detailStyles.inspector}>
        <section className={detailStyles.inspectorCard}>
          <div className={detailStyles.inspectorHeader}>
            <h2>{showingChoices ? 'Selected conflict' : 'Selected change'}</h2>
            <button onClick={onCopy} type="button">
              <Copy aria-hidden="true" />
              {copied ? 'Copied' : 'Copy path'}
            </button>
          </div>
          <div className={detailStyles.inspectorBody}>
            <code className={detailStyles.selectedPath}>{selected.path}</code>
            <span
              className={showingChoices ? detailStyles.decisionBadge : detailStyles.changeBadge}
            >
              <PhTilde aria-hidden="true" />
              {showingChoices ? (choice ? 'Edit merged value' : 'Needs decision') : 'Modified'}
            </span>
            {showingChoices ? (
              <>
                <span className={detailStyles.fieldLabel}>Ancestor (base)</span>
                <div className={detailStyles.ancestorValue}>{pullRequest.targetBranch}</div>
                <div className={detailStyles.choiceGrid}>
                  <label className={choice === 'main' ? detailStyles.choiceActive : undefined}>
                    <input
                      aria-label="Keep main"
                      checked={choice === 'main'}
                      disabled={applyingResolution}
                      onChange={() => {
                        const next = choice === 'main' ? null : 'main';
                        setChoice(next);
                        setEditingMergedValue(false);
                        onApplyResolution(next);
                      }}
                      type="checkbox"
                    />
                    Keep main <code>{shortHash(pullRequest.targetBaseCommitId)}</code>
                    <strong>{selected.main}</strong>
                    <small>Use the current target value.</small>
                  </label>
                  <label className={choice === 'feature' ? detailStyles.choiceActive : undefined}>
                    <input
                      aria-label="Use feature"
                      checked={choice === 'feature'}
                      disabled={applyingResolution}
                      onChange={() => {
                        const next = choice === 'feature' ? null : 'feature';
                        setChoice(next);
                        setEditingMergedValue(false);
                        onApplyResolution(next);
                      }}
                      type="checkbox"
                    />
                    Use feature <code>{shortHash(pullRequest.sourceCommitId)}</code>
                    <strong>{selected.feature}</strong>
                    <small>Apply the proposed branch value.</small>
                  </label>
                </div>
              </>
            ) : (
              <div className={detailStyles.beforeAfter}>
                <div>
                  Before<span>{selected.main}</span>
                </div>
                <div>
                  After<span>{choice === 'main' ? selected.main : selected.feature}</span>
                </div>
              </div>
            )}
            <h3>Why / Source</h3>
            <div className={detailStyles.sourceRow}>
              <PhGitBranch aria-hidden="true" />
              <b>{pullRequest.targetBranch}</b>
              <code>{shortHash(pullRequest.targetBaseCommitId)}</code>
              <span>Current reviewed base.</span>
            </div>
            <div className={detailStyles.sourceRow}>
              <PhGitBranch aria-hidden="true" />
              <b>{pullRequest.sourceBranch}</b>
              <code>{shortHash(pullRequest.sourceCommitId)}</code>
              <span>{pullRequest.description}</span>
            </div>
            {canEditMergedValue && !showingChoices ? (
              <button
                className={detailStyles.editButton}
                onClick={() => {
                  setSelectedId('branch');
                  setEditingMergedValue(true);
                }}
                type="button"
              >
                <PencilLine aria-hidden="true" />
                Edit merged value
              </button>
            ) : null}
          </div>
        </section>
        <section className={detailStyles.checkCard}>
          <div className={detailStyles.checkHeader}>
            <PhCaretDown aria-hidden="true" />
            <b>Branch checks</b>
            <span>
              <PhCheckCircle aria-hidden="true" weight="fill" />
              {passedChecks} passed
            </span>
          </div>
          {(pullRequest.checks ?? []).slice(0, 3).map((check) => (
            <div className={detailStyles.compactCheck} key={check.id}>
              <CheckIcon status={check.status} />
              <span>
                <b>{check.label}</b>
                <small>{check.detail}</small>
              </span>
            </div>
          ))}
        </section>
      </aside>
    </div>
  );
}

function ChecksPanel({ checks }: { checks: PullRequestCheck[] }) {
  if (checks.length === 0) {
    return <DetailEmptyState message="No readiness checks have been recorded for this PR." />;
  }

  return (
    <div className="grid gap-3">
      {checks.map((check) => (
        <article
          className="flex items-start gap-3 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
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

function DetailEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-card)] px-5 py-8 text-center text-sm text-[var(--text-secondary)]">
      {message}
    </div>
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
