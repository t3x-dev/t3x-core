import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import {
  type WorkspaceDraftCommandReceiptRecord,
  workspaceDraftCommandReceipts,
} from '../schema-trees';

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ACTOR_KINDS = ['human', 'agent', 'service'] as const;

export type WorkspaceDraftCommandActorKind = (typeof ACTOR_KINDS)[number];

export interface WorkspaceDraftCommandActor {
  kind: WorkspaceDraftCommandActorKind;
  id: string;
}

export interface WorkspaceDraftCommandReceipt {
  projectId: string;
  workspaceId: string;
  command: string;
  actor: WorkspaceDraftCommandActor;
  requestId: string;
  requestDigest: string;
  resultRevision: number;
  resultDigest: string;
  resultWorkspaceState: Record<string, unknown>;
  createdAt: string;
}

export interface RecordWorkspaceDraftCommandReceiptInput {
  projectId: string;
  workspaceId: string;
  command: string;
  actor: WorkspaceDraftCommandActor;
  requestId: string;
  requestDigest: string;
  resultRevision: number;
  resultDigest: string;
  resultWorkspaceState: Record<string, unknown>;
}

export class WorkspaceDraftCommandConflictError extends Error {
  readonly code = 'WORKSPACE_DRAFT_COMMAND_CONFLICT';

  constructor(readonly requestId: string) {
    super(`Workspace draft command ${requestId} was already used with different facts`);
    this.name = 'WorkspaceDraftCommandConflictError';
  }
}

export class WorkspaceDraftCommandIntegrityError extends Error {
  readonly code = 'WORKSPACE_DRAFT_COMMAND_INTEGRITY_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceDraftCommandIntegrityError';
  }
}

function sha256(domain: string, canonicalJson: string): string {
  return `sha256:${createHash('sha256')
    .update(`${domain}\n`, 'utf8')
    .update(canonicalJson, 'utf8')
    .digest('hex')}`;
}

export function digestWorkspaceDraftCommandRequestCanonicalJson(canonicalJson: string): string {
  return sha256('t3x.workspace.draft-command.request.v1', canonicalJson);
}

export function digestWorkspaceDraftCommandResultCanonicalJson(canonicalJson: string): string {
  return sha256('t3x.workspace.draft-command.result.v1', canonicalJson);
}

function isActorKind(value: string): value is WorkspaceDraftCommandActorKind {
  return ACTOR_KINDS.includes(value as WorkspaceDraftCommandActorKind);
}

function receipt(row: WorkspaceDraftCommandReceiptRecord): WorkspaceDraftCommandReceipt {
  if (
    row.projectId.length === 0 ||
    row.workspaceId.length === 0 ||
    row.command.length === 0 ||
    row.actorId.length === 0 ||
    row.requestId.length === 0 ||
    !isActorKind(row.actorKind) ||
    !Number.isInteger(row.resultRevision) ||
    row.resultRevision <= 0 ||
    !DIGEST_PATTERN.test(row.requestDigest) ||
    !DIGEST_PATTERN.test(row.resultDigest)
  ) {
    throw new WorkspaceDraftCommandIntegrityError(
      `Stored Workspace draft command ${row.requestId} has invalid trusted facts`
    );
  }

  return {
    projectId: row.projectId,
    workspaceId: row.workspaceId,
    command: row.command,
    actor: { kind: row.actorKind, id: row.actorId },
    requestId: row.requestId,
    requestDigest: row.requestDigest,
    resultRevision: row.resultRevision,
    resultDigest: row.resultDigest,
    resultWorkspaceState: row.resultWorkspaceStateJson,
    createdAt: row.createdAt.toISOString(),
  };
}

function sameReceipt(
  stored: WorkspaceDraftCommandReceipt,
  input: RecordWorkspaceDraftCommandReceiptInput
): boolean {
  return (
    stored.projectId === input.projectId &&
    stored.workspaceId === input.workspaceId &&
    stored.command === input.command &&
    stored.actor.kind === input.actor.kind &&
    stored.actor.id === input.actor.id &&
    stored.requestId === input.requestId &&
    stored.requestDigest === input.requestDigest &&
    stored.resultRevision === input.resultRevision &&
    stored.resultDigest === input.resultDigest
  );
}

function assertInput(input: RecordWorkspaceDraftCommandReceiptInput): void {
  if (
    input.projectId.trim().length === 0 ||
    input.workspaceId.trim().length === 0 ||
    input.command.trim().length === 0 ||
    input.actor.id.trim().length === 0 ||
    input.requestId.trim().length === 0 ||
    !isActorKind(input.actor.kind) ||
    !Number.isInteger(input.resultRevision) ||
    input.resultRevision <= 0 ||
    !DIGEST_PATTERN.test(input.requestDigest) ||
    !DIGEST_PATTERN.test(input.resultDigest)
  ) {
    throw new TypeError('Workspace draft command receipt input is invalid');
  }
}

export async function findWorkspaceDraftCommandReceipt(
  db: AnyDB,
  input: {
    projectId: string;
    workspaceId: string;
    actor: WorkspaceDraftCommandActor;
    requestId: string;
  }
): Promise<WorkspaceDraftCommandReceipt | null> {
  const [row] = await db
    .select()
    .from(workspaceDraftCommandReceipts)
    .where(
      and(
        eq(workspaceDraftCommandReceipts.projectId, input.projectId),
        eq(workspaceDraftCommandReceipts.workspaceId, input.workspaceId),
        eq(workspaceDraftCommandReceipts.actorKind, input.actor.kind),
        eq(workspaceDraftCommandReceipts.actorId, input.actor.id),
        eq(workspaceDraftCommandReceipts.requestId, input.requestId)
      )
    )
    .limit(1);
  return row === undefined ? null : receipt(row);
}

export async function recordWorkspaceDraftCommandReceipt(
  db: AnyDB,
  input: RecordWorkspaceDraftCommandReceiptInput
): Promise<{ receipt: WorkspaceDraftCommandReceipt; reused: boolean }> {
  assertInput(input);

  const prior = await findWorkspaceDraftCommandReceipt(db, input);
  if (prior !== null) {
    if (!sameReceipt(prior, input)) throw new WorkspaceDraftCommandConflictError(input.requestId);
    return { receipt: prior, reused: true };
  }

  await db
    .insert(workspaceDraftCommandReceipts)
    .values({
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      command: input.command,
      actorKind: input.actor.kind,
      actorId: input.actor.id,
      requestId: input.requestId,
      requestDigest: input.requestDigest,
      resultRevision: input.resultRevision,
      resultDigest: input.resultDigest,
      resultWorkspaceStateJson: input.resultWorkspaceState,
    })
    .onConflictDoNothing();

  const stored = await findWorkspaceDraftCommandReceipt(db, input);
  if (stored === null || !sameReceipt(stored, input)) {
    throw new WorkspaceDraftCommandConflictError(input.requestId);
  }
  return { receipt: stored, reused: false };
}
