export type WorkspaceStatus = 'draft' | 'ready_for_yops' | 'schema_review' | 'committed';

export type WorkspaceStatusFilter = 'all' | WorkspaceStatus;

export type WorkspaceSortKey = 'updated_desc' | 'title_asc';

export type SourceBundleType = 'chat' | 'document' | 'prompt_run' | 'import';

export interface SourceBundleItem {
  id: string;
  type: SourceBundleType;
  title: string;
  conversationId?: string;
  fileName?: string;
  runId?: string;
  format?: 'yaml' | 'json' | 'markdown' | 'text';
}

export type SchemaBindingMode = 'project_default' | 'pinned' | 'draft_override';

export interface WorkspaceSchemaBinding {
  schemaName: string;
  version: string;
  mode: SchemaBindingMode;
}

export interface WorkspaceCandidate {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  status: WorkspaceStatus;
  updatedAt: string;
  baseCommitHash: string | null;
  targetBranch: string;
  sourceBundle: SourceBundleItem[];
  schemaBindings: WorkspaceSchemaBinding[];
  schemaReview: WorkspaceSchemaReview;
  yopsDraft: WorkspaceYOpsDraft;
  outputTargets: WorkspaceOutputTarget[];
  lastCommitHash?: string;
}

export type WorkspaceStatusCounts = Record<WorkspaceStatusFilter, number>;

export type WorkspaceSchemaReviewVerdict = 'ready' | 'needs_review';

export interface WorkspaceSchemaReview {
  verdict: WorkspaceSchemaReviewVerdict;
  summary: string;
  gaps: string[];
}

export interface WorkspaceYOpsDraftOperation {
  id: string;
  op: string;
  path: string;
  summary: string;
}

export interface WorkspaceYOpsDraft {
  id: string;
  operations: WorkspaceYOpsDraftOperation[];
}

export type WorkspaceOutputTargetType = 'document' | 'webhook' | 'export';

export type WorkspaceOutputTargetFormat = 'markdown' | 'json' | 'yaml' | 'html';

export type WorkspaceOutputTargetStatus = 'draft_target';

export interface WorkspaceOutputTarget {
  id: string;
  title: string;
  type: WorkspaceOutputTargetType;
  format: WorkspaceOutputTargetFormat;
  status: WorkspaceOutputTargetStatus;
}
