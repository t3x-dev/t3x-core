// ── Engine ──
export { applyYOps } from './engine';

// ── Format (from @t3x-dev/yops, with backward-compat alias) ──
export { parseYOpsYaml, formatYOps as formatYOpsLog } from '@t3x-dev/yops';

// ── Schema ──
export { YOpSchema, YOpsDocumentSchema } from './schema';

// ── Types ──
export type {
  CloneOp, DefineOp, DropOp, FoldOp, MergeOp, MoveOp, NestOp,
  PopulateOp, RelateOp, RenameOp, SetOp, SplitOp, UnrelateOp, UnsetOp,
  YOp, YOpsDocument, YOpsError, YOpsResult,
  // New ops in @t3x-dev/yops
  AppendOp, SortOp, UniqueOp, PickOp, OmitOp, AssertOp,
} from './types';
export { YOPS_ERRORS, SNAKE_CASE_KEY } from './types';

// ── Classify ──
export { classifyYOp, type YOpCategory } from '@t3x-dev/yops';

// ── Helpers (public-facing only) ──
export { findNode, getNodeKey, getParentPath } from './helpers';

// ── JSON Schema ──
export { getYOpsJsonSchema } from './jsonSchema';

// ── Replay ──
export { replayYOps, verifyReplay, extractOpsFromEntries } from './replay';
export type { ReplayInput, ReplayResult, VerifyResult } from './replay';
