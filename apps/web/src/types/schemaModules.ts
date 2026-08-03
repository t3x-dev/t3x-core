export type SchemaArtifactKind = 'core' | 'module';
export type SchemaArtifactDetailView = 'overview' | 'render' | 'rules' | 'versions';

export interface SchemaModuleRulePreview {
  id: string;
  description: string;
  blocking: boolean;
}

export interface SchemaArtifactPreview {
  canonicalName: string;
  version: string;
  kind: SchemaArtifactKind;
  title: string;
  description: string;
  domain: string;
  source: 'official' | 'team' | 'community';
  status: 'active' | 'draft' | 'deprecated';
  provides: string[];
  requires: string[];
  placement: string;
  nodePaths: string[];
  rules: SchemaModuleRulePreview[];
  versions: Array<{ version: string; status: string; updatedAt: string }>;
  updatedAt: string;
  usageCount: number;
  starCount: number;
  icon: 'blocks' | 'braces' | 'cpu' | 'database' | 'file' | 'monitor' | 'server';
}

export interface SchemaCompositionIssuePreview {
  code: string;
  message: string;
  blocking: boolean;
  module?: string;
  path?: string;
}

export interface SchemaCompositionPreviewResult {
  report: { valid: boolean; issues: SchemaCompositionIssuePreview[] };
  compiledSchemaHash: string;
  compositionHash: string;
  renderPlan: Array<{
    artifact: string;
    version: string;
    order: number;
    slot: string;
    nodePaths: string[];
  }>;
}

export interface SchemaCompositionDraft {
  apiVersion: 't3x.dev/yschema-composition/v1';
  id: string;
  revision: number;
  family: 'prd';
  status: 'draft';
  core: { canonicalName: string; version: string; hash?: string };
  modules: Array<{
    canonicalName: string;
    version: string;
    order: number;
    slot?: string;
    hash?: string;
  }>;
}

export interface WorkspaceSchemaCompositionResult {
  composition: SchemaCompositionDraft | null;
  workspaceRevision: number;
  preview?: SchemaCompositionPreviewResult;
  binding?: {
    canonicalName: string;
    schemaName: string;
    version: string;
    mode: 'draft_override';
    schemaHash: string;
    compositionId: string;
    compositionRevision: number;
    compositionHash: string;
  };
}

export interface SchemaCompositionWorkspaceContext {
  projectId: string;
  workspaceId: string;
  workspaceTitle: string;
  workspaceRevision: number;
  composition?: SchemaCompositionDraft;
  onSaved?: (result: WorkspaceSchemaCompositionResult) => void | Promise<void>;
  onApplied?: (result: WorkspaceSchemaCompositionResult) => void | Promise<void>;
  appliedCompositionRevision?: number;
  appliedSchemaHash?: string;
}

export interface YSchemaArtifactRegistryPage {
  items: Array<Record<string, unknown>>;
  next_cursor: string | null;
  has_more: boolean;
}
