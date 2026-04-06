// @yops-dev/core — Declarative YAML Operations

export type {
  YValue,
  YDocument,
  YOp,
  YOpsResult,
  YOpsError,
  DefineOp,
  DropOp,
  RenameOp,
  SetOp,
  UnsetOp,
  PopulateOp,
  AppendOp,
  MoveOp,
  CloneOp,
  NestOp,
  SplitOp,
  FoldOp,
  MergeOp,
  SortOp,
  UniqueOp,
  PickOp,
  OmitOp,
  AssertOp,
} from './types';

export { YOPS_ERRORS, type YOpsErrorCode } from './errors';

export { parsePath, resolvePath } from './paths';
export type { PathSegment } from './paths';

export { applyYOps } from './engine';

export { validateOps, YOpSchema } from './schema';
export type { ValidationResult } from './schema';

export { parseYOpsYaml, formatYOps } from './format';
export type { ParseResult } from './format';

export { classifyYOp } from './classify';
export type { YOpCategory } from './classify';

export { parseSpec } from './spec';
export type { YOpsSpec, OpSpec, FieldSpec, TestCase } from './spec';

export { OpRegistry } from './registry';
export type { OpHandler, OpResult } from './registry';
