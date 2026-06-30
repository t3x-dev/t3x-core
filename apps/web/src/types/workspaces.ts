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
  sourceBundle: SourceBundleItem[];
  schemaBindings: WorkspaceSchemaBinding[];
  lastCommitHash?: string;
}

export type WorkspaceStatusCounts = Record<WorkspaceStatusFilter, number>;
