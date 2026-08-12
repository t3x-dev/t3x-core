import type { YSchemaArtifactSource, YSchemaArtifactStatus } from '../composition/types';
import type { NodeSchema, RelationTypeSchema, ReservedRuleSchema, YSchema } from '../p0/types';

export interface YSchemaCapabilityBindingV2 {
  capability: string;
  version: number;
  bindings?: Record<string, string>;
}

export interface YSchemaModuleImportV2 {
  capability: string;
  version: number;
  mode: 'optional' | 'required';
  as?: string;
  provider?: string;
}

export interface YSchemaModuleSuggestionV2 {
  capability: string;
  version: number;
  reason?: string;
}

export interface YSchemaCompositionPolicyV2 {
  id: string;
  description?: string;
  requireCapabilities?: string[];
  forbidCapabilities?: string[];
  allowedNamespaces?: string[];
  allowedSources?: YSchemaArtifactSource[];
  requireExactVersions?: boolean;
  forbidDeprecatedArtifacts?: boolean;
  requiredRuleIds?: string[];
}

export interface YSchemaModuleArtifactV2 {
  apiVersion: 't3x.dev/yschema-module/v2';
  canonicalName: string;
  version: string;
  title: string;
  description: string;
  status: YSchemaArtifactStatus;
  source: YSchemaArtifactSource;
  tags: string[];
  compatibility: {
    yschema: Array<'0.1'>;
    compiler?: string;
  };
  provides: YSchemaCapabilityBindingV2[];
  imports: YSchemaModuleImportV2[];
  suggests?: YSchemaModuleSuggestionV2[];
  contribution: {
    nodes?: Record<string, NodeSchema>;
    relationTypes?: Record<string, RelationTypeSchema>;
    rules?: ReservedRuleSchema[];
    policies?: YSchemaCompositionPolicyV2[];
  };
  registry?: Record<string, unknown>;
}

export interface YSchemaCompositionModuleReferenceV2 {
  canonicalName: string;
  version: string;
  hash?: string;
  presentationOrder: number;
}

export interface YSchemaCompositionDraftV2 {
  apiVersion: 't3x.dev/yschema-composition/v2';
  id: string;
  revision: number;
  status: 'draft';
  modules: YSchemaCompositionModuleReferenceV2[];
}

export type YSchemaCompositionIssueCodeV2 =
  | 'ARTIFACT_HASH_MISMATCH'
  | 'DUPLICATE_MODULE'
  | 'DUPLICATE_PRESENTATION_ORDER'
  | 'INVALID_COMPILED_SCHEMA'
  | 'INVALID_PRESENTATION_ORDER'
  | 'MODULE_NOT_FOUND'
  | 'PATH_OWNERSHIP_CONFLICT'
  | 'POLICY_CONTRADICTION'
  | 'POLICY_DEPRECATED_ARTIFACT'
  | 'POLICY_FORBIDDEN_CAPABILITY'
  | 'POLICY_NAMESPACE_NOT_ALLOWED'
  | 'POLICY_REQUIRED_CAPABILITY_MISSING'
  | 'POLICY_RULE_MISSING'
  | 'POLICY_SOURCE_NOT_ALLOWED'
  | 'RELATION_TYPE_CONFLICT'
  | 'REQUIRED_IMPORT_MISSING'
  | 'RULE_ID_CONFLICT'
  | 'UNSUPPORTED_YSCHEMA_VERSION';

export interface YSchemaCompositionIssueV2 {
  code: YSchemaCompositionIssueCodeV2;
  message: string;
  blocking: boolean;
  module?: string;
  path?: string;
  policy?: string;
  capability?: string;
  details?: Record<string, unknown>;
}

export interface YSchemaCompositionOriginV2 {
  artifact: string;
  version: string;
  kind: 'module';
}

export interface YSchemaCompositionRenderEntryV2 {
  artifact: string;
  version: string;
  order: number;
  slot: 'module';
  nodePaths: string[];
}

export interface CompiledYSchemaCompositionV2 {
  schema: YSchema;
  report: {
    valid: boolean;
    mode: 'governed' | 'open';
    issues: YSchemaCompositionIssueV2[];
  };
  originsByPath: Record<string, YSchemaCompositionOriginV2>;
  originsByRule: Record<string, YSchemaCompositionOriginV2>;
  originsByRelationType: Record<string, YSchemaCompositionOriginV2>;
  capabilityProviders: Record<string, YSchemaCompositionOriginV2[]>;
  renderPlan: YSchemaCompositionRenderEntryV2[];
  compiledSchemaHash: string;
  compositionHash: string;
  reportHash: string;
}

export interface CompileYSchemaCompositionV2Input {
  composition: YSchemaCompositionDraftV2;
  modules: YSchemaModuleArtifactV2[];
}
