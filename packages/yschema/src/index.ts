// @t3x-dev/schema — YAML Schema Validation

// ── Types ──

export type {
  NodeDef,
  RuleDef,
  Schema,
  SchemaResult,
  SlotDef,
  SlotFull,
  SlotShorthand,
  Violation,
  ViolationCode,
} from './types';

// ── Parser ──

export { normalizeSlot, parseSchema, parseSchemaObject } from './parser';

// ── P0 Contract ──

export type {
  ContentKind,
  FixProposal,
  NodeSchema,
  PromptContract,
  PromptNodeContract,
  PromptRelationTypeContract,
  PromptSlotContract,
  ProvenanceIndex,
  ProvenanceRef,
  RelateYOp,
  RelationEndpointPattern,
  RelationTypeSchema,
  ReservedRuleSchema,
  SlotSchema,
  SlotType,
  UnrelateYOp,
  ValidationError,
  ValidationErrorCode,
  ValidationGap,
  ValidationGapCode,
  ValidationInput,
  ValidationLocation,
  ValidationResult,
  YOpsHint,
  YSchema,
  YSchemaFixOp,
  YSchemaKey,
  YSchemaPath,
  YSchemaRelation,
} from './p0';
export {
  generatePromptContract,
  normalizeYSchemaObject,
  parseYSchema,
  t3xPrdP0Fixtures,
  validateTree,
} from './p0';

// ── Validator ──

export { validateSchema } from './validator';

// ── Fixer ──

export type { FixPlan } from './fixer';
export { buildFixPlan } from './fixer';
