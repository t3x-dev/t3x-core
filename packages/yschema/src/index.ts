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

// ── Validator ──

export { validateSchema } from './validator';

// ── Fixer ──

export type { FixPlan } from './fixer';
export { buildFixPlan } from './fixer';
