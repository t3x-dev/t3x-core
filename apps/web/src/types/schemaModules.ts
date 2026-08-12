export type SchemaArtifactKind = 'core' | 'module';
export type YSchemaArtifactFamily = 'esphome-device' | 'prd' | 'prompt' | 'skill';

export interface SchemaArtifactInstance {
  title: string;
  description: string;
  useCases: Array<{
    title: string;
    description: string;
  }>;
  value: Record<string, unknown>;
}

export interface SchemaModuleRulePreview {
  id: string;
  description: string;
  blocking: boolean;
}

export interface SchemaArtifactPreview {
  canonicalName: string;
  version: string;
  family: YSchemaArtifactFamily;
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
  renderers: string[];
  rules: SchemaModuleRulePreview[];
  versions: Array<{ version: string; status: string; updatedAt: string }>;
  updatedAt: string;
  usageCount: number;
  starCount: number;
  sortOrder: number;
  icon: 'blocks' | 'braces' | 'cpu' | 'database' | 'file' | 'monitor' | 'server';
  recommended?: boolean;
  tags?: string[];
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

export interface SchemaCompositionDraftV1 {
  apiVersion: 't3x.dev/yschema-composition/v1';
  id: string;
  revision: number;
  family: YSchemaArtifactFamily;
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

export interface SchemaCompositionDraftV2 {
  apiVersion: 't3x.dev/yschema-composition/v2';
  id: string;
  revision: number;
  status: 'draft';
  modules: Array<{
    canonicalName: string;
    version: string;
    presentationOrder: number;
    hash?: string;
  }>;
}

export type SchemaCompositionDraft = SchemaCompositionDraftV1 | SchemaCompositionDraftV2;

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
  onPublished?: (version: PublishedSchemaVersionManifest) => void | Promise<void>;
  appliedCompositionRevision?: number;
  appliedSchemaHash?: string;
}

export interface PublishSchemaCompositionInput {
  compositionRevision: number;
  compositionHash: string;
  canonicalName: string;
  version: string;
  title: string;
  description?: string;
  releaseNotes?: string;
}

export interface PublishedSchemaVersionManifest extends Record<string, unknown> {
  apiVersion: 't3x.dev/yschema-core/v1' | 't3x.dev/yschema-module/v2';
  canonicalName: string;
  version: string;
  family?: YSchemaArtifactFamily;
  title: string;
  description: string;
  status: 'active' | 'deprecated' | 'draft';
  source: 'official' | 'team' | 'community';
  artifactHash?: string;
  schema?: Record<string, unknown>;
}

export interface ProjectSchemaVersionHistory {
  items: PublishedSchemaVersionManifest[];
}

export interface YSchemaArtifactRegistryPage {
  items: Array<Record<string, unknown>>;
  next_cursor: string | null;
  has_more: boolean;
}
