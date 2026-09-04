export const WORKSPACE_CONTRACT_SCHEMA = 't3x.application/workspace-contract/v1' as const;

export type WorkspaceSurfaceMode = 'compose' | 'review';

export type WorkspaceLifecycleState = 'drafting' | 'preparing' | 'ready' | 'stale' | 'blocked';

export type WorkspaceActorKind = 'human' | 'agent' | 'service';

export interface WorkspaceActorRef {
  readonly kind: WorkspaceActorKind;
  readonly id: string;
}

export type WorkspaceInteractionFeedback =
  | 'pending'
  | 'disabled_reason'
  | 'success'
  | 'error'
  | 'conflict'
  | 'retry'
  | 'duplicate_click';

export type WorkspaceBackendInteractionKind = 'command' | 'query' | 'local_view';

export type WorkspaceInteractionId =
  | 'source.add'
  | 'source.open'
  | 'source.include'
  | 'source.pin'
  | 'instruction.update'
  | 'candidate.generate'
  | 'candidate.edit'
  | 'draft.save'
  | 'draft.retry'
  | 'review.prepare'
  | 'review.open_pane'
  | 'review.accept'
  | 'review.reject'
  | 'review.override'
  | 'commit.exact'
  | 'receipt.copy'
  | 'review.retry'
  | 'review.edit_in_compose'
  | 'scenario.create'
  | 'scenario.duplicate'
  | 'scenario.rename'
  | 'scenario.archive'
  | 'scenario.switch'
  | 'scenario.compare'
  | 'collaboration.refresh'
  | 'collaboration.review_remote_changes'
  | 'collaboration.keep_mine'
  | 'collaboration.apply_after_refresh';

export interface WorkspaceInteractionContract {
  readonly id: WorkspaceInteractionId;
  readonly surface: WorkspaceSurfaceMode;
  readonly backend: WorkspaceBackendInteractionKind;
  readonly requiresRequestId: boolean;
  readonly requiresIfRevision: boolean;
  readonly payloadFields: readonly string[];
  readonly feedback: readonly WorkspaceInteractionFeedback[];
}

export const WORKSPACE_REQUIRED_FEEDBACK = [
  'pending',
  'disabled_reason',
  'success',
  'error',
] as const satisfies readonly WorkspaceInteractionFeedback[];

const COMMAND_FEEDBACK = [
  ...WORKSPACE_REQUIRED_FEEDBACK,
  'conflict',
  'retry',
  'duplicate_click',
] as const satisfies readonly WorkspaceInteractionFeedback[];

const QUERY_FEEDBACK = [
  'pending',
  'disabled_reason',
  'success',
  'error',
] as const satisfies readonly WorkspaceInteractionFeedback[];

const LOCAL_VIEW_FEEDBACK = ['success'] as const satisfies readonly WorkspaceInteractionFeedback[];

export const WORKSPACE_INTERACTION_CONTRACTS = [
  {
    id: 'source.add',
    surface: 'compose',
    backend: 'command',
    requiresRequestId: true,
    requiresIfRevision: true,
    payloadFields: ['source'],
    feedback: COMMAND_FEEDBACK,
  },
  {
    id: 'source.open',
    surface: 'compose',
    backend: 'query',
    requiresRequestId: false,
    requiresIfRevision: false,
    payloadFields: ['source_id'],
    feedback: QUERY_FEEDBACK,
  },
  {
    id: 'source.include',
    surface: 'compose',
    backend: 'command',
    requiresRequestId: true,
    requiresIfRevision: true,
    payloadFields: ['source_id', 'included'],
    feedback: COMMAND_FEEDBACK,
  },
  {
    id: 'source.pin',
    surface: 'compose',
    backend: 'command',
    requiresRequestId: true,
    requiresIfRevision: true,
    payloadFields: ['source_id', 'pinned'],
    feedback: COMMAND_FEEDBACK,
  },
  {
    id: 'instruction.update',
    surface: 'compose',
    backend: 'command',
    requiresRequestId: true,
    requiresIfRevision: true,
    payloadFields: ['instruction'],
    feedback: COMMAND_FEEDBACK,
  },
  {
    id: 'candidate.generate',
    surface: 'compose',
    backend: 'command',
    requiresRequestId: true,
    requiresIfRevision: true,
    payloadFields: ['instruction', 'included_source_ids'],
    feedback: COMMAND_FEEDBACK,
  },
  {
    id: 'candidate.edit',
    surface: 'compose',
    backend: 'command',
    requiresRequestId: true,
    requiresIfRevision: true,
    payloadFields: ['candidate_patch'],
    feedback: COMMAND_FEEDBACK,
  },
  {
    id: 'draft.save',
    surface: 'compose',
    backend: 'command',
    requiresRequestId: true,
    requiresIfRevision: true,
    payloadFields: ['draft_patch'],
    feedback: COMMAND_FEEDBACK,
  },
  {
    id: 'draft.retry',
    surface: 'compose',
    backend: 'command',
    requiresRequestId: true,
    requiresIfRevision: true,
    payloadFields: ['failed_request_id'],
    feedback: COMMAND_FEEDBACK,
  },
  {
    id: 'review.prepare',
    surface: 'compose',
    backend: 'command',
    requiresRequestId: true,
    requiresIfRevision: true,
    payloadFields: ['draft_revision', 'scenario_id'],
    feedback: COMMAND_FEEDBACK,
  },
  {
    id: 'review.open_pane',
    surface: 'review',
    backend: 'local_view',
    requiresRequestId: false,
    requiresIfRevision: false,
    payloadFields: ['pane'],
    feedback: LOCAL_VIEW_FEEDBACK,
  },
  {
    id: 'review.accept',
    surface: 'review',
    backend: 'command',
    requiresRequestId: true,
    requiresIfRevision: false,
    payloadFields: ['snapshot_id', 'transition_id', 'precondition'],
    feedback: COMMAND_FEEDBACK,
  },
  {
    id: 'review.reject',
    surface: 'review',
    backend: 'command',
    requiresRequestId: true,
    requiresIfRevision: false,
    payloadFields: ['snapshot_id', 'transition_id', 'precondition', 'reason'],
    feedback: COMMAND_FEEDBACK,
  },
  {
    id: 'review.override',
    surface: 'review',
    backend: 'command',
    requiresRequestId: true,
    requiresIfRevision: false,
    payloadFields: ['snapshot_id', 'transition_id', 'precondition', 'reason'],
    feedback: COMMAND_FEEDBACK,
  },
  {
    id: 'commit.exact',
    surface: 'review',
    backend: 'command',
    requiresRequestId: true,
    requiresIfRevision: false,
    payloadFields: ['snapshot_id', 'transition_id', 'expected_head'],
    feedback: COMMAND_FEEDBACK,
  },
  {
    id: 'receipt.copy',
    surface: 'review',
    backend: 'local_view',
    requiresRequestId: false,
    requiresIfRevision: false,
    payloadFields: ['receipt_id'],
    feedback: LOCAL_VIEW_FEEDBACK,
  },
  {
    id: 'review.retry',
    surface: 'review',
    backend: 'command',
    requiresRequestId: true,
    requiresIfRevision: false,
    payloadFields: ['failed_request_id'],
    feedback: COMMAND_FEEDBACK,
  },
  {
    id: 'review.edit_in_compose',
    surface: 'review',
    backend: 'local_view',
    requiresRequestId: false,
    requiresIfRevision: false,
    payloadFields: ['workspace_id'],
    feedback: LOCAL_VIEW_FEEDBACK,
  },
  {
    id: 'scenario.create',
    surface: 'compose',
    backend: 'command',
    requiresRequestId: true,
    requiresIfRevision: true,
    payloadFields: ['name'],
    feedback: COMMAND_FEEDBACK,
  },
  {
    id: 'scenario.duplicate',
    surface: 'compose',
    backend: 'command',
    requiresRequestId: true,
    requiresIfRevision: true,
    payloadFields: ['source_scenario_id', 'name'],
    feedback: COMMAND_FEEDBACK,
  },
  {
    id: 'scenario.rename',
    surface: 'compose',
    backend: 'command',
    requiresRequestId: true,
    requiresIfRevision: true,
    payloadFields: ['scenario_id', 'name'],
    feedback: COMMAND_FEEDBACK,
  },
  {
    id: 'scenario.archive',
    surface: 'compose',
    backend: 'command',
    requiresRequestId: true,
    requiresIfRevision: true,
    payloadFields: ['scenario_id'],
    feedback: COMMAND_FEEDBACK,
  },
  {
    id: 'scenario.switch',
    surface: 'compose',
    backend: 'query',
    requiresRequestId: false,
    requiresIfRevision: false,
    payloadFields: ['scenario_id'],
    feedback: QUERY_FEEDBACK,
  },
  {
    id: 'scenario.compare',
    surface: 'review',
    backend: 'query',
    requiresRequestId: false,
    requiresIfRevision: false,
    payloadFields: ['left_scenario_id', 'right_scenario_id'],
    feedback: QUERY_FEEDBACK,
  },
  {
    id: 'collaboration.refresh',
    surface: 'compose',
    backend: 'query',
    requiresRequestId: false,
    requiresIfRevision: false,
    payloadFields: ['workspace_id', 'scenario_id'],
    feedback: QUERY_FEEDBACK,
  },
  {
    id: 'collaboration.review_remote_changes',
    surface: 'review',
    backend: 'query',
    requiresRequestId: false,
    requiresIfRevision: false,
    payloadFields: ['base_revision', 'remote_revision'],
    feedback: QUERY_FEEDBACK,
  },
  {
    id: 'collaboration.keep_mine',
    surface: 'compose',
    backend: 'local_view',
    requiresRequestId: false,
    requiresIfRevision: false,
    payloadFields: ['local_revision', 'remote_revision'],
    feedback: LOCAL_VIEW_FEEDBACK,
  },
  {
    id: 'collaboration.apply_after_refresh',
    surface: 'compose',
    backend: 'command',
    requiresRequestId: true,
    requiresIfRevision: true,
    payloadFields: ['base_revision', 'remote_revision', 'local_patch'],
    feedback: COMMAND_FEEDBACK,
  },
] as const satisfies readonly WorkspaceInteractionContract[];

export interface WorkspaceCommandEnvelope<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly schema: typeof WORKSPACE_CONTRACT_SCHEMA;
  readonly command: WorkspaceInteractionId;
  readonly projectId: string;
  readonly workspaceId: string;
  readonly scenarioId?: string;
  readonly actor: WorkspaceActorRef;
  readonly requestId: string;
  readonly ifRevision?: number;
  readonly reason?: string;
  readonly payload: TPayload;
}

export interface WorkspaceCommandReceipt {
  readonly schema: typeof WORKSPACE_CONTRACT_SCHEMA;
  readonly command: WorkspaceInteractionId;
  readonly projectId: string;
  readonly workspaceId: string;
  readonly scenarioId?: string;
  readonly actor: WorkspaceActorRef;
  readonly requestId: string;
  readonly requestDigest: string;
  readonly resultKind: 'draft' | 'review_snapshot' | 'decision' | 'commit' | 'scenario';
  readonly resultDigest: string;
  readonly baseRevision?: number;
  readonly resultRevision?: number;
  readonly reason?: string;
  readonly createdAt: string;
}

export type WorkspacePrepareReviewStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timed_out'
  | 'canceled';

export interface WorkspacePrepareReviewOperation {
  readonly schema: typeof WORKSPACE_CONTRACT_SCHEMA;
  readonly projectId: string;
  readonly workspaceId: string;
  readonly scenarioId?: string;
  readonly requestId: string;
  readonly status: WorkspacePrepareReviewStatus;
  readonly draftRevision: number;
  readonly snapshotId?: string;
  readonly transitionId?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const WORKSPACE_PREPARE_REVIEW_TERMINAL_STATUSES = [
  'succeeded',
  'failed',
  'timed_out',
  'canceled',
] as const satisfies readonly WorkspacePrepareReviewStatus[];

export function isWorkspacePrepareReviewTerminal(status: WorkspacePrepareReviewStatus): boolean {
  return (WORKSPACE_PREPARE_REVIEW_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export type WorkspaceCurrentnessReason =
  | 'draft_revision_changed'
  | 'ref_head_changed'
  | 'effect_digest_changed'
  | 'proposal_digest_changed'
  | 'statement_digests_changed'
  | 'policy_digest_changed'
  | 'prepare_failed'
  | 'decision_rejected'
  | 'scenario_archived';

export interface WorkspaceReviewFingerprint {
  readonly draftRevision: number;
  readonly refHead: string | null;
  readonly effectDigest: string;
  readonly proposalDigest: string;
  readonly statementDigests: readonly string[];
  readonly policyDigest: string;
}

export interface WorkspaceCurrentnessInput {
  readonly snapshot?: WorkspaceReviewFingerprint & {
    readonly decisionOutcome?: 'accepted' | 'overridden' | 'rejected';
  };
  readonly current: WorkspaceReviewFingerprint;
  readonly prepareStatus?: WorkspacePrepareReviewStatus;
  readonly scenarioArchived?: boolean;
}

export interface WorkspaceCurrentnessView {
  readonly state: WorkspaceLifecycleState;
  readonly reasons: readonly WorkspaceCurrentnessReason[];
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const orderedLeft = [...left].sort();
  const orderedRight = [...right].sort();
  return orderedLeft.every((value, index) => value === orderedRight[index]);
}

export function deriveWorkspaceCurrentness(
  input: WorkspaceCurrentnessInput
): WorkspaceCurrentnessView {
  if (input.prepareStatus === 'queued' || input.prepareStatus === 'running') {
    return { state: 'preparing', reasons: [] };
  }
  if (input.scenarioArchived) {
    return { state: 'blocked', reasons: ['scenario_archived'] };
  }
  if (input.prepareStatus === 'failed' || input.prepareStatus === 'timed_out') {
    return { state: 'blocked', reasons: ['prepare_failed'] };
  }
  if (input.snapshot === undefined) {
    return { state: 'drafting', reasons: [] };
  }

  const reasons: WorkspaceCurrentnessReason[] = [];
  if (input.snapshot.draftRevision !== input.current.draftRevision) {
    reasons.push('draft_revision_changed');
  }
  if (input.snapshot.refHead !== input.current.refHead) {
    reasons.push('ref_head_changed');
  }
  if (input.snapshot.effectDigest !== input.current.effectDigest) {
    reasons.push('effect_digest_changed');
  }
  if (input.snapshot.proposalDigest !== input.current.proposalDigest) {
    reasons.push('proposal_digest_changed');
  }
  if (!sameStringSet(input.snapshot.statementDigests, input.current.statementDigests)) {
    reasons.push('statement_digests_changed');
  }
  if (input.snapshot.policyDigest !== input.current.policyDigest) {
    reasons.push('policy_digest_changed');
  }
  if (reasons.length > 0) return { state: 'stale', reasons };
  if (input.snapshot.decisionOutcome === 'rejected') {
    return { state: 'blocked', reasons: ['decision_rejected'] };
  }
  return { state: 'ready', reasons: [] };
}

export function workspaceInteractionContractIssues(
  contracts: readonly WorkspaceInteractionContract[] = WORKSPACE_INTERACTION_CONTRACTS
): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const contract of contracts) {
    if (seen.has(contract.id)) issues.push(`${contract.id}: duplicate interaction id`);
    seen.add(contract.id);

    if (contract.backend === 'command' && !contract.requiresRequestId) {
      issues.push(`${contract.id}: commands require request_id`);
    }
    if (contract.backend !== 'command' && contract.requiresIfRevision) {
      issues.push(`${contract.id}: only commands may require if_revision`);
    }
    if (contract.backend === 'command') {
      for (const feedback of COMMAND_FEEDBACK) {
        if (!contract.feedback.includes(feedback)) {
          issues.push(`${contract.id}: missing ${feedback} feedback`);
        }
      }
    }
    if (contract.requiresIfRevision && !contract.feedback.includes('conflict')) {
      issues.push(`${contract.id}: revision commands must surface conflict feedback`);
    }
  }
  return issues;
}
