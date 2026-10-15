import { type NativeYOp, NativeYOpSchema } from '@t3x-dev/core';
import {
  type SchemaAuthoringDigest,
  WORKSPACE_SCHEMA_AUTHORING_DRAFT_SCHEMA,
  WORKSPACE_SCHEMA_AUTHORING_EFFECT_PROFILE,
  type WorkspacePublishedSchemaBase,
  type WorkspaceSchemaAuthoringBase,
  type WorkspaceSchemaAuthoringDraft,
  type WorkspaceSchemaCompositionBase,
} from './types';

const DIGEST = /^sha256:[0-9a-f]{64}$/;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string
): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length)
    throw new TypeError(`${label} contains unsupported field: ${unexpected[0]}`);
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be non-empty`);
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
  return value as number;
}

function digest(value: unknown, label: string): SchemaAuthoringDigest {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new TypeError(`${label} must be a sha256 digest`);
  }
  return value as SchemaAuthoringDigest;
}

function parseCompositionBase(value: Record<string, unknown>): WorkspaceSchemaCompositionBase {
  exactKeys(
    value,
    ['kind', 'compositionId', 'compositionRevision', 'compositionHash', 'schemaHash'],
    'Schema authoring Composition base'
  );
  return {
    kind: 'composition',
    compositionId: nonEmptyString(value.compositionId, 'Composition id'),
    compositionRevision: nonNegativeInteger(value.compositionRevision, 'Composition revision'),
    compositionHash: digest(value.compositionHash, 'Composition hash'),
    schemaHash: digest(value.schemaHash, 'Composition Schema hash'),
  };
}

function parsePublishedSchemaBase(value: Record<string, unknown>): WorkspacePublishedSchemaBase {
  exactKeys(
    value,
    [
      'kind',
      'projectId',
      'artifactVersionId',
      'canonicalName',
      'version',
      'artifactHash',
      'schemaHash',
    ],
    'Schema authoring published base'
  );
  if (value.projectId !== null && typeof value.projectId !== 'string') {
    throw new TypeError('Published Schema project id must be a string or null');
  }
  return {
    kind: 'published_schema',
    projectId: value.projectId,
    artifactVersionId: nonEmptyString(value.artifactVersionId, 'Artifact version id'),
    canonicalName: nonEmptyString(value.canonicalName, 'Published Schema canonical name'),
    version: nonEmptyString(value.version, 'Published Schema version'),
    artifactHash: digest(value.artifactHash, 'Published Schema artifact hash'),
    schemaHash: digest(value.schemaHash, 'Published Schema hash'),
  };
}

function parseBase(value: unknown): WorkspaceSchemaAuthoringBase {
  const base = record(value, 'Schema authoring base');
  if (base.kind === 'composition') return parseCompositionBase(base);
  if (base.kind === 'published_schema') return parsePublishedSchemaBase(base);
  throw new TypeError('Unsupported Schema authoring base');
}

function parseOperation(value: unknown): NativeYOp {
  NativeYOpSchema.parse(value);
  return structuredClone(value) as NativeYOp;
}

/** Validate and detach a Workspace-local Schema authoring draft from persisted JSON. */
export function parseWorkspaceSchemaAuthoringDraft(value: unknown): WorkspaceSchemaAuthoringDraft {
  const draft = record(value, 'Workspace Schema authoring draft');
  exactKeys(
    draft,
    ['schema', 'revision', 'base', 'effect', 'resultSchemaHash'],
    'Workspace Schema authoring draft'
  );
  if (draft.schema !== WORKSPACE_SCHEMA_AUTHORING_DRAFT_SCHEMA) {
    throw new TypeError('Unsupported Workspace Schema authoring draft');
  }

  const effect = record(draft.effect, 'Schema authoring effect');
  exactKeys(effect, ['profile', 'operations'], 'Schema authoring effect');
  if (effect.profile !== WORKSPACE_SCHEMA_AUTHORING_EFFECT_PROFILE) {
    throw new TypeError('Unsupported Schema authoring effect profile');
  }
  if (!Array.isArray(effect.operations)) {
    throw new TypeError('Schema authoring operations must be an array');
  }

  const parsed: WorkspaceSchemaAuthoringDraft = {
    schema: WORKSPACE_SCHEMA_AUTHORING_DRAFT_SCHEMA,
    revision: nonNegativeInteger(draft.revision, 'Schema authoring revision'),
    base: parseBase(draft.base),
    effect: {
      profile: WORKSPACE_SCHEMA_AUTHORING_EFFECT_PROFILE,
      operations: effect.operations.map(parseOperation),
    },
    ...(draft.resultSchemaHash === undefined
      ? {}
      : { resultSchemaHash: digest(draft.resultSchemaHash, 'Result Schema hash') }),
  };
  return structuredClone(parsed);
}
