import { createHash } from 'node:crypto';
import { canonicalJson, cloneDocument } from '../workspace-authoring/document';
import type { DraftDocument } from '../workspace-authoring/types';
import { parseWorkspaceSchemaAuthoringDraft } from './persistence';
import type { SchemaAuthoringDigest, WorkspaceSchemaAuthoringDraft } from './types';

export const WORKSPACE_SCHEMA_EDIT_CANDIDATE_SCHEMA =
  't3x.application/workspace-schema-edit-candidate/v1' as const;

export interface WorkspaceSchemaEditBaseSource {
  readonly projectId: string | null;
  readonly canonicalName: string;
  readonly version: string;
  readonly artifactVersionId: string;
  readonly hash: SchemaAuthoringDigest;
}

export type WorkspaceSchemaEditOriginChannel = 'studio' | 'assistant' | 'import' | 'api';

export interface WorkspaceSchemaEditOrigin {
  readonly channel: WorkspaceSchemaEditOriginChannel;
  readonly actor: {
    readonly kind: 'human' | 'agent' | 'service' | 'local';
    readonly id: string;
  };
}

/** Server-managed mutable candidate. Published Schema and Composition inputs remain immutable. */
export interface WorkspaceSchemaEditCandidate {
  readonly schema: typeof WORKSPACE_SCHEMA_EDIT_CANDIDATE_SCHEMA;
  readonly candidateId: string;
  readonly workspaceId: string;
  readonly revision: number;
  readonly baseSources: readonly WorkspaceSchemaEditBaseSource[];
  readonly localContribution: DraftDocument;
  readonly authoringDraft?: WorkspaceSchemaAuthoringDraft;
  readonly intent: string;
  readonly origin: WorkspaceSchemaEditOrigin;
  readonly retryKey: string;
  readonly requestDigest: SchemaAuthoringDigest;
}

export interface SaveWorkspaceSchemaEditCandidateInput {
  readonly candidateId: string;
  readonly workspaceId: string;
  readonly expectedRevision: number;
  readonly baseSources: readonly WorkspaceSchemaEditBaseSource[];
  readonly localContribution: DraftDocument;
  readonly authoringDraft?: WorkspaceSchemaAuthoringDraft;
  readonly intent: string;
  readonly origin: WorkspaceSchemaEditOrigin;
  readonly retryKey: string;
}

export type SaveWorkspaceSchemaEditCandidateResult =
  | {
      readonly kind: 'created' | 'updated' | 'reused';
      readonly candidate: WorkspaceSchemaEditCandidate;
    }
  | {
      readonly kind: 'conflict';
      readonly reason: 'stale_revision' | 'idempotency_mismatch';
      readonly currentRevision: number;
      readonly message: string;
    };

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ORIGIN_CHANNELS: readonly WorkspaceSchemaEditOriginChannel[] = [
  'studio',
  'assistant',
  'import',
  'api',
];
const ACTOR_KINDS: readonly WorkspaceSchemaEditOrigin['actor']['kind'][] = [
  'human',
  'agent',
  'service',
  'local',
];

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be non-empty`);
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0)
    throw new TypeError(`${label} must be a non-negative integer`);
  return value as number;
}

function digest(value: unknown, label: string): SchemaAuthoringDigest {
  if (typeof value !== 'string' || !DIGEST.test(value))
    throw new TypeError(`${label} must be a sha256 digest`);
  return value as SchemaAuthoringDigest;
}

function detachedDocument(value: unknown, label: string): DraftDocument {
  try {
    return JSON.parse(canonicalJson(value)) as DraftDocument;
  } catch {
    throw new TypeError(`${label} must be deterministic JSON`);
  }
}

function parseBaseSources(value: unknown): readonly WorkspaceSchemaEditBaseSource[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new TypeError('Schema edit baseSources must be a non-empty array');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new TypeError(`Schema edit baseSources[${index}] must be an object`);
    const source = item as Record<string, unknown>;
    const unexpected = Object.keys(source).filter(
      (key) => !['projectId', 'canonicalName', 'version', 'artifactVersionId', 'hash'].includes(key)
    );
    if (unexpected.length)
      throw new TypeError(`Schema edit baseSources[${index}] contains unsupported field`);
    if (source.projectId !== null && typeof source.projectId !== 'string')
      throw new TypeError(`Schema edit baseSources[${index}].projectId must be a string or null`);
    return {
      projectId: source.projectId,
      canonicalName: nonEmptyString(source.canonicalName, 'Schema edit source canonicalName'),
      version: nonEmptyString(source.version, 'Schema edit source version'),
      artifactVersionId: nonEmptyString(
        source.artifactVersionId,
        'Schema edit source artifactVersionId'
      ),
      hash: digest(source.hash, 'Schema edit source hash'),
    };
  });
}

function parseOrigin(value: unknown): WorkspaceSchemaEditOrigin {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Schema edit origin must be an object');
  const origin = value as Record<string, unknown>;
  if (Object.keys(origin).some((key) => !['channel', 'actor'].includes(key)))
    throw new TypeError('Schema edit origin contains unsupported field');
  if (!ORIGIN_CHANNELS.includes(origin.channel as WorkspaceSchemaEditOriginChannel))
    throw new TypeError('Unsupported Schema edit origin channel');
  if (!origin.actor || typeof origin.actor !== 'object' || Array.isArray(origin.actor))
    throw new TypeError('Schema edit origin actor must be an object');
  const actor = origin.actor as Record<string, unknown>;
  if (Object.keys(actor).some((key) => !['kind', 'id'].includes(key)))
    throw new TypeError('Schema edit origin actor contains unsupported field');
  if (!ACTOR_KINDS.includes(actor.kind as WorkspaceSchemaEditOrigin['actor']['kind']))
    throw new TypeError('Unsupported Schema edit origin actor kind');
  return {
    channel: origin.channel as WorkspaceSchemaEditOriginChannel,
    actor: {
      kind: actor.kind as WorkspaceSchemaEditOrigin['actor']['kind'],
      id: nonEmptyString(actor.id, 'Schema edit origin actor id'),
    },
  };
}

export function parseWorkspaceSchemaEditCandidate(value: unknown): WorkspaceSchemaEditCandidate {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Workspace Schema edit candidate must be an object');
  const candidate = value as Record<string, unknown>;
  const unexpected = Object.keys(candidate).filter(
    (key) =>
      ![
        'schema',
        'candidateId',
        'workspaceId',
        'revision',
        'baseSources',
        'localContribution',
        'authoringDraft',
        'intent',
        'origin',
        'retryKey',
        'requestDigest',
      ].includes(key)
  );
  if (unexpected.length) throw new TypeError('Schema edit candidate contains unsupported field');
  if (candidate.schema !== WORKSPACE_SCHEMA_EDIT_CANDIDATE_SCHEMA)
    throw new TypeError('Unsupported Workspace Schema edit candidate');
  return {
    schema: WORKSPACE_SCHEMA_EDIT_CANDIDATE_SCHEMA,
    candidateId: nonEmptyString(candidate.candidateId, 'Schema edit candidate id'),
    workspaceId: nonEmptyString(candidate.workspaceId, 'Schema edit workspace id'),
    revision: nonNegativeInteger(candidate.revision, 'Schema edit revision'),
    baseSources: parseBaseSources(candidate.baseSources),
    localContribution: detachedDocument(
      candidate.localContribution,
      'Schema edit localContribution'
    ),
    ...(candidate.authoringDraft === undefined
      ? {}
      : {
          authoringDraft: parseWorkspaceSchemaAuthoringDraft(candidate.authoringDraft),
        }),
    intent: nonEmptyString(candidate.intent, 'Schema edit intent'),
    origin: parseOrigin(candidate.origin),
    retryKey: nonEmptyString(candidate.retryKey, 'Schema edit retryKey'),
    requestDigest: digest(candidate.requestDigest, 'Schema edit request digest'),
  };
}

function requestDigest(input: SaveWorkspaceSchemaEditCandidateInput): SchemaAuthoringDigest {
  const canonical = canonicalJson({
    candidateId: input.candidateId,
    workspaceId: input.workspaceId,
    expectedRevision: input.expectedRevision,
    baseSources: input.baseSources,
    localContribution: input.localContribution,
    ...(input.authoringDraft ? { authoringDraft: input.authoringDraft } : {}),
    intent: input.intent,
    origin: input.origin,
  });
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

/**
 * Application use case for create/edit/retry. The storage adapter supplies the
 * current candidate and persists the returned value with the Workspace CAS.
 */
export function saveWorkspaceSchemaEditCandidate(
  current: WorkspaceSchemaEditCandidate | null,
  rawInput: SaveWorkspaceSchemaEditCandidateInput
): SaveWorkspaceSchemaEditCandidateResult {
  const input = cloneDocument(rawInput);
  const inputDigest = requestDigest(input);
  if (current) {
    const parsed = parseWorkspaceSchemaEditCandidate(current);
    if (parsed.candidateId !== input.candidateId || parsed.workspaceId !== input.workspaceId)
      return {
        kind: 'conflict',
        reason: 'idempotency_mismatch',
        currentRevision: parsed.revision,
        message: 'Schema edit candidate identity does not match the Workspace',
      };
    if (parsed.retryKey === input.retryKey)
      return parsed.requestDigest === inputDigest
        ? { kind: 'reused', candidate: parsed }
        : {
            kind: 'conflict',
            reason: 'idempotency_mismatch',
            currentRevision: parsed.revision,
            message: 'Schema edit retryKey was already used with different facts',
          };
    if (input.expectedRevision !== parsed.revision)
      return {
        kind: 'conflict',
        reason: 'stale_revision',
        currentRevision: parsed.revision,
        message: `Expected Schema edit revision ${input.expectedRevision}, current is ${parsed.revision}`,
      };
    return {
      kind: 'updated',
      candidate: parseWorkspaceSchemaEditCandidate({
        schema: WORKSPACE_SCHEMA_EDIT_CANDIDATE_SCHEMA,
        candidateId: input.candidateId,
        workspaceId: input.workspaceId,
        revision: parsed.revision + 1,
        baseSources: input.baseSources,
        localContribution: input.localContribution,
        ...(input.authoringDraft ? { authoringDraft: input.authoringDraft } : {}),
        intent: input.intent,
        origin: input.origin,
        retryKey: input.retryKey,
        requestDigest: inputDigest,
      }),
    };
  }
  if (input.expectedRevision !== 0)
    return {
      kind: 'conflict',
      reason: 'stale_revision',
      currentRevision: 0,
      message: 'A new Schema edit candidate must start at revision 0',
    };
  return {
    kind: 'created',
    candidate: parseWorkspaceSchemaEditCandidate({
      schema: WORKSPACE_SCHEMA_EDIT_CANDIDATE_SCHEMA,
      candidateId: input.candidateId,
      workspaceId: input.workspaceId,
      revision: 1,
      baseSources: input.baseSources,
      localContribution: input.localContribution,
      ...(input.authoringDraft ? { authoringDraft: input.authoringDraft } : {}),
      intent: input.intent,
      origin: input.origin,
      retryKey: input.retryKey,
      requestDigest: inputDigest,
    }),
  };
}
