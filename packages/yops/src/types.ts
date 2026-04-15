/**
 * @yops-dev/core — Type Definitions
 *
 * YValue: any valid YAML value (the document type)
 * YOp: discriminated union of all 18 operations
 * YOpsResult/YOpsError: execution result types
 */

// ── Value Types ──

export type YValue = string | number | boolean | null | YValue[] | { [key: string]: YValue };

export type YDocument = YValue;

// ── DDL Operations ──

export interface DefineOp {
  path: string;
}

export interface DropOp {
  path: string;
}

export interface RenameOp {
  path: string;
  to: string;
}

// ── DML Operations ──

export interface SetOp {
  path: string;
  value: YValue;
}

export interface UnsetOp {
  path: string;
}

export interface PopulateOp {
  path: string;
  values: { [key: string]: YValue };
}

export interface AppendOp {
  path: string;
  value: YValue;
}

// ── DTL Operations ──

export interface MoveOp {
  from: string;
  to: string;
}

export interface CloneOp {
  from: string;
  to: string;
}

export interface NestOp {
  path: string;
  keys: string[];
  under: string;
}

export interface SplitOp {
  path: string;
  into: { [group: string]: string[] };
}

export interface FoldOp {
  path: string;
}

export interface MergeOp {
  path: string;
  keys: string[];
  into: string;
}

export interface SortOp {
  path: string;
  by?: string;
  order?: 'asc' | 'desc';
}

export interface UniqueOp {
  path: string;
  by?: string;
}

export interface PickOp {
  path: string;
  keys: string[];
}

export interface OmitOp {
  path: string;
  keys: string[];
}

// ── DCL Operations ──

export interface AssertOp {
  path: string;
  equals?: YValue;
  exists?: boolean;
  type?: 'mapping' | 'sequence' | 'scalar';
}

// ── Discriminated Union ──

export type YOp =
  | { define: DefineOp }
  | { drop: DropOp }
  | { rename: RenameOp }
  | { set: SetOp }
  | { unset: UnsetOp }
  | { populate: PopulateOp }
  | { append: AppendOp }
  | { move: MoveOp }
  | { clone: CloneOp }
  | { nest: NestOp }
  | { split: SplitOp }
  | { fold: FoldOp }
  | { merge: MergeOp }
  | { sort: SortOp }
  | { unique: UniqueOp }
  | { pick: PickOp }
  | { omit: OmitOp }
  | { assert: AssertOp };

// ── Result ──

export interface YOpsError {
  code: string;
  message: string;
  op_index: number;
}

export interface YOpsResult {
  ok: boolean;
  doc: YValue;
  applied: number;
  error?: YOpsError;
}
