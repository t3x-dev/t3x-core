import { createHash } from 'node:crypto';
import {
  type ProposalStatement,
  type SemanticContent,
  type SourcedYOp,
  validateSource,
} from '@t3x-dev/core';
import {
  type AnyDB,
  findConversationById,
  findTurnsByHashes,
  recordEvent,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { canonicalizeProtocolValue, type ProtocolValue } from '@t3x-dev/transition';
import { runApiExtractionV2 } from './extraction-v2';
import type { InferenceRuntime, InferenceScope } from './inference';
import {
  resolveWorkspaceExtractionContext,
  WorkspaceTransitionReviewStaleError,
} from './workspace-transition';

type ActorRef = ProposalStatement['actor'];

export const WORKSPACE_EXTRACTION_PROPOSAL_SCHEMA =
  't3x.dev/workspace-extraction-proposal/v1' as const;

export interface ConversationSourceSelector {
  type: 'conversation';
  id: string;
  turnHashes: string[];
}

export interface CreateWorkspaceExtractionProposalInput {
  projectId: string;
  workspaceId: string;
  source: ConversationSourceSelector;
  expectedRevision?: number;
  provider?: string;
  model?: string;
  userId?: string;
  actor: ActorRef;
  inference: {
    runtime: InferenceRuntime;
    runId: string;
    scope: InferenceScope;
  };
}

export interface WorkspaceExtractionProposal {
  schema: typeof WORKSPACE_EXTRACTION_PROPOSAL_SCHEMA;
  sourceSelector: ConversationSourceSelector;
  sourceSelectorDigest: string;
  baseCommitHash: string | null;
  mode: 'bootstrap' | 'incremental';
  operations: SourcedYOp[];
  result: SemanticContent;
  actor: ActorRef;
  createdAt: string;
}

export interface CreatedWorkspaceExtractionProposal {
  candidateId: string;
  proposal: WorkspaceExtractionProposal;
  workspace: Record<string, unknown>;
}

export interface WorkspaceExtractionTransitionSource {
  candidateId: string;
  operations: ProtocolValue[];
  baseCommitHash: string | null;
  workspaceRevision: number;
}

export class WorkspaceExtractionProposalError extends Error {
  constructor(
    readonly kind:
      | 'source_not_found'
      | 'source_project_mismatch'
      | 'source_selector_invalid'
      | 'provider_unavailable'
      | 'extraction_failed',
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'WorkspaceExtractionProposalError';
  }
}

function digest(label: string, value: unknown): `sha256:${string}` {
  return `sha256:${createHash('sha256')
    .update(`${label}\0${canonicalizeProtocolValue(value as ProtocolValue)}`, 'utf8')
    .digest('hex')}`;
}

function extractionCandidateId(input: {
  sourceSelectorDigest: string;
  baseCommitHash: string | null;
  operations: readonly ProtocolValue[];
}): string {
  return `candidate:${digest('t3x-workspace-extraction-candidate-v1', input).slice(
    'sha256:'.length
  )}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function storedExtractionProposal(
  workspace: Record<string, unknown>
): WorkspaceExtractionProposal | null {
  const value = workspace.extractionProposal;
  if (!isRecord(value) || value.schema !== WORKSPACE_EXTRACTION_PROPOSAL_SCHEMA) return null;
  const selector = value.sourceSelector;
  const actor = value.actor;
  const result = value.result;
  if (
    !isRecord(selector) ||
    selector.type !== 'conversation' ||
    typeof selector.id !== 'string' ||
    selector.id.trim().length === 0 ||
    !Array.isArray(selector.turnHashes) ||
    selector.turnHashes.length === 0 ||
    selector.turnHashes.length > 200 ||
    !selector.turnHashes.every((hash) => typeof hash === 'string' && hash.length > 0) ||
    new Set(selector.turnHashes).size !== selector.turnHashes.length ||
    typeof value.sourceSelectorDigest !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(value.sourceSelectorDigest) ||
    (value.baseCommitHash !== null && typeof value.baseCommitHash !== 'string') ||
    (typeof value.baseCommitHash === 'string' &&
      !/^sha256:[0-9a-f]{64}$/.test(value.baseCommitHash)) ||
    !['bootstrap', 'incremental'].includes(String(value.mode)) ||
    !Array.isArray(value.operations) ||
    value.operations.length === 0 ||
    value.operations.length > 1000 ||
    !isRecord(result) ||
    !Array.isArray(result.trees) ||
    !Array.isArray(result.relations) ||
    !isRecord(actor) ||
    !['human', 'agent', 'service'].includes(String(actor.kind)) ||
    typeof actor.id !== 'string' ||
    actor.id.trim().length === 0 ||
    typeof value.createdAt !== 'string'
  ) {
    return null;
  }
  try {
    for (const operation of value.operations) canonicalizeProtocolValue(operation as ProtocolValue);
  } catch {
    return null;
  }
  return value as unknown as WorkspaceExtractionProposal;
}

/** Resolve and integrity-check one server-owned extraction candidate for Transition proposal use. */
export async function resolveWorkspaceExtractionTransitionSource(
  db: AnyDB,
  input: {
    projectId: string;
    workspaceId: string;
    candidateId: string;
    expectedRevision?: number;
  }
): Promise<WorkspaceExtractionTransitionSource> {
  const context = await resolveWorkspaceExtractionContext(db, input);
  if (context.workspace.backendCandidateId !== input.candidateId) {
    throw new WorkspaceTransitionReviewStaleError();
  }
  const proposal = storedExtractionProposal(context.workspace);
  if (proposal === null || proposal.operations.length === 0) {
    throw new TypeError('Workspace extraction candidate is missing or invalid');
  }
  const expectedSelectorDigest = digest(
    't3x-workspace-extraction-source-selector-v1',
    proposal.sourceSelector
  );
  if (proposal.sourceSelectorDigest !== expectedSelectorDigest) {
    throw new TypeError('Workspace extraction candidate source selector failed integrity checking');
  }
  const expectedCandidateId = extractionCandidateId({
    sourceSelectorDigest: proposal.sourceSelectorDigest,
    baseCommitHash: proposal.baseCommitHash,
    operations: proposal.operations as unknown as ProtocolValue[],
  });
  if (expectedCandidateId !== input.candidateId) {
    throw new TypeError('Workspace extraction candidate identity failed integrity checking');
  }
  if (proposal.baseCommitHash !== context.refHead) {
    throw new WorkspaceTransitionReviewStaleError();
  }
  const conversation = await findConversationById(db, proposal.sourceSelector.id);
  if (conversation === null || conversation.projectId !== input.projectId) {
    throw new TypeError('Workspace extraction candidate Source is unavailable in this project');
  }
  const turns = await findTurnsByHashes(db, {
    conversationId: conversation.conversationId,
    turnHashes: proposal.sourceSelector.turnHashes,
  });
  const selectedHashes = new Set(proposal.sourceSelector.turnHashes);
  const selectedTurns = turns
    .filter((turn) => selectedHashes.has(turn.turnHash))
    .map((turn) => ({ turn_hash: turn.turnHash, content: turn.content }));
  if (selectedTurns.length !== selectedHashes.size) {
    throw new TypeError('Workspace extraction candidate Source turns are unavailable');
  }
  const sourceValidation = validateSource(proposal.operations, selectedTurns);
  if (!sourceValidation.ok) {
    throw new TypeError(
      `Workspace extraction candidate provenance failed verification: ${sourceValidation.failingOps
        .map((failure) => `${failure.opIndex}:${failure.reason}`)
        .join(', ')}`
    );
  }
  const operations = proposal.operations.map((operation) => {
    const { source: _source, ...effectOperation } = operation;
    return effectOperation as unknown as ProtocolValue;
  });
  return {
    candidateId: input.candidateId,
    operations: structuredClone(operations),
    baseCommitHash: proposal.baseCommitHash,
    workspaceRevision: context.workspaceRevision,
  };
}

function workspaceTitle(workspace: Record<string, unknown>, fallback: string): string {
  return typeof workspace.title === 'string' && workspace.title.trim() ? workspace.title : fallback;
}

function reopenedWorkspace(
  workspace: Record<string, unknown>,
  baseCommitHash: string | null
): Record<string, unknown> {
  if (workspace.status !== 'committed' && typeof workspace.lastCommitHash !== 'string') {
    return workspace;
  }
  const { lastCommitHash: _lastCommitHash, status: _status, ...editable } = workspace;
  return {
    ...editable,
    ...(baseCommitHash === null ? {} : { baseCommitHash }),
    status: 'schema_review',
  };
}

function extractionError(
  result: Extract<Awaited<ReturnType<typeof runApiExtractionV2>>, { ok: false }>
): WorkspaceExtractionProposalError {
  if (result.kind === 'conversation_not_found') {
    return new WorkspaceExtractionProposalError('source_not_found', result.message);
  }
  if (result.kind === 'invalid_request') {
    return new WorkspaceExtractionProposalError('source_selector_invalid', result.message);
  }
  if (result.kind === 'provider_unavailable') {
    return new WorkspaceExtractionProposalError('provider_unavailable', result.message);
  }
  return new WorkspaceExtractionProposalError('extraction_failed', result.message, {
    failure_code: result.failure?.code,
    ...result.failure?.details,
  });
}

/**
 * Resolve immutable Source turns and the target Workspace baseline on the server,
 * then persist the v2 SourcedYOps as an application proposal projection.
 */
export async function createWorkspaceExtractionProposal(
  db: AnyDB,
  input: CreateWorkspaceExtractionProposalInput
): Promise<CreatedWorkspaceExtractionProposal> {
  const selectedHashes = [...new Set(input.source.turnHashes)];
  if (selectedHashes.length === 0 || selectedHashes.length !== input.source.turnHashes.length) {
    throw new WorkspaceExtractionProposalError(
      'source_selector_invalid',
      'Source selector requires unique immutable turn hashes'
    );
  }

  const context = await resolveWorkspaceExtractionContext(db, {
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    expectedRevision: input.expectedRevision,
  });
  const conversation = await findConversationById(db, input.source.id);
  if (!conversation) {
    throw new WorkspaceExtractionProposalError(
      'source_not_found',
      `Source conversation not found: ${input.source.id}`
    );
  }
  if (conversation.projectId !== input.projectId) {
    throw new WorkspaceExtractionProposalError(
      'source_project_mismatch',
      'Selected Source conversation belongs to another project'
    );
  }

  const turns = await findTurnsByHashes(db, {
    conversationId: conversation.conversationId,
    turnHashes: selectedHashes,
  });
  const availableHashes = new Set(turns.map((turn) => turn.turnHash));
  const missingHashes = selectedHashes.filter((hash) => !availableHashes.has(hash)).sort();
  if (missingHashes.length > 0) {
    throw new WorkspaceExtractionProposalError(
      'source_selector_invalid',
      'Selected immutable Source turns were not found in the conversation',
      { missing_turn_hashes: missingHashes }
    );
  }

  const extraction = await runApiExtractionV2({
    db,
    conversationId: conversation.conversationId,
    turnHashes: selectedHashes,
    baselineSnapshot: context.baseline,
    provider: input.provider,
    model: input.model,
    userId: input.userId,
    inference: input.inference,
  });
  if (!extraction.ok) throw extractionError(extraction);

  const sourceSelector: ConversationSourceSelector = {
    type: 'conversation',
    id: conversation.conversationId,
    turnHashes: [...selectedHashes].sort(),
  };
  const sourceSelectorDigest = digest(
    't3x-workspace-extraction-source-selector-v1',
    sourceSelector
  );
  const candidateId = extractionCandidateId({
    sourceSelectorDigest,
    baseCommitHash: context.refHead,
    operations: extraction.ops as unknown as ProtocolValue[],
  });
  const createdAt = new Date().toISOString();
  const proposal: WorkspaceExtractionProposal = {
    schema: WORKSPACE_EXTRACTION_PROPOSAL_SCHEMA,
    sourceSelector,
    sourceSelectorDigest,
    baseCommitHash: context.refHead,
    mode: extraction.mode,
    operations: extraction.ops,
    result: extraction.snapshot,
    actor: input.actor,
    createdAt,
  };
  const editableWorkspace = reopenedWorkspace(context.workspace, context.refHead);
  const nextWorkspace = {
    ...editableWorkspace,
    id: input.workspaceId,
    projectId: input.projectId,
    targetBranch: context.refName,
    backendCandidateId: candidateId,
    extractionProposal: proposal,
    updatedAt: createdAt,
  };
  const draft = await db.transaction(async (tx) => {
    const persisted = await upsertWorkspaceDraft(
      tx,
      {
        project_id: input.projectId,
        workspace_id: input.workspaceId,
        title: workspaceTitle(nextWorkspace, input.workspaceId),
        parent_commit_hash: context.refHead,
        target_branch: context.refName,
        workspace_state: nextWorkspace,
      },
      context.workspaceRevision
    );
    await recordEvent(tx, {
      type: 'extraction.done',
      projectId: input.projectId,
      conversationId: conversation.conversationId,
      payload: {
        source: 'workspace-extraction-proposal',
        workspace_id: input.workspaceId,
        candidate_id: candidateId,
        revision: persisted.revision,
      },
    });
    return persisted;
  });

  return {
    candidateId,
    proposal,
    workspace: {
      ...(draft.workspace_state ?? nextWorkspace),
      revision: draft.revision,
    },
  };
}
