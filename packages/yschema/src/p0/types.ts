import type { YOp as GenericYOp, YValue } from '@t3x-dev/yops';

export type YSchemaKey = string;
export type YSchemaPath = string;
export type RelationEndpointPattern = string;
export type ValidationLocation = YSchemaPath | '$relations';

export type ContentKind = 'prose' | 'structured';

export type SlotType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

export interface YOpsHint {
  preferredOp?: 'define' | 'set' | 'populate' | 'append';
  path?: YSchemaPath;
  slot?: YSchemaKey;
}

export interface SlotSchema {
  type?: SlotType;
  enum?: YValue[];
  const?: YValue;
  default?: YValue;
  description?: string;
  contentGuidance?: string;
  examples?: YValue[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  maxWords?: number;
  gapQuestion?: string;
  contentKind?: ContentKind;
  provenanceRequired?: boolean;
  yopsHint?: YOpsHint;
}

export interface NodeSchema {
  required?: boolean;
  contentKind?: ContentKind;
  repeated?: boolean;
  description?: string;
  contentGuidance?: string;
  requiredSlots?: YSchemaKey[];
  slots?: Record<YSchemaKey, SlotSchema>;
  children?: Record<YSchemaKey, NodeSchema> | 'any';
}

export interface RelationTypeSchema {
  from: RelationEndpointPattern;
  to: RelationEndpointPattern;
  description?: string;
  contentGuidance?: string;
  acyclic?: boolean;
}

export interface ReservedRuleSchema {
  id: string;
  description?: string;
  [key: string]: unknown;
}

export interface YSchema {
  yschema: '0.1';
  name: string;
  version?: string | number;
  description?: string;
  strict?: boolean;
  nodes: Record<YSchemaKey, NodeSchema>;
  relationTypes?: Record<YSchemaKey, RelationTypeSchema>;
  rules?: ReservedRuleSchema[];
}

export interface YSchemaRelation {
  from: YSchemaPath;
  to: YSchemaPath;
  type: YSchemaKey;
}

export interface RelateYOp {
  relate: YSchemaRelation;
}

export interface UnrelateYOp {
  unrelate: YSchemaRelation;
}

export type YSchemaFixOp = GenericYOp | RelateYOp | UnrelateYOp;

export interface PromptContract {
  schemaName: string;
  schemaVersion?: string | number;
  description?: string;
  nodes: PromptNodeContract[];
  relationTypes?: PromptRelationTypeContract[];
}

export interface PromptNodeContract {
  path: YSchemaPath;
  contentKind?: ContentKind;
  repeated?: boolean;
  required?: boolean;
  description?: string;
  contentGuidance?: string;
  requiredSlots?: YSchemaKey[];
  slots: PromptSlotContract[];
}

export interface PromptSlotContract {
  path: YSchemaPath;
  key: YSchemaKey;
  type?: SlotType;
  enum?: YValue[];
  const?: YValue;
  default?: YValue;
  description?: string;
  contentGuidance?: string;
  contentKind?: ContentKind;
  examples?: YValue[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  maxWords?: number;
  pattern?: string;
  format?: string;
  provenanceRequired?: boolean;
  gapQuestion?: string;
  yopsHint?: YOpsHint;
}

export interface PromptRelationTypeContract {
  type: YSchemaKey;
  from: RelationEndpointPattern;
  to: RelationEndpointPattern;
  description?: string;
  contentGuidance?: string;
  acyclic?: boolean;
}

export type ValidationErrorCode =
  | 'INVALID_KEY'
  | 'INVALID_PATH'
  | 'INVALID_TYPE'
  | 'INVALID_ENUM'
  | 'INVALID_CONST'
  | 'INVALID_RANGE'
  | 'INVALID_LENGTH'
  | 'INVALID_PATTERN'
  | 'INVALID_REPEATED_ITEM_KEY'
  | 'INVALID_RELATION_TYPE'
  | 'INVALID_RELATION_ENDPOINT'
  | 'BROKEN_RELATION_ENDPOINT'
  | 'RELATION_ENDPOINT_MISMATCH'
  | 'SELF_RELATION'
  | 'DUPLICATE_RELATION'
  | 'RELATION_CYCLE'
  | 'UNEXPECTED_NODE'
  | 'UNEXPECTED_SLOT'
  | 'INVALID_SCHEMA';

export type ValidationGapCode =
  | 'REQUIRED_NODE_MISSING'
  | 'REQUIRED_SLOT_MISSING'
  | 'REQUIRED_EVIDENCE_MISSING'
  | 'DEFAULT_REQUIRES_APPROVAL'
  | 'USER_CHOICE_REQUIRED'
  | 'USER_INPUT_REQUIRED';

export interface ValidationError {
  code: ValidationErrorCode;
  path: ValidationLocation;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationGap {
  code: ValidationGapCode;
  path: YSchemaPath;
  message: string;
  gapQuestion?: string;
  fixIds?: string[];
  details?: Record<string, unknown>;
}

export interface FixProposal {
  id: string;
  code: string;
  path: ValidationLocation;
  title: string;
  description?: string;
  applyMode: 'automatic_after_review' | 'requires_user_choice' | 'requires_user_input';
  ops?: YSchemaFixOp[];
  choices?: Array<{
    label: string;
    value?: YValue | YSchemaRelation;
    ops: YSchemaFixOp[];
  }>;
}

export interface ValidationResult {
  valid: boolean;
  ready: boolean;
  errors: ValidationError[];
  gaps: ValidationGap[];
  fixes: FixProposal[];
}

export interface ProvenanceRef {
  origin:
    | 'user_evidence'
    | 'schema_default'
    | 'ai_paraphrase_approved'
    | 'system_generated'
    | 'unschematized';
  sourceId?: string;
  turnHash?: string;
  quote?: string;
  approved?: boolean;
}

export type ProvenanceIndex = Record<YSchemaPath, ProvenanceRef[]>;

export interface ValidationInput {
  tree: YValue;
  relations?: YSchemaRelation[];
  schema: YSchema;
  provenanceByPath?: ProvenanceIndex;
}
