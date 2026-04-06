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

export {
  parsePath,
  resolvePath,
  setAtPath,
  deleteAtPath,
  deepClone,
  type PathSegment,
} from './paths';
