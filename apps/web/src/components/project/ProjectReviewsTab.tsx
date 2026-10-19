'use client';

import {
  CaretDown as PhCaretDown,
  CheckCircle as PhCheckCircle,
  FileText as PhFileText,
  GitBranch as PhGitBranch,
  GitPullRequest as PhGitPullRequest,
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
  CircleDashed,
  Clock3,
  Copy,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestArrow,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { shortHash } from '@/domain/format/formatters';
import { summarizeMergeReview } from '@/domain/project/pullRequestMergeReview';
import type {
  ApiProjectPullRequest,
  ApiProjectPullRequestActivity,
  ApiProjectPullRequestCheck,
  ApiProjectPullRequestDetail,
} from '@/hooks/projects/useProjectPullRequestsApi';
import { useProjectPullRequestsApi } from '@/hooks/projects/useProjectPullRequestsApi';
import { usePullRequestChangePreview } from '@/hooks/projects/usePullRequestChangePreview';
import { cn } from '@/utils/cn';
import createStyles from './ProjectReviewsCreate.module.css';
import detailStyles from './ProjectReviewsDetail.module.css';
import listStyles from './ProjectReviewsList.module.css';
import { PullRequestChangePreview } from './PullRequestChangePreview';
import {
  type MergeDecisionSaveState,
  type MergeResolutionProgress,
  type MergeReviewLoadState,
  PullRequestMergeReviewPanel,
  type PullRequestMergeReviewPanelProps,
} from './PullRequestMergeReviewPanel';

type PullRequestStatus = 'draft' | 'open' | 'checking' | 'ready' | 'blocked' | 'merged' | 'closed';
type PullRequestListMode = 'open' | 'merged' | 'closed';
type PullRequestView = 'list' | 'create' | 'detail';
type PullRequestDetailTab = 'overview' | 'structured-diff' | 'checks' | 'activity' | 'merge';
type PullRequestCompareStatus = 'ready' | 'already_open' | 'no_changes' | 'base_empty';
type PullRequestConflictSide = 'main' | 'feature';

const LIST_STATUS_LABELS: Record<PullRequestStatus, string> = {
  draft: 'Draft',
  open: 'Checks queued',
  checking: 'Checks running',
  ready: 'Ready to merge',
  blocked: 'Needs decision',
  merged: 'Merged',
  closed: 'Closed',
};

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
  updatedAtIso?: string;
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
  mergeBaseCommitId?: string | null;
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
  merge_base_commit_id?: string | null;
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
    updatedAtIso: api.updated_at,
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
    mergeBaseCommitId: api.merge_base_commit_id ?? null,
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

export function ProjectReviewsTab({
  projectId,
  initialPullRequestNumber,
  onPullRequestNumberChange,
}: {
  projectId?: string;
  initialPullRequestNumber?: number;
  onPullRequestNumberChange?: (number?: number) => void;
} = {}) {
  const {
    closePullRequest: closeProjectPullRequest,
    createPullRequest: createProjectPullRequest,
    fetchCompareCandidates,
    fetchMergeReview,
    fetchPullRequest: fetchProjectPullRequest,
    fetchPullRequests,
    mergePullRequest: mergeProjectPullRequest,
    rerunReadiness: rerunProjectPullRequestReadiness,
    saveMergeDecision,
  } = useProjectPullRequestsApi();
  const [pullRequests, setPullRequests] = useState(() => (projectId ? [] : INITIAL_PULL_REQUESTS));
  const [listLoading, setListLoading] = useState(Boolean(projectId));
  const [listError, setListError] = useState<string | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const listId = useId();
  const searchInput = useRef<HTMLInputElement>(null);
  const [baseBranches, setBaseBranches] = useState(() => (projectId ? [] : BASE_BRANCHES));
  const [compareCandidates, setCompareCandidates] = useState(() =>
    projectId ? [] : INITIAL_COMPARE_CANDIDATES
  );
  const [mode, setMode] = useState<PullRequestListMode>('open');
  const [statusFilter, setStatusFilter] = useState<'all' | PullRequestStatus>('all');
  const [view, setView] = useState<PullRequestView>('list');
  const [selectedId, setSelectedId] = useState(
    projectId ? '' : (INITIAL_PULL_REQUESTS[0]?.id ?? '')
  );
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
  const [compareError, setCompareError] = useState<string | null>(null);
  const editedCreateFields = useRef({ title: false, description: false });
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
  const [conflictProgress, setConflictProgress] = useState<MergeResolutionProgress | null>(null);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const handleResolutionChange = useCallback(
    (decision: MergeDecision | null, progress: MergeResolutionProgress) => {
      setConflictDecision(decision);
      setConflictProgress(progress);
    },
    []
  );
  const openedDeepLink = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const key = initialPullRequestNumber ? `${projectId}:${initialPullRequestNumber}` : null;
    if (openedDeepLink.current === key) return;
    openedDeepLink.current = key;
    if (!key || !initialPullRequestNumber) {
      setView('list');
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailError(null);
    setSelectedId('');
    setView('detail');
    setDetailLoadingId(key);
    fetchProjectPullRequest(projectId, initialPullRequestNumber)
      .then((detail) => {
        if (cancelled) return;
        const mapped = toProjectPullRequestDetail(detail);
        setPullRequests((items) => [
          mapped,
          ...items.filter((item) => item.number !== mapped.number),
        ]);
        setSelectedId(mapped.id);
        if (mapped.status === 'blocked') setDetailTab('structured-diff');
      })
      .catch((err) => {
        if (!cancelled)
          setDetailError(
            err instanceof Error ? err.message : 'Could not load pull request details.'
          );
      })
      .finally(() => {
        if (!cancelled) setDetailLoadingId(null);
      });
    return () => {
      cancelled = true;
      if (openedDeepLink.current === key) openedDeepLink.current = null;
    };
  }, [fetchProjectPullRequest, initialPullRequestNumber, projectId]);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    setListLoading(true);
    setListError(null);
    fetchPullRequests(projectId)
      .then((data) => {
        if (!cancelled)
          setPullRequests((current) => {
            const listed = data.pull_requests.map((item) => {
              const previous = current.find((entry) => entry.number === item.number);
              return previous?.checks ? previous : toProjectPullRequest(item);
            });
            const linkedDetail = current.find(
              (entry) => entry.number === initialPullRequestNumber && entry.checks
            );
            return linkedDetail && !listed.some((entry) => entry.number === linkedDetail.number)
              ? [linkedDetail, ...listed]
              : listed;
          });
      })
      .catch((err) => {
        if (!cancelled) {
          setListError(err instanceof Error ? err.message : 'Could not load pull requests');
        }
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchPullRequests, initialPullRequestNumber, listRefreshKey, projectId]);

  useEffect(() => {
    if (!projectId || view !== 'create') return;

    let cancelled = false;
    setApiError(null);
    setCompareCandidates([]);
    setCompareError(null);
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
          setCompareError(
            err instanceof Error ? err.message : 'Could not load comparable branches'
          );
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
  const selectedPullRequest = pullRequests.find((item) => item.id === selectedId);

  const visiblePullRequests = useMemo(() => {
    const source =
      mode === 'open'
        ? openPullRequests
        : mode === 'merged'
          ? mergedPullRequests
          : closedPullRequests;
    const normalized = query.toLowerCase().trim();
    return source.filter((item) => {
      if (mode === 'open' && statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!normalized) return true;
      if (/^#\d+$/.test(normalized)) return item.number === Number(normalized.slice(1));
      if (normalized === String(item.number)) return true;
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

  const listCount =
    mode === 'open'
      ? openPullRequests.length
      : mode === 'merged'
        ? mergedPullRequests.length
        : closedPullRequests.length;
  const hasListFilters = Boolean(query.trim()) || (mode === 'open' && statusFilter !== 'all');
  const listUnavailable = listLoading || Boolean(listError);
  const changeListMode = (nextMode: PullRequestListMode) => {
    setMode(nextMode);
    setStatusFilter('all');
  };
  const clearListFilters = () => {
    setQuery('');
    setStatusFilter('all');
    searchInput.current?.focus();
  };

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
      description: editedCreateFields.current.description
        ? form.description
        : selectedCompareCandidate.description,
      sourceBranch: selectedCompareCandidate.branch,
      targetBranch: selectedCompareCandidate.baseBranch,
      title: editedCreateFields.current.title ? form.title : selectedCompareCandidate.title,
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
    setConflictProgress(null);
    setResolutionError(null);
    setDetailTab('structured-diff');
    setView('detail');

    if (projectId && onPullRequestNumberChange) {
      onPullRequestNumberChange(pullRequest.number);
      return;
    }

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

  const openExistingPullRequest = (number: number) => {
    const existing = pullRequests.find((item) => item.number === number);
    if (existing) {
      openPullRequest(existing);
      return;
    }
    if (onPullRequestNumberChange) {
      onPullRequestNumberChange(number);
      return;
    }
    if (!projectId) return;

    setSelectedId('');
    setHighlightedId(null);
    setCloseConfirmId(null);
    setCloseError(null);
    setMergeError(null);
    setReadinessError(null);
    setConflictDecision(null);
    setConflictProgress(null);
    setResolutionError(null);
    setDetailError(null);
    setDetailLoadingId(`pr-${number}`);
    setDetailTab('structured-diff');
    setView('detail');
    fetchProjectPullRequest(projectId, number)
      .then((detail) => {
        const mapped = toProjectPullRequestDetail(detail);
        setPullRequests((items) => [mapped, ...items.filter((item) => item.number !== number)]);
        setSelectedId(mapped.id);
      })
      .catch((err) => {
        setDetailError(err instanceof Error ? err.message : 'Could not load pull request details.');
      })
      .finally(() => setDetailLoadingId(null));
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

    editedCreateFields.current = { title: false, description: false };
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
        editedCreateFields.current = { title: false, description: false };
        const mapped = toProjectPullRequestDetail(created);
        setPullRequests((items) => [mapped, ...items]);
        markCompareCandidateOpened(mapped.sourceBranch, mapped.targetBranch, mapped.number);
        setApiError(null);
        if (mapped.status === 'blocked') {
          openPullRequest(mapped);
          return;
        }
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

  /** Local fixture PRs have no merge draft; one side settles their single sample conflict. */
  const applyResolution = (side: PullRequestConflictSide | null) => {
    setResolutionError(null);
    setConflictDecision(
      side === null
        ? null
        : {
            conflictResolutions: { fixture: side === 'feature' ? 'source' : 'target' },
            keepFromSource: [],
            keepFromTarget: [],
            keepRelationsFromSource: true,
            keepRelationsFromTarget: true,
          }
    );
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
        setConflictDecision(null);
        setConflictProgress(null);
        if (mapped.status === 'blocked') setDetailTab('structured-diff');
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
        projectId={projectId}
        baseBranches={baseBranches}
        canCreate={canCreatePullRequest}
        candidates={visibleCompareCandidates}
        compareError={compareError}
        compareLoading={compareLoading}
        creating={creating}
        error={apiError}
        form={createForm}
        onBack={() => setView('list')}
        onChange={(next) => {
          if (next.title !== createForm.title) editedCreateFields.current.title = true;
          if (next.description !== createForm.description) {
            editedCreateFields.current.description = true;
          }
          setCreateForm(next);
        }}
        onSelectCandidate={(candidate) => {
          setCreateForm((form) => ({
            description: editedCreateFields.current.description
              ? form.description
              : candidate.description,
            sourceBranch: candidate.branch,
            targetBranch: candidate.baseBranch,
            title: editedCreateFields.current.title ? form.title : candidate.title,
          }));
        }}
        onOpenExisting={openExistingPullRequest}
        onCreate={createPullRequest}
        onRefresh={() => setCompareRefreshKey((key) => key + 1)}
        selectedCandidate={selectedCompareCandidate}
      />
    );
  }

  if (view === 'detail' && !selectedPullRequest && detailLoadingId) {
    return <output className={listStyles.page}>Loading pull request…</output>;
  }

  if (view === 'detail' && !selectedPullRequest && detailError) {
    return (
      <section className={listStyles.page}>
        <p role="alert">{detailError}</p>
        <button
          onClick={() => {
            onPullRequestNumberChange?.(undefined);
            setView('list');
          }}
          type="button"
        >
          Back to pull requests
        </button>
      </section>
    );
  }

  if (view === 'detail' && selectedPullRequest) {
    return (
      <PullRequestDetailView
        closeConfirmationActive={closeConfirmId === selectedPullRequest.id}
        closeError={closeError}
        closing={closingId === selectedPullRequest.id}
        conflictProgress={conflictProgress}
        conflictResolved={conflictDecision !== null}
        detailError={detailError}
        detailLoading={detailLoadingId === selectedPullRequest.id}
        detailTab={detailTab}
        mergeError={mergeError}
        fetchMergeReview={fetchMergeReview}
        merging={mergingId === selectedPullRequest.id}
        onApplyResolution={applyResolution}
        onResolutionChange={handleResolutionChange}
        onBack={() => {
          onPullRequestNumberChange?.(undefined);
          setView('list');
        }}
        onCancelClose={() => setCloseConfirmId(null)}
        onClose={() => closePullRequest(selectedPullRequest)}
        onChangeTab={setDetailTab}
        onMerge={() => mergePullRequest(selectedPullRequest)}
        onRerun={() => rerunReadiness(selectedPullRequest)}
        projectId={projectId}
        pullRequest={selectedPullRequest}
        readinessError={readinessError}
        resolutionError={resolutionError}
        rerunning={rerunningId === selectedPullRequest.id}
        saveMergeDecision={saveMergeDecision}
      />
    );
  }

  return (
    <section className={listStyles.listPage}>
      <header className={listStyles.pageHeader}>
        <div>
          <h1>Pull requests</h1>
          <p>Review proposed changes and follow their progress.</p>
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
        <div
          aria-label="Pull request states"
          className={listStyles.modes}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            const tabs = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')
            );
            const index = tabs.indexOf(event.target as HTMLButtonElement);
            if (index < 0) return;
            event.preventDefault();
            const nextIndex =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? tabs.length - 1
                  : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            tabs[nextIndex]?.focus();
            tabs[nextIndex]?.click();
          }}
          role="tablist"
        >
          <ModeButton
            active={mode === 'open'}
            controlsId={`${listId}-panel`}
            count={listUnavailable ? null : openPullRequests.length}
            id={`${listId}-open`}
            label="Open"
            onClick={() => changeListMode('open')}
          />
          <ModeButton
            active={mode === 'merged'}
            controlsId={`${listId}-panel`}
            count={listUnavailable ? null : mergedPullRequests.length}
            id={`${listId}-merged`}
            label="Merged"
            onClick={() => changeListMode('merged')}
          />
          <ModeButton
            active={mode === 'closed'}
            controlsId={`${listId}-panel`}
            count={listUnavailable ? null : closedPullRequests.length}
            id={`${listId}-closed`}
            label="Closed"
            onClick={() => changeListMode('closed')}
          />
        </div>
        <div className={listStyles.filters}>
          <label className={listStyles.search}>
            <Search aria-hidden="true" />
            <input
              aria-label="Search pull requests"
              disabled={listUnavailable}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, branch, or #number"
              ref={searchInput}
              type="search"
              value={query}
            />
          </label>
          {mode === 'open' ? (
            <label className={listStyles.statusSelect}>
              <select
                aria-label="Pull request status"
                disabled={listUnavailable}
                onChange={(event) =>
                  setStatusFilter(event.target.value as 'all' | PullRequestStatus)
                }
                value={statusFilter}
              >
                <option value="all">All statuses</option>
                <option value="ready">Ready to merge</option>
                <option value="checking">Checks running</option>
                <option value="open">Checks queued</option>
                <option value="blocked">Needs decision</option>
                <option value="draft">Draft</option>
              </select>
              <ChevronDown aria-hidden="true" />
            </label>
          ) : null}
          {hasListFilters && !listUnavailable ? (
            <button className={listStyles.clearFilters} onClick={clearListFilters} type="button">
              Clear filters
            </button>
          ) : null}
          <output aria-live="polite" className={listStyles.resultCount}>
            {listLoading
              ? 'Loading…'
              : listError
                ? ''
                : hasListFilters
                  ? `${visiblePullRequests.length} of ${listCount}`
                  : `${listCount} pull request${listCount === 1 ? '' : 's'}`}
          </output>
        </div>
      </div>

      <div
        aria-busy={listLoading}
        aria-labelledby={`${listId}-${mode}`}
        className={listStyles.tableWrap}
        id={`${listId}-panel`}
        role="tabpanel"
      >
        {listLoading ? (
          <div aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <div className={listStyles.loadingRow} key={index}>
                <span className={listStyles.skeletonTitle} />
                <span className={listStyles.skeletonMeta} />
              </div>
            ))}
          </div>
        ) : listError ? (
          <section className={listStyles.empty} role="alert">
            <CircleAlert aria-hidden="true" />
            <h2>Could not load pull requests</h2>
            <p>{listError}</p>
            <Button
              onClick={() => setListRefreshKey((key) => key + 1)}
              type="button"
              variant="outline"
            >
              Try again
            </Button>
          </section>
        ) : visiblePullRequests.length > 0 ? (
          <ul className={listStyles.rows}>
            {visiblePullRequests.map((pullRequest) => (
              <li key={pullRequest.id}>
                <PullRequestRow
                  highlighted={pullRequest.id === highlightedId}
                  onOpen={() => openPullRequest(pullRequest)}
                  pullRequest={pullRequest}
                />
              </li>
            ))}
          </ul>
        ) : (
          <section className={listStyles.empty}>
            {hasListFilters ? (
              <SearchX aria-hidden="true" />
            ) : (
              <GitPullRequestArrow aria-hidden="true" />
            )}
            <h2>
              {hasListFilters
                ? 'No matching pull requests'
                : pullRequests.length === 0
                  ? 'Propose your first change'
                  : `No ${mode} pull requests`}
            </h2>
            <p>
              {hasListFilters
                ? 'Try a different search or clear the filters.'
                : pullRequests.length === 0
                  ? 'Create a pull request to review changes between branches.'
                  : mode === 'merged'
                    ? 'Merged pull requests will appear here.'
                    : mode === 'closed'
                      ? 'Pull requests closed without merging will appear here.'
                      : 'New proposals will appear here when they are opened.'}
            </p>
            {hasListFilters ? (
              <Button onClick={clearListFilters} type="button" variant="outline">
                Clear filters
              </Button>
            ) : pullRequests.length === 0 ? (
              <Button
                onClick={() => {
                  setApiError(null);
                  setView('create');
                }}
                type="button"
                variant="commit"
              >
                New pull request
              </Button>
            ) : null}
          </section>
        )}
      </div>
    </section>
  );
}

function ModeButton({
  active,
  controlsId,
  count,
  id,
  label,
  onClick,
}: {
  active: boolean;
  controlsId: string;
  count: number | null;
  id: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-controls={controlsId}
      aria-label={count === null ? label : `${count} ${label}`}
      aria-selected={active}
      className={cn(listStyles.mode, active && listStyles.modeActive)}
      id={id}
      onClick={onClick}
      role="tab"
      tabIndex={active ? 0 : -1}
      type="button"
    >
      <span>{label}</span>
      <span className={listStyles.modeCount}>{count ?? '—'}</span>
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
    <button
      aria-label={`View PR #${pullRequest.number}: ${pullRequest.title}, ${LIST_STATUS_LABELS[pullRequest.status]}`}
      className={listStyles.row}
      onClick={onOpen}
      type="button"
    >
      <span
        className={cn(listStyles.rowIcon, pullRequest.status === 'merged' && listStyles.mergedIcon)}
      >
        {pullRequest.status === 'merged' ? (
          <GitMerge aria-hidden="true" />
        ) : pullRequest.status === 'closed' ? (
          <XCircle aria-hidden="true" />
        ) : (
          <GitPullRequestArrow aria-hidden="true" />
        )}
      </span>
      <span className={listStyles.requestBody}>
        <span className={listStyles.title}>
          {pullRequest.title}
          <small>#{pullRequest.number}</small>
          {highlighted ? <em>New</em> : null}
        </span>
        <span className={listStyles.branches}>
          <code>{pullRequest.sourceBranch}</code>
          <span className={listStyles.branchTarget}>
            <ArrowRight aria-hidden="true" />
            <code>{pullRequest.targetBranch}</code>
          </span>
          {pullRequest.author ? (
            <span className={listStyles.author}>
              <span aria-hidden="true">·</span> {pullRequest.author}
            </span>
          ) : null}
        </span>
      </span>
      <span className={listStyles.rowMeta}>
        <ListReadinessBadge pullRequest={pullRequest} />
        <time
          className={listStyles.updated}
          dateTime={pullRequest.updatedAtIso}
          title={pullRequest.updatedAt}
        >
          {pullRequest.updatedAtIso
            ? new Date(pullRequest.updatedAtIso).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })
            : pullRequest.updatedAt}
        </time>
      </span>
    </button>
  );
}

function ListReadinessBadge({ pullRequest }: { pullRequest: ProjectPullRequest }) {
  const icons = {
    ready: CheckCircle2,
    blocked: CircleAlert,
    checking: RefreshCw,
    open: Clock3,
    draft: CircleDashed,
    merged: GitMerge,
    closed: XCircle,
  };
  const Icon = icons[pullRequest.status];

  return (
    <span
      className={cn(
        listStyles.readiness,
        pullRequest.status === 'merged'
          ? listStyles.readinessMerged
          : pullRequest.status === 'ready'
            ? listStyles.readinessSuccess
            : pullRequest.status === 'blocked'
              ? listStyles.readinessWarning
              : listStyles.readinessMuted
      )}
    >
      <Icon
        aria-hidden="true"
        className={pullRequest.status === 'checking' ? listStyles.checking : undefined}
      />
      {LIST_STATUS_LABELS[pullRequest.status]}
    </span>
  );
}

function compareCommitLabel(hash: string | null | undefined): string {
  if (!hash) return 'No commit';
  const normalized = hash.startsWith('sha:') ? `sha256:${hash.slice(4)}` : hash;
  return shortHash(normalized);
}

function scrollToChangePreview() {
  const preview = document.getElementById('change-preview');
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  preview?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  preview?.focus({ preventScroll: true });
}

function getCreateComparisonState({
  canCreate,
  compareError,
  compareLoading,
  creating,
  selectedCandidate,
}: {
  canCreate: boolean;
  compareError: string | null;
  compareLoading: boolean;
  creating: boolean;
  selectedCandidate: PullRequestCompareCandidate | null;
}) {
  if (creating) {
    return {
      label: 'Creating pull request',
      detail: 'Opening the pull request with these revisions…',
      tone: 'pending',
    };
  }
  if (compareLoading) {
    return {
      label: 'Comparing branches',
      detail: 'Loading branch comparisons...',
      tone: 'pending',
    };
  }
  if (compareError) {
    return { label: 'Comparison unavailable', detail: compareError, tone: 'warning' };
  }
  if (!selectedCandidate) {
    return {
      label: 'No comparable branches',
      detail: 'No other committed branches can be compared with this base.',
      tone: 'muted',
    };
  }
  if (selectedCandidate.status === 'already_open') {
    return {
      label: selectedCandidate.openPullRequestNumber
        ? `PR #${selectedCandidate.openPullRequestNumber} already open`
        : 'Pull request already open',
      detail: `This source branch already has an open pull request into ${selectedCandidate.baseBranch}.`,
      tone: 'warning',
    };
  }
  if (selectedCandidate.status === 'base_empty' || !selectedCandidate.baseCommitId) {
    return {
      label: 'Base has no commit',
      detail: 'Choose a base branch with a commit to compare these changes.',
      tone: 'warning',
    };
  }
  if (selectedCandidate.aheadBy <= 0) {
    return {
      label: selectedCandidate.statusLabel,
      detail: 'The source branch has no commits ahead of this base.',
      tone: 'muted',
    };
  }
  if (selectedCandidate.status === 'no_changes') {
    return {
      label: 'No semantic changes',
      detail: 'These branches have no structured changes to propose.',
      tone: 'muted',
    };
  }
  if (canCreate) {
    return {
      label: 'Ready to create',
      detail: 'Review the description and changes before opening the pull request.',
      tone: 'ready',
    };
  }
  return {
    label: 'Select branches',
    detail: 'Choose a source and base branch to continue.',
    tone: 'muted',
  };
}

function PullRequestCreateView({
  projectId,
  baseBranches,
  canCreate,
  candidates,
  compareError,
  compareLoading,
  creating,
  error,
  form,
  onBack,
  onChange,
  onCreate,
  onOpenExisting,
  onRefresh,
  onSelectCandidate,
  selectedCandidate,
}: {
  projectId?: string;
  baseBranches: string[];
  canCreate: boolean;
  candidates: PullRequestCompareCandidate[];
  compareError: string | null;
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
  onOpenExisting: (number: number) => void;
  onRefresh: () => void;
  onSelectCandidate: (candidate: PullRequestCompareCandidate) => void;
  selectedCandidate: PullRequestCompareCandidate | null;
}) {
  const createId = useId();
  const fieldPreview = usePullRequestChangePreview(
    projectId,
    selectedCandidate?.headCommitId,
    selectedCandidate?.mergeBaseCommitId ?? selectedCandidate?.baseCommitId
  );
  const update = (patch: Partial<typeof form>) => onChange({ ...form, ...patch });
  const sourceOptions =
    candidates.length > 0
      ? candidates.map((candidate) => ({ status: candidate.statusLabel, value: candidate.branch }))
      : form.sourceBranch
        ? [{ value: form.sourceBranch }]
        : [];
  const state = getCreateComparisonState({
    canCreate,
    compareError,
    compareLoading,
    creating,
    selectedCandidate,
  });
  const existingNumber =
    selectedCandidate?.status === 'already_open' && !compareLoading && !compareError
      ? selectedCandidate.openPullRequestNumber
      : null;
  const changedNodeCount = selectedCandidate?.changedNodes;
  const previewRows = selectedCandidate
    ? [
        {
          kind: selectedCandidate.changedNodes > 0 ? 'modified' : 'unchanged',
          label: 'Changed nodes',
          value: selectedCandidate.changedNodes,
        },
        {
          kind: selectedCandidate.yopsChanges > 0 ? 'modified' : 'unchanged',
          label: 'YOps changes',
          value: selectedCandidate.yopsChanges,
        },
        {
          kind: selectedCandidate.outputImpacts > 0 ? 'modified' : 'unchanged',
          label: 'Output impact',
          value: selectedCandidate.outputImpacts,
        },
      ]
    : [];
  const StateIcon =
    state.tone === 'pending'
      ? RefreshCw
      : state.tone === 'ready'
        ? CheckCircle2
        : state.tone === 'warning'
          ? CircleAlert
          : CircleDashed;

  return (
    <section className={createStyles.page}>
      <header className={createStyles.header}>
        <nav aria-label="Breadcrumb" className={createStyles.breadcrumb}>
          <button disabled={creating} onClick={onBack} type="button">
            Pull requests
          </button>
          <span aria-hidden="true">/</span>
          <span aria-current="page">New</span>
        </nav>
        <h1>New pull request</h1>
        <p>Propose committed changes for review before merging into the base branch.</p>
      </header>

      <section aria-label="Branch comparison" className={createStyles.comparison}>
        <div className={createStyles.branchBar}>
          <div className={createStyles.branchField}>
            <span id={`${createId}-source-label`}>Source branch</span>
            <CreateBranchSelect
              ariaLabel="Source branch"
              disabled={compareLoading || creating || sourceOptions.length === 0}
              onChange={(sourceBranch) => {
                const next = candidates.find((candidate) => candidate.branch === sourceBranch);
                if (next) onSelectCandidate(next);
              }}
              options={sourceOptions}
              placeholder="Choose source branch"
              value={form.sourceBranch}
            />
            <small>
              <span>Source commit</span>
              <code title={selectedCandidate?.headCommitId}>
                {compareLoading
                  ? 'Comparing…'
                  : selectedCandidate
                    ? compareCommitLabel(selectedCandidate.headCommitId)
                    : '—'}
              </code>
            </small>
          </div>
          <ArrowRight aria-hidden="true" className={createStyles.branchArrow} />
          <div className={createStyles.branchField}>
            <span id={`${createId}-base-label`}>Base branch</span>
            <CreateBranchSelect
              ariaLabel="Base branch"
              disabled={compareLoading || creating || baseBranches.length === 0}
              onChange={(targetBranch) => update({ sourceBranch: '', targetBranch })}
              options={baseBranches.map((branch) => ({ value: branch }))}
              placeholder="Choose base branch"
              value={form.targetBranch}
            />
            <small>
              <span>Base commit</span>
              <code title={selectedCandidate?.baseCommitId ?? undefined}>
                {compareLoading
                  ? 'Comparing…'
                  : selectedCandidate
                    ? compareCommitLabel(selectedCandidate.baseCommitId)
                    : '—'}
              </code>
            </small>
          </div>
          <Button
            aria-label="Refresh branch comparisons"
            className={createStyles.refreshButton}
            disabled={compareLoading || creating}
            onClick={onRefresh}
            type="button"
            variant="canvas-ghost"
          >
            <RefreshCw
              aria-hidden="true"
              className={compareLoading ? createStyles.spinning : undefined}
            />
            Refresh
          </Button>
        </div>
        <div aria-live="polite" className={createStyles.comparisonMessage} data-tone={state.tone}>
          <StateIcon
            aria-hidden="true"
            className={state.tone === 'pending' ? createStyles.spinning : undefined}
          />
          <p id={`${createId}-reason`}>{state.detail}</p>
          {compareError ? (
            <button onClick={onRefresh} type="button">
              Try again
            </button>
          ) : null}
        </div>
      </section>

      <div className={createStyles.columns}>
        <div className={createStyles.mainColumn}>
          <div className={createStyles.formFields}>
            <label>
              <span>Title</span>
              <input
                aria-label="Title"
                disabled={creating}
                onChange={(event) => update({ title: event.target.value })}
                value={form.title}
              />
            </label>
            <label>
              <span>
                Description <small>Optional</small>
              </span>
              <textarea
                aria-label="Description"
                disabled={creating}
                onChange={(event) => update({ description: event.target.value })}
                placeholder="Describe what changed and why."
                value={form.description}
              />
            </label>
            {!projectId ? <p className={createStyles.author}>Author · YOps (demo)</p> : null}
          </div>

          <section
            aria-labelledby={`${createId}-preview-title`}
            className={createStyles.preview}
            id="change-preview"
            tabIndex={-1}
          >
            <div className={createStyles.sectionHeading}>
              <h2 id={`${createId}-preview-title`}>Change preview</h2>
              <span>Read only</span>
            </div>
            <p>
              {selectedCandidate
                ? `Review what differs between ${selectedCandidate.branch} and the comparison base.`
                : 'Select a source branch to preview the structured comparison.'}
            </p>
            {fieldPreview.loading ? (
              <output className={cn('block', createStyles.inlineMessage)}>
                Loading field changes…
              </output>
            ) : null}
            {fieldPreview.error ? (
              <output className={cn('block', createStyles.inlineMessage)}>
                {fieldPreview.error}
              </output>
            ) : null}
            {fieldPreview.changes && !fieldPreview.error && selectedCandidate ? (
              <PullRequestChangePreview
                baseBranch={selectedCandidate.baseBranch}
                changes={fieldPreview.changes}
                sourceBranch={selectedCandidate.branch}
              />
            ) : (
              <div className={createStyles.previewList}>
                {previewRows.length > 0 ? (
                  previewRows.map((row) => (
                    <div className={createStyles.previewRow} key={row.label}>
                      <span className={createStyles.previewLabel}>{row.label}</span>
                      <ChangeKindBadge kind={row.kind} />
                      <span className={createStyles.previewValue}>{row.value}</span>
                    </div>
                  ))
                ) : (
                  <div className={createStyles.previewEmpty}>
                    No structured comparison is ready yet.
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <aside aria-label="Creation summary" className={createStyles.sidebar}>
          <h2>Creation summary</h2>
          <div
            aria-live="polite"
            className={createStyles.summaryStatus}
            data-tone={state.tone}
            id={`${createId}-status`}
          >
            <StateIcon
              aria-hidden="true"
              className={state.tone === 'pending' ? createStyles.spinning : undefined}
            />
            <strong>{state.label}</strong>
          </div>
          {existingNumber ? (
            <button
              className={createStyles.textLink}
              onClick={() => onOpenExisting(existingNumber)}
              type="button"
            >
              View PR #{existingNumber}
              <ArrowRight aria-hidden="true" />
            </button>
          ) : null}
          <div className={createStyles.changesRow}>
            <span>
              {changedNodeCount === undefined
                ? 'Changes not available'
                : `${changedNodeCount} node${changedNodeCount === 1 ? '' : 's'} changed`}
            </span>
            {selectedCandidate ? (
              <button onClick={scrollToChangePreview} type="button">
                View changes
              </button>
            ) : null}
          </div>
          <div className={createStyles.checks}>
            <h3>Checks run after opening</h3>
            <p>
              <CircleDashed aria-hidden="true" />
              <span>
                Schema validation<small>Results will appear on the pull request.</small>
              </span>
            </p>
          </div>
          <div className={createStyles.actionBar}>
            <p aria-hidden="true" className={createStyles.mobileStatus}>
              {state.label}
            </p>
            {error ? (
              <p className={createStyles.errorMessage} role="alert">
                {error}
              </p>
            ) : null}
            <Button
              aria-describedby={`${createId}-status ${createId}-reason`}
              className={createStyles.createButton}
              disabled={!canCreate || creating}
              onClick={onCreate}
              type="button"
              variant="commit"
            >
              {creating ? (
                <RefreshCw aria-hidden="true" className={createStyles.spinning} />
              ) : (
                <GitPullRequest aria-hidden="true" />
              )}
              {creating ? 'Creating...' : 'Create pull request'}
            </Button>
            <button
              className={createStyles.backLink}
              disabled={creating}
              onClick={onBack}
              type="button"
            >
              Back to pull requests
            </button>
          </div>
        </aside>
      </div>
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
      <SelectTrigger
        aria-label={ariaLabel}
        className={createStyles.branchSelect}
        title={value || placeholder}
      >
        <GitBranch aria-hidden="true" />
        <SelectValue placeholder={placeholder}>{value || undefined}</SelectValue>
      </SelectTrigger>
      <SelectContent
        align="start"
        className={createStyles.branchMenu}
        position="popper"
        sideOffset={8}
      >
        {options.map((option) => (
          <SelectItem className={createStyles.branchOption} key={option.value} value={option.value}>
            {option.status ? `${option.value} · ${option.status}` : option.value}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
  closeConfirmationActive,
  closeError,
  closing,
  conflictProgress,
  conflictResolved,
  detailError,
  detailLoading,
  detailTab,
  fetchMergeReview,
  mergeError,
  merging,
  onApplyResolution,
  onBack,
  onCancelClose,
  onClose,
  onChangeTab,
  onMerge,
  onRerun,
  onResolutionChange,
  projectId,
  pullRequest,
  readinessError,
  resolutionError,
  rerunning,
  saveMergeDecision,
}: {
  closeConfirmationActive: boolean;
  closeError: string | null;
  closing: boolean;
  conflictProgress: MergeResolutionProgress | null;
  conflictResolved: boolean;
  detailError: string | null;
  detailLoading: boolean;
  detailTab: PullRequestDetailTab;
  fetchMergeReview: PullRequestMergeReviewPanelProps['fetchMergeReview'];
  mergeError: string | null;
  merging: boolean;
  onApplyResolution: (side: PullRequestConflictSide | null) => void;
  onBack: () => void;
  onCancelClose: () => void;
  onClose: () => void;
  onChangeTab: (tab: PullRequestDetailTab) => void;
  onMerge: () => void;
  onRerun: () => void;
  onResolutionChange: PullRequestMergeReviewPanelProps['onResolutionChange'];
  projectId?: string;
  pullRequest: ProjectPullRequest;
  readinessError: string | null;
  resolutionError: string | null;
  rerunning: boolean;
  saveMergeDecision: PullRequestMergeReviewPanelProps['saveMergeDecision'];
}) {
  const [copied, setCopied] = useState(false);
  const tabsId = useId();
  // Keep one review session across tabs so pending decision saves are not discarded.
  const reviewKey = `${pullRequest.number}:${pullRequest.mergeDraftId ?? 'none'}:${pullRequest.updatedAtIso ?? ''}`;
  const [loadedReview, setLoadedReview] = useState<(MergeReviewLoadState & { key: string }) | null>(
    null
  );
  const [savedDecision, setSavedDecision] = useState<{
    key: string;
    state: MergeDecisionSaveState;
  } | null>(null);
  const onReviewChange = useCallback(
    (state: MergeReviewLoadState) => {
      setLoadedReview({ ...state, key: reviewKey });
    },
    [reviewKey]
  );
  const onSaveStateChange = useCallback(
    (state: MergeDecisionSaveState) => {
      setSavedDecision({ state, key: reviewKey });
    },
    [reviewKey]
  );
  const reviewState =
    loadedReview?.key === reviewKey
      ? loadedReview
      : {
          review: null,
          loading: Boolean(projectId && pullRequest.mergeDraftId),
          error: null,
        };
  const saveState = savedDecision?.key === reviewKey ? savedDecision.state : 'idle';
  const terminal = ['merged', 'closed'].includes(pullRequest.status);
  const busy = closing || merging || rerunning || detailLoading || saveState === 'saving';
  const ready = pullRequest.status === 'ready' || conflictResolved;
  const checks = pullRequest.checks ?? [];
  const passedChecks = checks.filter((check) => check.status === 'passed').length;
  const progress = projectId && !reviewState.review ? null : conflictProgress;
  const readinessMessage = terminal
    ? pullRequest.status === 'merged'
      ? `Merged into ${pullRequest.targetBranch}.`
      : 'Closed without merging.'
    : conflictResolved
      ? saveState === 'saving'
        ? 'All conflicts decided. Saving decisions…'
        : saveState === 'error'
          ? 'Decisions could not be saved. Retry before merging.'
          : 'All conflicts decided. Merge is ready.'
      : progress && progress.unresolved > 0
        ? `${progress.unresolved} of ${progress.total} conflicts still need a decision.`
        : pullRequest.status === 'blocked'
          ? 'Review the blocked checks and unresolved changes.'
          : ready
            ? `${passedChecks} of ${checks.length} checks passed. Ready to merge.`
            : pullRequest.status === 'checking'
              ? 'Checks are running.'
              : 'Run checks to confirm merge readiness.';
  const error = closeError ?? readinessError ?? detailError ?? mergeError ?? resolutionError;

  return (
    <section className={detailStyles.page}>
      <header className={detailStyles.header}>
        <button className={detailStyles.breadcrumb} disabled={busy} onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" /> Pull requests / <strong>#{pullRequest.number}</strong>
        </button>
        <div className={detailStyles.titleRow}>
          <h1>{pullRequest.title}</h1>
          <ListReadinessBadge pullRequest={pullRequest} />
        </div>
        <div className={detailStyles.refs} aria-label="Merge direction">
          <span>
            <GitBranch aria-hidden="true" />
            <b>{pullRequest.sourceBranch}</b>
            <code>{shortHash(pullRequest.sourceCommitId)}</code>
          </span>
          <ArrowRight aria-label="into" />
          <span>
            <GitBranch aria-hidden="true" />
            <b>{pullRequest.targetBranch}</b>
            <code>{shortHash(pullRequest.targetBaseCommitId)}</code>
          </span>
        </div>
        <div className={detailStyles.metadata}>
          <span>Opened by {pullRequest.author}</span>
          <span>{pullRequest.updatedAt}</span>
          {reviewState.review ? (
            <span>
              Common ancestor{' '}
              <code>
                {reviewState.review.merge_base_commit_id
                  ? shortHash(reviewState.review.merge_base_commit_id)
                  : 'None'}
              </code>
            </span>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className={detailStyles.notice} role="alert">
          {error}
        </div>
      ) : null}
      {closeConfirmationActive ? (
        <output className={detailStyles.notice}>
          <span>
            Close without merging? This moves the PR to Closed and leaves the target branch
            unchanged.
          </span>
          <button disabled={closing} onClick={onCancelClose} type="button">
            Cancel
          </button>
        </output>
      ) : null}

      <div aria-label="Pull request detail" className={detailStyles.tabs} role="tablist">
        {DETAIL_TABS.map((tab, index) => (
          <button
            aria-controls={`${tabsId}-panel-${tab.id}`}
            aria-selected={detailTab === tab.id}
            className={detailTab === tab.id ? detailStyles.tabActive : undefined}
            id={`${tabsId}-tab-${tab.id}`}
            key={tab.id}
            onClick={() => onChangeTab(tab.id)}
            onKeyDown={(event) => {
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? DETAIL_TABS.length - 1
                    : event.key === 'ArrowRight'
                      ? (index + 1) % DETAIL_TABS.length
                      : event.key === 'ArrowLeft'
                        ? (index + DETAIL_TABS.length - 1) % DETAIL_TABS.length
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              onChangeTab(DETAIL_TABS[next].id);
              document.getElementById(`${tabsId}-tab-${DETAIL_TABS[next].id}`)?.focus();
            }}
            role="tab"
            tabIndex={detailTab === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={detailStyles.content}>
        {DETAIL_TABS.map((tab) => (
          <div
            aria-labelledby={`${tabsId}-tab-${tab.id}`}
            hidden={detailTab !== tab.id}
            id={`${tabsId}-panel-${tab.id}`}
            key={tab.id}
            role="tabpanel"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Tab panels must remain keyboard reachable when their content has no focusable controls.
            tabIndex={0}
          >
            {detailLoading ? (
              detailTab === tab.id ? (
                <DetailLoadingState />
              ) : null
            ) : tab.id === 'overview' ? (
              detailTab === tab.id ? (
                <OverviewPanel
                  onChangeTab={onChangeTab}
                  pullRequest={pullRequest}
                  reviewState={reviewState}
                  readinessMessage={readinessMessage}
                />
              ) : null
            ) : tab.id === 'checks' ? (
              detailTab === tab.id ? (
                <ChecksPanel checks={checks} />
              ) : null
            ) : projectId ? (
              <PullRequestMergeReviewPanel
                fetchMergeReview={fetchMergeReview}
                key={reviewKey}
                onRerun={onRerun}
                onResolutionChange={onResolutionChange}
                onReviewChange={onReviewChange}
                onSaveStateChange={onSaveStateChange}
                projectId={projectId}
                pullRequest={pullRequest}
                readOnly={terminal}
                rerunning={rerunning}
                saveMergeDecision={saveMergeDecision}
              />
            ) : detailTab === tab.id ? (
              <StructuredDiffPanel
                applyingResolution={false}
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
            ) : null}
          </div>
        ))}
      </div>

      <footer className={detailStyles.footer}>
        <div className={detailStyles.footerSummary} aria-live="polite">
          <span>{detailLoading ? 'Loading pull request details…' : readinessMessage}</span>
          {!terminal && saveState !== 'idle' ? (
            <small data-state={saveState}>
              {saveState === 'saving'
                ? 'Saving decisions…'
                : saveState === 'saved'
                  ? 'Decisions saved'
                  : 'Save failed'}
              {saveState === 'error' && detailTab !== 'structured-diff' ? (
                <button onClick={() => onChangeTab('structured-diff')} type="button">
                  Review save error
                </button>
              ) : null}
            </small>
          ) : null}
        </div>
        {!terminal ? (
          <div className={detailStyles.footerActions}>
            <button
              className={detailStyles.secondaryAction}
              disabled={busy}
              onClick={onClose}
              type="button"
            >
              {closing ? 'Closing…' : closeConfirmationActive ? 'Confirm close' : 'Close PR'}
            </button>
            {['open', 'ready', 'blocked'].includes(pullRequest.status) ? (
              <button
                aria-label="Rerun readiness"
                className={detailStyles.secondaryAction}
                disabled={busy}
                onClick={onRerun}
                type="button"
              >
                <RefreshCw aria-hidden="true" className={rerunning ? 'animate-spin' : undefined} />
                {rerunning ? 'Rerunning…' : 'Rerun checks'}
              </button>
            ) : null}
            <button
              aria-label="Merge PR"
              className={detailStyles.mergeButton}
              disabled={!ready || busy || saveState === 'error'}
              onClick={onMerge}
              type="button"
            >
              <GitMerge aria-hidden="true" />
              {merging ? 'Merging…' : `Merge into ${pullRequest.targetBranch}`}
            </button>
          </div>
        ) : null}
      </footer>
    </section>
  );
}

function OverviewPanel({
  onChangeTab,
  pullRequest,
  reviewState,
  readinessMessage,
}: {
  onChangeTab: (tab: PullRequestDetailTab) => void;
  pullRequest: ProjectPullRequest;
  reviewState: MergeReviewLoadState;
  readinessMessage: string;
}) {
  const summary = reviewState.review ? summarizeMergeReview(reviewState.review) : null;
  const checks = pullRequest.checks ?? [];
  const passed = checks.filter((check) => check.status === 'passed').length;
  return (
    <div className={detailStyles.overviewGrid}>
      <div className={detailStyles.overviewMain}>
        <section className={detailStyles.overviewSection}>
          <h2>Description</h2>
          <p className={!pullRequest.description ? detailStyles.muted : undefined}>
            {pullRequest.description || 'No description provided.'}
          </p>
        </section>
        <section className={detailStyles.overviewSection}>
          <div className={detailStyles.sectionHeading}>
            <h2>Change summary</h2>
            <button
              className={detailStyles.textButton}
              onClick={() => onChangeTab('structured-diff')}
              type="button"
            >
              View changes <ArrowRight aria-hidden="true" />
            </button>
          </div>
          {summary ? (
            <>
              <p>
                {summary.nodes} changed node{summary.nodes === 1 ? '' : 's'} · {summary.fields}{' '}
                changed field{summary.fields === 1 ? '' : 's'}
              </p>
              <dl className={detailStyles.summaryStats}>
                <div>
                  <dt>Added</dt>
                  <dd>{summary.added}</dd>
                </div>
                <div>
                  <dt>Auto-merged</dt>
                  <dd>{summary.autoMerged}</dd>
                </div>
                <div>
                  <dt>Conflicts</dt>
                  <dd>{summary.conflicts}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className={detailStyles.muted}>
              {reviewState.loading
                ? 'Loading the merge comparison…'
                : reviewState.error
                  ? `Comparison unavailable: ${reviewState.error}`
                  : 'A prepared merge comparison is not available yet.'}
            </p>
          )}
        </section>
        <section className={detailStyles.overviewSection}>
          <h2>
            {['merged', 'closed'].includes(pullRequest.status) ? 'Outcome' : 'Merge readiness'}
          </h2>
          <p>{readinessMessage}</p>
        </section>
      </div>
      <aside className={detailStyles.overviewAside}>
        <div className={detailStyles.sectionHeading}>
          <h2>Checks</h2>
          <span>
            {passed} of {checks.length} passed
          </span>
        </div>
        {checks.length ? (
          <ul className={detailStyles.checkSummary}>
            {checks.map((check) => (
              <li key={check.id}>
                <CheckIcon status={check.status} />
                <span>{check.label}</span>
                <span className={detailStyles.checkStatus} data-status={check.status}>
                  {CHECK_STATUS_LABELS[check.status]}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={detailStyles.muted}>No readiness checks recorded.</p>
        )}
        <button
          className={detailStyles.textButton}
          onClick={() => onChangeTab('checks')}
          type="button"
        >
          View all checks <ArrowRight aria-hidden="true" />
        </button>
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
                  {pullRequest.targetBranch}
                  <code>@ {shortHash(pullRequest.targetBaseCommitId)}</code>
                </th>
                <th>
                  {pullRequest.sourceBranch}
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
                        <PhCaretDown aria-hidden="true" />
                      ) : (
                        <span style={{ width: 14, flex: 'none' }} />
                      )}
                      <span className={detailStyles.typeIcon} data-type={row.type}>
                        {row.type === 'object'
                          ? '{ }'
                          : row.type === 'number'
                            ? '123'
                            : row.type === 'boolean'
                              ? 'T/F'
                              : 'abc'}
                      </span>
                      <b>{row.key}</b>
                      <em>{row.type}</em>
                    </span>
                  </td>
                  <td title={row.main}>
                    {row.type !== 'object' && (
                      <span className={detailStyles.treeValue}>{row.main}</span>
                    )}
                  </td>
                  <td title={row.feature}>
                    {row.type !== 'object' && (
                      <span className={detailStyles.treeValue}>{row.feature}</span>
                    )}
                  </td>
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
                    {row.type !== 'object' && (
                      <span className={detailStyles.treeValue}>{row.merged}</span>
                    )}
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

const CHECK_STATUS_LABELS: Record<PullRequestCheck['status'], string> = {
  passed: 'Passed',
  failed: 'Failed',
  blocked: 'Blocked',
  warning: 'Warning',
  pending: 'Pending',
  running: 'Running',
};

function ChecksPanel({ checks }: { checks: PullRequestCheck[] }) {
  if (checks.length === 0) {
    return <DetailEmptyState message="No readiness checks have been recorded for this PR." />;
  }
  return (
    <section className={detailStyles.checksPanel} aria-label="Readiness checks">
      <div className={detailStyles.sectionHeading}>
        <h2>Readiness checks</h2>
        <span>
          {checks.filter((check) => check.status === 'passed').length} of {checks.length} passed
        </span>
      </div>
      <p className={detailStyles.checksIntro}>
        Results and supporting evidence for the reviewed commits.
      </p>
      <div className={detailStyles.checkRows}>
        {checks.map((check) => (
          <article className={detailStyles.checkRow} key={check.id}>
            <CheckIcon status={check.status} />
            <div className={detailStyles.checkContent}>
              <h3>{check.label}</h3>
              {check.detail.length > 180 ? (
                <>
                  <p>{check.detail.slice(0, 180)}…</p>
                  <details className={detailStyles.checkEvidence}>
                    <summary>View full evidence</summary>
                    <p>{check.detail}</p>
                  </details>
                </>
              ) : (
                <p>{check.detail || 'No additional evidence recorded.'}</p>
              )}
            </div>
            <span className={detailStyles.checkStatus} data-status={check.status}>
              {CHECK_STATUS_LABELS[check.status]}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function DetailEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-card)] px-5 py-8 text-center text-sm text-[var(--text-secondary)]">
      {message}
    </div>
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
