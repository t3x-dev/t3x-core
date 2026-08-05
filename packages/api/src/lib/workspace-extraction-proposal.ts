import { createHash } from 'node:crypto';
import type { ProposalStatement, SemanticContent, SourcedYOp } from '@t3x-dev/core';
import {
  type AnyDB,
  findConversationById,
  findTurnsByConversation,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { canonicalizeProtocolValue, type ProtocolValue } from '@t3x-dev/transition';
import { runApiExtractionV2 } from './extraction-v2';
import { resolveWorkspaceExtractionContext } from './workspace-transition';

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

  const turns = await findTurnsByConversation(db, {
    conversationId: conversation.conversationId,
    limit: 500,
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
  const candidateId = `candidate:${digest('t3x-workspace-extraction-candidate-v1', {
    sourceSelectorDigest,
    baseCommitHash: context.refHead,
    operations: extraction.ops,
  }).slice('sha256:'.length)}`;
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
  const draft = await upsertWorkspaceDraft(
    db,
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

  return {
    candidateId,
    proposal,
    workspace: {
      ...(draft.workspace_state ?? nextWorkspace),
      revision: draft.revision,
    },
  };
}
