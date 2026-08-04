import type { NodeSchema, RelationTypeSchema, ReservedRuleSchema, YSchema } from '../p0/types';

export type YSchemaArtifactFamily = 'esphome-device' | 'prd' | 'prompt' | 'skill';
export type YSchemaModuleKind = 'policy' | 'render' | 'structure' | 'workflow';
export type YSchemaArtifactStatus = 'active' | 'deprecated' | 'draft';
export type YSchemaArtifactSource = 'community' | 'official' | 'team';

export interface YSchemaCoreArtifact {
  apiVersion: 't3x.dev/yschema-core/v1';
  canonicalName: string;
  version: string;
  family: YSchemaArtifactFamily;
  title: string;
  description: string;
  status: YSchemaArtifactStatus;
  source: YSchemaArtifactSource;
  provides: string[];
  extensionSlots: string[];
  render?: {
    defaultRenderer: string;
    availableRenderers: string[];
  };
  schema: YSchema;
}

export interface YSchemaModuleManifest {
  apiVersion: 't3x.dev/yschema-module/v1';
  canonicalName: string;
  version: string;
  family: YSchemaArtifactFamily;
  title: string;
  description: string;
  domain: string;
  kind: YSchemaModuleKind;
  status: YSchemaArtifactStatus;
  source: YSchemaArtifactSource;
  compatibility: { core: string; versions: string[] };
  provides: string[];
  requires: string[];
  defaultPlacement: { slot: string };
  contribution: {
    nodes?: Record<string, NodeSchema>;
    relationTypes?: Record<string, RelationTypeSchema>;
    rules?: ReservedRuleSchema[];
  };
  registry?: {
    icon: string;
    updatedAt: string;
    usageCount: number;
    starCount: number;
  };
}

export interface YSchemaArtifactReference {
  canonicalName: string;
  version: string;
  hash?: string;
}

export interface YSchemaCompositionModuleReference extends YSchemaArtifactReference {
  order: number;
  slot?: string;
}

export interface YSchemaCompositionDraft {
  apiVersion: 't3x.dev/yschema-composition/v1';
  id: string;
  revision: number;
  family: YSchemaArtifactFamily;
  status: 'draft';
  core: YSchemaArtifactReference;
  modules: YSchemaCompositionModuleReference[];
}

export type YSchemaCompositionIssueCode =
  | 'CORE_INCOMPATIBLE'
  | 'DEPENDENCY_CYCLE'
  | 'DUPLICATE_MODULE'
  | 'DUPLICATE_ORDER'
  | 'INVALID_COMPILED_SCHEMA'
  | 'INVALID_ORDER'
  | 'MISSING_CAPABILITY'
  | 'MODULE_NOT_FOUND'
  | 'PATH_OWNERSHIP_CONFLICT'
  | 'PROVIDER_AFTER_CONSUMER'
  | 'RELATION_TYPE_CONFLICT'
  | 'RULE_ID_CONFLICT'
  | 'SLOT_NOT_FOUND';

export interface YSchemaCompositionIssue {
  code: YSchemaCompositionIssueCode;
  message: string;
  blocking: boolean;
  module?: string;
  path?: string;
  details?: Record<string, unknown>;
}

export interface YSchemaCompositionVerificationReport {
  valid: boolean;
  issues: YSchemaCompositionIssue[];
}

export interface YSchemaCompositionRenderEntry {
  artifact: string;
  version: string;
  order: number;
  slot: string;
  nodePaths: string[];
}

export interface YSchemaCompositionPathOrigin {
  artifact: string;
  version: string;
  kind: 'core' | 'module';
}

export interface CompiledYSchemaComposition {
  schema: YSchema;
  renderPlan: YSchemaCompositionRenderEntry[];
  originsByPath: Record<string, YSchemaCompositionPathOrigin>;
  report: YSchemaCompositionVerificationReport;
  compiledSchemaHash: string;
  compositionHash: string;
}

export interface CompileYSchemaCompositionInput {
  composition: YSchemaCompositionDraft;
  core: YSchemaCoreArtifact;
  modules: YSchemaModuleManifest[];
}
