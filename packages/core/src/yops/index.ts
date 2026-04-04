// ── Engine ──
export { applyYOps } from './engine';

// ── Format ──
export { formatYOpsLog, parseYOpsYaml } from './format';

// ── Schema ──
export { YOpSchema, YOpsDocumentSchema } from './schema';

// ── Types ──
export type {
  CloneOp, DefineOp, DropOp, FoldOp, MergeOp, MoveOp, NestOp,
  PopulateOp, RelateOp, RenameOp, SetOp, SplitOp, UnrelateOp, UnsetOp,
  YOp, YOpsDocument, YOpsError, YOpsResult,
} from './types';
export { YOPS_ERRORS, SNAKE_CASE_KEY } from './types';

// ── Classify ──
export { classifyYOp, type YOpCategory } from './classify';

// ── Helpers (public-facing only) ──
export { findNode, getNodeKey, getParentPath } from './helpers';

// ── JSON Schema ──
export { getYOpsJsonSchema } from './jsonSchema';

// ── Replay ──
export { replayYOps, verifyReplay, extractOpsFromEntries } from './replay';
export type { ReplayInput, ReplayResult, VerifyResult } from './replay';
