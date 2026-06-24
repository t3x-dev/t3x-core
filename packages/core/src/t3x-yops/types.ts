// Re-export all generic types
export type {
  AppendOp,
  AssertOp,
  CloneOp,
  DefineOp,
  DropOp,
  FoldOp,
  MergeOp,
  MoveOp,
  NestOp,
  OmitOp,
  PickOp,
  PopulateOp,
  RenameOp,
  SetOp,
  SortOp,
  SplitOp,
  UniqueOp,
  UnsetOp,
  YDocument,
  YOp as GenericYOp,
  YOpsError,
  YOpsErrorCode,
  YOpsResult as GenericYOpsResult,
  YValue,
} from '@t3x-dev/yops';
export { YOPS_ERRORS } from '@t3x-dev/yops';

import type { YOp as GenericYOp, YOpsError } from '@t3x-dev/yops';
import type { Source } from './source';

// ── T3X-Specific Operations ──

export interface RelateOp {
  from: string;
  to: string;
  type: string;
}

export interface UnrelateOp {
  from: string;
  to: string;
  type: string;
}

// ── T3X YOp Union (18 generic + 2 T3X extensions) ──

export type YOp = GenericYOp | { relate: RelateOp } | { unrelate: UnrelateOp };

/**
 * A YOp together with its mandatory source provenance.
 * This is the type stored in yops_log and passed through the T3X engine.
 */
export type SourcedYOp = YOp & { source: Source };

// ── T3X YOps Result (trees + relations, not raw YValue) ──

export interface YOpsResult {
  ok: boolean;
  trees: import('../semantic/types').TreeNode[];
  relations: import('../semantic/types').Relation[];
  applied: number;
  error?: YOpsError;
}

// ── Legacy compat ──
export const SNAKE_CASE_KEY = /^[a-z][a-z0-9_]*$/;

export interface YOpsDocument {
  yops: YOp[];
}
