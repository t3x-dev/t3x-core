/**
 * @t3x-dev/schema — Type Definitions
 *
 * Types for user-defined YAML schemas, validation results, and violations.
 */

import type { YOp, YValue } from '@t3x-dev/yops';

// ── Slot Definition ──

export type SlotShorthand = 'scalar' | 'list' | YValue[];

export interface SlotFull {
  type?: 'scalar' | 'list';
  required?: boolean;
  enum?: YValue[];
  min?: number;
  max?: number;
  default?: YValue;
}

export type SlotDef = SlotShorthand | SlotFull;

// ── Node Definition ──

export interface NodeDef {
  required?: boolean;
  description?: string;
  slots?: Record<string, SlotDef>;
  children?: Record<string, NodeDef> | 'any';
  each_child?: {
    slots?: Record<string, SlotDef>;
  };
}

// ── Rule Definition ──

export interface RuleDef {
  id: string;
  if: string;
  severity?: 'error' | 'warn' | 'info';
  message?: string;
  // Conditions (exactly one per rule):
  must_have?: string[];
  must_not_have?: string[];
  one_of?: YValue[];
  not_empty?: boolean;
  max_children?: number;
  requires?: string[];
  // Auto-fix:
  fix?: YOp[];
}

// ── Schema ──

export interface Schema {
  name: string;
  version?: number | string;
  description?: string;
  strict?: boolean;
  nodes: Record<string, NodeDef>;
  rules?: RuleDef[];
}

// ── Validation Result ──

export type ViolationCode =
  | 'REQUIRED_NODE'
  | 'UNEXPECTED_NODE'
  | 'REQUIRED_SLOT'
  | 'INVALID_ENUM'
  | 'INVALID_TYPE'
  | 'INVALID_RANGE'
  | 'CHILD_MISMATCH'
  | 'RULE_VIOLATION';

export interface Violation {
  code: ViolationCode;
  path: string;
  severity: 'error' | 'warn' | 'info';
  message: string;
  fix?: YOp[];
}

export interface SchemaResult {
  valid: boolean;
  violations: Violation[];
}
