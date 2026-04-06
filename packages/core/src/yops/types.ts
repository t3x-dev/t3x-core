/**
 * YOps — YAML Operations Type Definitions
 *
 * Discriminated union of all 13 operations, plus result/error types.
 * Zero runtime dependencies — pure type declarations.
 */

import type { RelationType, SlotValue } from '../semantic/types';

/** Shared snake_case key pattern: starts with lowercase letter, then lowercase/digits/underscores. */
export const SNAKE_CASE_KEY = /^[a-z][a-z0-9_]*$/;

// ── Operation Interfaces ──

export interface SetOp {
  path: string;
  value: SlotValue;
  source: string;
  from: string;
}

export interface UnsetOp {
  path: string;
}

export interface DefineOp {
  parent: string;
  key: string;
}

export interface PopulateOp {
  path: string;
  slots: Record<string, SlotValue>;
  source: Record<string, string>;
  from: string;
}

export interface DropOp {
  path: string;
  reason?: string;
}

export interface RenameOp {
  path: string;
  to: string;
}

export interface CloneOp {
  path: string;
  to: string;
}

export interface MoveOp {
  path: string;
  to: string;
}

export interface NestOp {
  paths: string[];
  under: string;
}

export interface SplitOp {
  path: string;
  into: Record<string, string[]>;
}

export interface FoldOp {
  path: string;
}

export interface MergeOp {
  paths: string[];
  into: string;
}

export interface RelateOp {
  from: string;
  to: string;
  type: RelationType;
}

export interface UnrelateOp {
  from: string;
  to: string;
  type: RelationType;
}

// ── Discriminated Union ──

export type YOp =
  | { set: SetOp }
  | { unset: UnsetOp }
  | { define: DefineOp }
  | { populate: PopulateOp }
  | { drop: DropOp }
  | { rename: RenameOp }
  | { clone: CloneOp }
  | { move: MoveOp }
  | { nest: NestOp }
  | { split: SplitOp }
  | { fold: FoldOp }
  | { merge: MergeOp }
  | { relate: RelateOp }
  | { unrelate: UnrelateOp };

// ── Document ──

export interface YOpsDocument {
  yops: YOp[];
}

// ── Error Codes ──

export const YOPS_ERRORS = {
  NODE_NOT_FOUND: 'NODE_NOT_FOUND',
  PARENT_NOT_FOUND: 'PARENT_NOT_FOUND',
  DUPLICATE_KEY: 'DUPLICATE_KEY',
  INVALID_KEY: 'INVALID_KEY',
  MISSING_SOURCE: 'MISSING_SOURCE',
  SLOT_NOT_FOUND: 'SLOT_NOT_FOUND',
  DUPLICATE_SLOT: 'DUPLICATE_SLOT',
  NOT_SIBLINGS: 'NOT_SIBLINGS',
  NOT_FOLDABLE: 'NOT_FOLDABLE',
  CYCLE_DETECTED: 'CYCLE_DETECTED',
  SELF_RELATION: 'SELF_RELATION',
  DUPLICATE_RELATION: 'DUPLICATE_RELATION',
} as const;

export type YOpsErrorCode = (typeof YOPS_ERRORS)[keyof typeof YOPS_ERRORS];

// ── Result ──

export interface YOpsError {
  code: YOpsErrorCode;
  message: string;
  op_index: number;
}

export interface YOpsResult {
  ok: boolean;
  trees: import('../semantic/types').TreeNode[];
  relations: import('../semantic/types').Relation[];
  applied: number;
  error?: YOpsError;
}
