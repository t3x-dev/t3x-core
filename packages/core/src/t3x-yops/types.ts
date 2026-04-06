// Re-export all generic types
export type {
  YValue, YDocument,
  YOp as GenericYOp,
  YOpsResult as GenericYOpsResult,
  YOpsError,
  DefineOp, DropOp, RenameOp,
  SetOp, UnsetOp, PopulateOp, AppendOp,
  MoveOp, CloneOp, NestOp, SplitOp, FoldOp, MergeOp,
  SortOp, UniqueOp, PickOp, OmitOp,
  AssertOp,
} from '@t3x-dev/yops';

export { YOPS_ERRORS } from '@t3x-dev/yops';
export type { YOpsErrorCode } from '@t3x-dev/yops';

import type { YOp as GenericYOp, YOpsError } from '@t3x-dev/yops';
import type { RelationType } from '../semantic/types';

// ── T3X-Specific Operations ──

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

// ── T3X YOp Union (18 generic + 2 T3X extensions) ──

export type YOp = GenericYOp | { relate: RelateOp } | { unrelate: UnrelateOp };

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
