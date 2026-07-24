import type { WorkspaceCandidate } from '@/types/workspaces';

export type WorkspaceSourceView = 'chat' | 'materials';

export interface WorkspaceNavigationTarget {
  branch: string | null;
  commitHash: string | null;
  workspaceId: string | null;
  conversationId: string | null;
  sourceView: WorkspaceSourceView | null;
  explicitHandoff: boolean;
}

export type WorkspaceSelectionReason =
  | 'missing_context'
  | 'workspace_not_found'
  | 'ambiguous_workspace'
  | 'conversation_not_found';

export type WorkspaceNavigationResolution =
  | {
      status: 'default';
      candidate: WorkspaceCandidate | null;
      conversationId: null;
      sourceView: null;
      restoreStoredConversation: true;
    }
  | {
      status: 'resolved';
      candidate: WorkspaceCandidate;
      conversationId: string | null;
      sourceView: WorkspaceSourceView | null;
      restoreStoredConversation: false;
    }
  | {
      status: 'selection_required';
      candidate: null;
      conversationId: null;
      sourceView: WorkspaceSourceView | null;
      restoreStoredConversation: false;
      reason: WorkspaceSelectionReason;
    };

export interface WorkspaceHandoffHrefOptions {
  branch?: string | null;
  commitHash?: string | null;
  workspaceId?: string | null;
  conversationId?: string | null;
  sourceView?: WorkspaceSourceView | null;
}

export interface EmptyBranchWorkspaceOptions {
  baseCommitHash?: string | null;
  projectId: string;
  schemaBindings?: WorkspaceCandidate['schemaBindings'];
  targetBranch: string;
  updatedAt: string;
}

type SearchParamsReader = Pick<URLSearchParams, 'get'>;
type CommitSource = { type: string; id: string };
const WORKSPACE_CONTEXT_MARKER = '::context::';

/**
 * Parse a Workspaces URL without allowing malformed or whitespace-only values
 * to become navigation state. Any supplied target parameter marks the request
 * as an explicit handoff; only a parameter-free request is a normal entry.
 */
export function parseWorkspaceNavigationTarget(
  searchParams: SearchParamsReader
): WorkspaceNavigationTarget {
  const rawBranch = searchParams.get('branch');
  const rawCommit = searchParams.get('commit');
  const rawWorkspace = searchParams.get('workspace');
  const rawConversation = searchParams.get('conversation');
  const rawSourceView = searchParams.get('sourceView');

  return {
    branch: normalizeValue(rawBranch),
    commitHash: normalizeValue(rawCommit),
    workspaceId: normalizeValue(rawWorkspace),
    conversationId: normalizeValue(rawConversation),
    sourceView: parseSourceView(rawSourceView),
    explicitHandoff: [rawBranch, rawCommit, rawWorkspace, rawConversation, rawSourceView].some(
      (value) => value !== null
    ),
  };
}

/**
 * Resolve an explicit State-to-Workspaces handoff strictly. Explicit targets
 * never borrow the first workspace: a missing or ambiguous match must be
 * surfaced to the caller as a selection state.
 */
export function resolveWorkspaceNavigation(
  candidates: WorkspaceCandidate[],
  target: WorkspaceNavigationTarget
): WorkspaceNavigationResolution {
  if (!target.explicitHandoff) {
    return {
      status: 'default',
      candidate: candidates.at(0) ?? null,
      conversationId: null,
      sourceView: null,
      restoreStoredConversation: true,
    };
  }

  const hasBranchContext = target.branch !== null;
  const hasCommitContext = target.commitHash !== null;
  const emptyBranchHandoff = Boolean(target.workspaceId && hasBranchContext && !hasCommitContext);

  if (hasBranchContext !== hasCommitContext && !emptyBranchHandoff) {
    return selectionRequired('missing_context', target.sourceView);
  }

  if (!target.workspaceId && !hasBranchContext) {
    return selectionRequired('missing_context', target.sourceView);
  }

  const matches = target.workspaceId
    ? candidates.filter(
        (candidate) =>
          candidate.id === target.workspaceId &&
          (!emptyBranchHandoff || candidate.targetBranch === target.branch)
      )
    : candidates.filter((candidate) => {
        if (target.branch && candidate.targetBranch !== target.branch) return false;
        if (target.commitHash && !workspaceMatchesCommit(candidate, target.commitHash)) {
          return false;
        }
        return true;
      });

  if (matches.length === 0) {
    return selectionRequired('workspace_not_found', target.sourceView);
  }

  if (matches.length > 1) {
    return selectionRequired('ambiguous_workspace', target.sourceView);
  }

  const candidate = matches[0]!;
  const historicalCommitHandoff = Boolean(target.workspaceId && target.branch && target.commitHash);
  if (
    target.conversationId &&
    !historicalCommitHandoff &&
    !collectWorkspaceConversationIds(candidate).has(target.conversationId)
  ) {
    return selectionRequired('conversation_not_found', target.sourceView);
  }

  return {
    status: 'resolved',
    candidate,
    conversationId: target.conversationId,
    sourceView: target.sourceView,
    restoreStoredConversation: false,
  };
}

/** Build the persisted empty draft opened immediately after State creates a branch. */
export function createEmptyBranchWorkspace({
  baseCommitHash = null,
  projectId,
  schemaBindings = [],
  targetBranch,
  updatedAt,
}: EmptyBranchWorkspaceOptions): WorkspaceCandidate {
  const workspaceId = `workspace_branch:${encodeURIComponent(targetBranch)}`;

  return {
    id: workspaceId,
    projectId,
    title: `Branch workspace: ${targetBranch}`,
    summary: `Empty workspace for collecting source evidence on ${targetBranch}.`,
    status: 'draft',
    updatedAt,
    baseCommitHash,
    targetBranch,
    sourceBundle: [],
    schemaBindings: schemaBindings.map((binding) => ({ ...binding })),
    schemaCandidate: {
      summary: 'Collect source evidence, then generate a candidate proposal.',
      fields: [],
    },
    schemaReview: {
      verdict: 'needs_review',
      summary: 'This workspace is empty and needs source evidence.',
      gaps: ['Add source evidence for this branch.'],
    },
    yopsDraft: {
      id: `draft:${workspaceId}`,
      operations: [],
    },
    outputTargets: [],
  };
}

/**
 * Project a mutable logical workspace into the branch/commit record requested
 * by State. Older commits can outlive the workspace draft that originally
 * created them, so a historical projection gets its own context id and source
 * conversation instead of inheriting the latest draft's branch or chat.
 */
export function buildWorkspaceContextCandidate(
  candidate: WorkspaceCandidate,
  target: WorkspaceNavigationTarget
): WorkspaceCandidate {
  if (!target.branch || !target.commitHash) return candidate;
  if (
    candidate.targetBranch === target.branch &&
    workspaceMatchesCommit(candidate, target.commitHash)
  ) {
    return candidate;
  }

  return {
    ...candidate,
    id: buildWorkspaceContextId(candidate.id, target.branch, target.commitHash),
    baseCommitHash: null,
    lastCommitHash: target.commitHash,
    sourceBundle: target.conversationId
      ? [
          {
            id: `source_chat:${target.conversationId}`,
            type: 'chat',
            title: `${candidate.title} source chat`,
            conversationId: target.conversationId,
          },
        ]
      : [],
    status: 'committed',
    targetBranch: target.branch,
  };
}

/**
 * Give each branch continuation its own stable workspace record. The context
 * marker is stripped before deriving another id so repeated continuations do
 * not grow a chain of nested ids.
 */
export function buildWorkspaceContextId(
  workspaceId: string,
  branch: string,
  commitHash: string
): string {
  const baseWorkspaceId = workspaceId.split(WORKSPACE_CONTEXT_MARKER, 1)[0] || workspaceId;
  return [
    baseWorkspaceId,
    WORKSPACE_CONTEXT_MARKER,
    encodeURIComponent(branch),
    '::',
    encodeURIComponent(commitHash),
  ].join('');
}

/** Build the canonical State-to-Workspaces handoff URL in stable key order. */
export function buildWorkspaceHandoffHref(
  basePath: string,
  options: WorkspaceHandoffHrefOptions
): string {
  const params = new URLSearchParams();
  appendValue(params, 'branch', options.branch);
  appendValue(params, 'commit', options.commitHash);
  appendValue(params, 'workspace', options.workspaceId);
  appendValue(params, 'conversation', options.conversationId);
  appendValue(params, 'sourceView', options.sourceView);

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Collect every conversation represented by a workspace source bundle. */
export function collectWorkspaceConversationIds(
  candidate: WorkspaceCandidate
): ReadonlySet<string> {
  const conversationIds = new Set<string>();

  for (const source of candidate.sourceBundle ?? []) {
    addValue(conversationIds, source.conversationId);
    for (const turn of source.previewTurns ?? []) {
      addValue(conversationIds, turn.conversationId);
    }
  }

  return conversationIds;
}

/**
 * Return the conversation only when commit provenance and workspace evidence
 * have exactly one distinct conversation in common.
 */
export function findUniqueWorkspaceConversationId(
  commitSources: ReadonlyArray<CommitSource> | null | undefined,
  candidate: WorkspaceCandidate
): string | null {
  const workspaceConversationIds = collectWorkspaceConversationIds(candidate);
  const matches = new Set(
    (commitSources ?? [])
      .filter((source) => source.type === 'conversation')
      .map((source) => source.id.trim())
      .filter((id) => id && workspaceConversationIds.has(id))
  );

  return matches.size === 1 ? (matches.values().next().value ?? null) : null;
}

/** Return the single conversation recorded by commit provenance, if unique. */
export function findUniqueCommitConversationId(
  commitSources: ReadonlyArray<CommitSource> | null | undefined
): string | null {
  const conversationIds = new Set(
    (commitSources ?? [])
      .filter((source) => source.type === 'conversation')
      .map((source) => source.id.trim())
      .filter(Boolean)
  );

  return conversationIds.size === 1 ? (conversationIds.values().next().value ?? null) : null;
}

function workspaceMatchesCommit(candidate: WorkspaceCandidate, commitHash: string): boolean {
  return candidate.lastCommitHash === commitHash || candidate.baseCommitHash === commitHash;
}

function selectionRequired(
  reason: WorkspaceSelectionReason,
  sourceView: WorkspaceSourceView | null
): WorkspaceNavigationResolution {
  return {
    status: 'selection_required',
    candidate: null,
    conversationId: null,
    sourceView,
    restoreStoredConversation: false,
    reason,
  };
}

function parseSourceView(value: string | null): WorkspaceSourceView | null {
  const normalized = normalizeValue(value);
  return normalized === 'chat' || normalized === 'materials' ? normalized : null;
}

function normalizeValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function appendValue(params: URLSearchParams, key: string, value: string | null | undefined): void {
  const normalized = normalizeValue(value);
  if (normalized) params.append(key, normalized);
}

function addValue(values: Set<string>, value: string | null | undefined): void {
  const normalized = normalizeValue(value);
  if (normalized) values.add(normalized);
}
