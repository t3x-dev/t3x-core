/**
 * A0 inventory of current Workspace Draft write paths.
 *
 * Canonical authoring truth for #1588 is a pinned Base plus ordered immutable
 * successful action records. These existing paths still replace or merge a
 * workspace_state blob. They remain available, but they are not the ledger.
 * New Compose action publication must go through publishDraftAction.
 */

export const WORKSPACE_DRAFT_LEDGER_KEY = 'authoringLedger' as const;

export type WorkspaceDraftSaveKind =
  | 'blob_merge'
  | 'blob_replace'
  | 'proposal_materialize'
  | 'commit_side_effect';

export type WorkspaceDraftSaveStatus = 'legacy_blob' | 'ledger_command';

export interface WorkspaceDraftSavePath {
  readonly id: string;
  readonly surface: string;
  readonly kind: WorkspaceDraftSaveKind;
  readonly status: WorkspaceDraftSaveStatus;
  readonly notes: string;
}

export const WORKSPACE_DRAFT_SAVE_PATHS: readonly WorkspaceDraftSavePath[] = Object.freeze([
  {
    id: 'patch-workspace',
    surface: 'PATCH /v1/projects/{projectId}/workspaces/{workspaceId}',
    kind: 'blob_merge',
    status: 'legacy_blob',
    notes: 'Client workspace JSON is merged into workspace_state. Does not append actions.',
  },
  {
    id: 'upsert-workspace-draft',
    surface: 'storage.upsertWorkspaceDraft',
    kind: 'blob_replace',
    status: 'legacy_blob',
    notes: 'Optimistic revision CAS on the drafts row. Replaces workspace_state JSON.',
  },
  {
    id: 'yschema-composition-save',
    surface: 'PATCH workspace composition (yschema-composition routes)',
    kind: 'blob_merge',
    status: 'legacy_blob',
    notes: 'Studio/composition saves persist through upsertWorkspaceDraft.',
  },
  {
    id: 'extraction-proposal-persist',
    surface: 'workspace-extraction-proposal persist',
    kind: 'blob_replace',
    status: 'legacy_blob',
    notes: 'Generated extraction writes workspace_state after materialize, not an action record.',
  },
  {
    id: 'workspace-source-transition',
    surface: 'workspace-source-transition / MCP writers',
    kind: 'proposal_materialize',
    status: 'legacy_blob',
    notes: 'External intents still land as workspace_state updates until A4 qualification.',
  },
  {
    id: 'transition-commit-workspace',
    surface: 'transition-control-plane commit workspace_state',
    kind: 'commit_side_effect',
    status: 'legacy_blob',
    notes: 'Commit updates staged workspace_state. Not one Git/T3X commit per Draft action.',
  },
  {
    id: 'publish-draft-action',
    surface: 'application.publishDraftAction',
    kind: 'blob_replace',
    status: 'ledger_command',
    notes: 'Append-only successful action records. Current document is derived by replay.',
  },
]);

export function legacyWorkspaceDraftSavePaths(): readonly WorkspaceDraftSavePath[] {
  return WORKSPACE_DRAFT_SAVE_PATHS.filter((path) => path.status === 'legacy_blob');
}
