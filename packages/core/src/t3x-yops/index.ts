// ── Engine ──

// ── Format (from @t3x-dev/yops, with backward-compat alias) ──
// ── Classify ──
export {
  classifyYOp,
  formatYOps as formatYOpsLog,
  parseYOpsYaml,
  type YOpCategory,
} from '@t3x-dev/yops';
export { applySourcedYOps, applyYOps } from './engine';
// ── Helpers (public-facing only) ──
export { findNode, getNodeKey, getParentPath } from './helpers';
// ── JSON Schema ──
export { getYOpsJsonSchema } from './jsonSchema';
export type { ReplayInput, ReplayResult, VerifyResult } from './replay';
// ── Replay ──
export { extractOpsFromEntries, replayYOps, verifyReplay } from './replay';
// ── Schema ──
export { YOpSchema, YOpsDocumentSchema } from './schema';
// ── Source provenance ──
export type { HumanSource, LLMSource, Source, TurnRef } from './source';
export { isHumanSource, isLLMSource } from './source';
export type { FailingOp, FailureReason, ValidationResult, ValidationTurn } from './sourceValidator';
// ── Source validator ──
export { validateSource } from './sourceValidator';
// ── Types ──
export type {
  // New ops in @t3x-dev/yops
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
  RelateOp,
  RenameOp,
  SetOp,
  SortOp,
  SourcedYOp,
  SplitOp,
  UniqueOp,
  UnrelateOp,
  UnsetOp,
  YOp,
  YOpsDocument,
  YOpsError,
  YOpsResult,
} from './types';
export { SNAKE_CASE_KEY, YOPS_ERRORS } from './types';
