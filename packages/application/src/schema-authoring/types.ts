import type { NativeYOp as YOp } from '@t3x-dev/core';

export const WORKSPACE_SCHEMA_AUTHORING_DRAFT_SCHEMA =
  't3x.application/workspace-schema-authoring-draft/v1' as const;
export const WORKSPACE_SCHEMA_AUTHORING_EFFECT_PROFILE = 'yops.ops.v1' as const;

export type SchemaAuthoringDigest = `sha256:${string}`;

/** A saved Composition remains the immutable input to local Schema authoring. */
export interface WorkspaceSchemaCompositionBase {
  readonly kind: 'composition';
  readonly compositionId: string;
  readonly compositionRevision: number;
  readonly compositionHash: SchemaAuthoringDigest;
  readonly schemaHash: SchemaAuthoringDigest;
}

/** A published Schema may also be edited locally without turning it into a Composition. */
export interface WorkspacePublishedSchemaBase {
  readonly kind: 'published_schema';
  readonly projectId: string | null;
  readonly artifactVersionId: string;
  readonly canonicalName: string;
  readonly version: string;
  readonly artifactHash: SchemaAuthoringDigest;
  readonly schemaHash: SchemaAuthoringDigest;
}

export type WorkspaceSchemaAuthoringBase =
  | WorkspaceSchemaCompositionBase
  | WorkspacePublishedSchemaBase;

/**
 * The local change definition. Operations replay against the exact Schema
 * identified by base.schemaHash; they are not part of Composition V2.
 */
export interface WorkspaceSchemaAuthoringEffect {
  readonly profile: typeof WORKSPACE_SCHEMA_AUTHORING_EFFECT_PROFILE;
  readonly operations: readonly YOp[];
}

/**
 * Application-owned, Workspace-local Schema draft.
 *
 * ResultSchema = Replay(Resolve(base), effect.operations)
 */
export interface WorkspaceSchemaAuthoringDraft {
  readonly schema: typeof WORKSPACE_SCHEMA_AUTHORING_DRAFT_SCHEMA;
  readonly revision: number;
  readonly base: WorkspaceSchemaAuthoringBase;
  readonly effect: WorkspaceSchemaAuthoringEffect;
  /** Derived verification/cache key. The replayed Schema remains authoritative. */
  readonly resultSchemaHash?: SchemaAuthoringDigest;
  /** Source locations are independent of the destination layout and replayed definition. */
  readonly sourceMappings?: readonly WorkspaceSchemaSourceMapping[];
}

export interface WorkspaceSchemaSourceMapping {
  readonly path: readonly string[];
  readonly from: readonly string[];
  /** Omitted for the frozen authoring Base. External sources are pinned by compiled hash. */
  readonly source?: { readonly candidateId: string; readonly schemaHash: SchemaAuthoringDigest };
}
