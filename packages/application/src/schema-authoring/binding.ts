import type { WorkspaceSchemaAuthoringEffect } from './types';

export type WorkspaceSchemaBindingMode = 'pinned' | 'draft_override';

export type WorkspaceSchemaBindingSourceKind =
  | 'published_schema'
  | 'composition'
  | 'workspace_schema';

export interface ResolveWorkspaceSchemaBindingModeInput {
  readonly source: WorkspaceSchemaBindingSourceKind;
  readonly localEffect?: WorkspaceSchemaAuthoringEffect;
}

/**
 * Only an unchanged immutable release is pinned. Every Workspace-owned result
 * remains an override until that exact result is published and rebound.
 */
export function resolveWorkspaceSchemaBindingMode({
  source,
  localEffect,
}: ResolveWorkspaceSchemaBindingModeInput): WorkspaceSchemaBindingMode {
  return source === 'published_schema' && (localEffect?.operations.length ?? 0) === 0
    ? 'pinned'
    : 'draft_override';
}
