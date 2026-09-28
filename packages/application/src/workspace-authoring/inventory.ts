/**
 * Inventory of Workspace Draft write paths and their ledger compatibility.
 *
 * Canonical authoring truth for #1588 is a pinned Base plus ordered immutable
 * successful action records. Legacy blobs remain only for pre-ledger workflows;
 * their structural writes are rejected once a ledger exists. Rejection is not
 * migration. New Compose action publication goes through the command service.
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
  readonly ledgerBehavior: 'metadata_only' | 'rejected' | 'append' | 'seal';
  readonly notes: string;
}

export const WORKSPACE_DRAFT_SAVE_PATHS: readonly WorkspaceDraftSavePath[] = Object.freeze([
  {
    id: 'patch-workspace',
    surface: 'PATCH /v1/projects/{projectId}/workspaces/{workspaceId}',
    kind: 'blob_merge',
    status: 'legacy_blob',
    ledgerBehavior: 'metadata_only',
    notes:
      'Pre-ledger JSON merge; existing ledgers allow metadata only and reject structural replacement.',
  },
  {
    id: 'upsert-workspace-draft',
    surface: 'storage.upsertWorkspaceDraft',
    kind: 'blob_replace',
    status: 'legacy_blob',
    ledgerBehavior: 'metadata_only',
    notes:
      'Revision CAS plus ledger guard: metadata only, no structural overwrite or audit deletion.',
  },
  {
    id: 'yschema-composition-save',
    surface: 'PATCH workspace composition (yschema-composition routes)',
    kind: 'blob_merge',
    status: 'legacy_blob',
    ledgerBehavior: 'rejected',
    notes: 'Studio/composition saves persist through upsertWorkspaceDraft.',
  },
  {
    id: 'extraction-proposal-persist',
    surface: 'workspace-extraction-proposal persist',
    kind: 'blob_replace',
    status: 'legacy_blob',
    ledgerBehavior: 'rejected',
    notes: 'Generated extraction writes workspace_state after materialize, not an action record.',
  },
  {
    id: 'workspace-source-transition',
    surface: 'workspace-source-transition exact-source workflow',
    kind: 'proposal_materialize',
    status: 'legacy_blob',
    ledgerBehavior: 'rejected',
    notes:
      'Independent exact-source codec and Review flow; not interchangeable with a YOps ledger.',
  },
  {
    id: 'transition-commit-workspace',
    surface: 'transition-control-plane commit workspace_state',
    kind: 'commit_side_effect',
    status: 'legacy_blob',
    ledgerBehavior: 'rejected',
    notes:
      'Legacy workspace projection updates; ledger-backed Commit uses the separate sealed authoring path.',
  },
  {
    id: 'publish-workspace-authoring-action',
    surface: 'authoring command API / MCP t3x_edit mode=draft / manual cards',
    kind: 'blob_replace',
    status: 'ledger_command',
    ledgerBehavior: 'append',
    notes: 'Shared transactional append with revision/ref checks and idempotent recovery.',
  },
  {
    id: 'publish-workspace-generation',
    surface: 'verified generated candidate publication',
    kind: 'proposal_materialize',
    status: 'ledger_command',
    ledgerBehavior: 'append',
    notes: 'Generation alone does not change the Draft; verified publication appends an action.',
  },
  {
    id: 'seal-workspace-authoring',
    surface: 'canonical Transition Commit / storage.sealWorkspaceAuthoring',
    kind: 'commit_side_effect',
    status: 'ledger_command',
    ledgerBehavior: 'seal',
    notes: 'Retains immutable authoring history and basis in the committed workspace.',
  },
  {
    id: 'publish-draft-action',
    surface: 'application.publishDraftAction',
    kind: 'blob_replace',
    status: 'ledger_command',
    ledgerBehavior: 'append',
    notes: 'Append-only successful action records. Current document is derived by replay.',
  },
]);

export function legacyWorkspaceDraftSavePaths(): readonly WorkspaceDraftSavePath[] {
  return WORKSPACE_DRAFT_SAVE_PATHS.filter((path) => path.status === 'legacy_blob');
}
