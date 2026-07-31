export type WorkspaceStatus = 'draft' | 'ready_for_yops' | 'schema_review' | 'committed';

export type WorkspaceStatusFilter = 'all' | WorkspaceStatus;

export type WorkspaceSortKey = 'updated_desc' | 'title_asc';

export type SourceBundleType = 'chat' | 'document' | 'text' | 'prompt_run' | 'import';

export interface SourceBundleItem {
  id: string;
  type: SourceBundleType;
  title: string;
  description?: string;
  conversationId?: string;
  materialId?: string;
  contentHash?: string;
  tokenEstimate?: number;
  fileName?: string;
  runId?: string;
  format?: 'yaml' | 'json' | 'markdown' | 'text';
  previewTurns?: SourceConversationTurn[];
  previewText?: string;
}

export const WORKSPACE_SOURCE_ARTIFACT_FORMAT = 't3x.dev/workspace-source-artifact/v1' as const;

export interface WorkspaceSourceMaterialSelector {
  materialId: string;
  contentHash?: string;
}

export interface WorkspaceSourceResourceSelector extends WorkspaceSourceMaterialSelector {
  path: string;
}

/**
 * Application-owned source selection for the exact-source Workspace path.
 * Source bytes and secret values are deliberately absent and are re-resolved
 * by the server during Review and Decide.
 */
export interface WorkspaceSourceArtifact {
  format: typeof WORKSPACE_SOURCE_ARTIFACT_FORMAT;
  rootPath: string;
  root?: WorkspaceSourceMaterialSelector;
  resources: WorkspaceSourceResourceSelector[];
}

export interface SourceConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  author: string;
  content: string;
  conversationId?: string;
  projectId?: string;
  pinnable?: boolean;
}

export type SchemaBindingMode = 'project_default' | 'pinned' | 'draft_override';

export interface WorkspaceSchemaBinding {
  canonicalName?: string;
  schemaHash?: string;
  schemaName: string;
  version: string;
  mode: SchemaBindingMode;
}

export interface WorkspaceCandidate {
  id: string;
  revision?: number;
  projectId: string;
  title: string;
  summary: string;
  status: WorkspaceStatus;
  updatedAt: string;
  baseCommitHash: string | null;
  targetBranch: string;
  sourceBundle: SourceBundleItem[];
  schemaBindings: WorkspaceSchemaBinding[];
  schemaCandidate: WorkspaceSchemaCandidate;
  schemaReview: WorkspaceSchemaReview;
  yopsDraft: WorkspaceYOpsDraft;
  outputTargets: WorkspaceOutputTarget[];
  sourceArtifact?: WorkspaceSourceArtifact;
  lastCommitHash?: string;
  commitOverride?: WorkspaceValidationOverride & { confirmedAt?: string };
}

export interface WorkspaceValidationOverride {
  kind: 'schema_review';
  reason: string;
  blockers: string[];
}

export type WorkspaceStatusCounts = Record<WorkspaceStatusFilter, number>;

export type WorkspaceSchemaReviewVerdict = 'ready' | 'needs_review';

export interface WorkspaceSchemaReview {
  verdict: WorkspaceSchemaReviewVerdict;
  summary: string;
  gaps: string[];
}

export type WorkspaceProposalMode = 'fixture' | 'deterministic_scaffold' | 'llm';

export type WorkspaceSchemaFieldStatus =
  | 'covered'
  | 'missing'
  | 'needs_confirmation'
  | 'type_mismatch'
  | 'extra';

export interface WorkspaceSchemaCandidateField {
  id: string;
  path: string;
  label: string;
  type: string;
  required: boolean;
  status: WorkspaceSchemaFieldStatus;
  value?: string;
  evidence?: string;
  sourceRefs?: number;
  children?: WorkspaceSchemaCandidateField[];
}

export interface WorkspaceSchemaCandidate {
  summary: string;
  proposalMode?: WorkspaceProposalMode;
  fields: WorkspaceSchemaCandidateField[];
}

export interface WorkspaceYOpsDraftOperation {
  id: string;
  op: string;
  path: string;
  summary: string;
  beforeValue?: string;
  afterValue?: string;
  reason?: string;
  sourceRefs?: string[];
}

export interface WorkspaceYOpsDraft {
  id: string;
  proposalMode?: WorkspaceProposalMode;
  operations: WorkspaceYOpsDraftOperation[];
}

export type WorkspaceOutputTargetType = 'document' | 'webhook' | 'export';

export type WorkspaceOutputTargetFormat = 'markdown' | 'json' | 'yaml' | 'html';

export type WorkspaceOutputTargetStatus = 'draft_target';

export type WorkspaceOutputTargetLeafType = 'document' | 'api' | 'report';

export interface WorkspaceOutputTarget {
  id: string;
  title: string;
  type: WorkspaceOutputTargetType;
  format: WorkspaceOutputTargetFormat;
  status: WorkspaceOutputTargetStatus;
  leafType?: WorkspaceOutputTargetLeafType;
  instruction?: string;
  constraints?: string[];
  sourceScope?: string;
  previewTitle?: string;
  previewBody?: string;
}
