// @yops-dev/core — Declarative YAML Operations

// ── Types ──

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

export { createEngine } from './engine';
export { registerAllHandlers } from './handlers';

// ── Bootstrap: spec -> registry -> engine ──
// specData.ts is generated from yops.yaml at build time (pnpm generate:spec).
// No fs.readFileSync at runtime — works in Node, browsers, and bundlers.

import { SPEC_YAML } from './specData';
import { parseSpec } from './spec';
import { OpRegistry } from './registry';
import { registerAllHandlers } from './handlers';
import { createEngine } from './engine';
import { initClassify } from './classify';

const _spec = parseSpec(SPEC_YAML);
const _registry = new OpRegistry(_spec);
registerAllHandlers(_registry);
_registry.validate();
initClassify(_spec);

const _engine = createEngine(_registry);

/** Apply YOps operations to a document. */
export const applyYOps = _engine.applyYOps;

/** The parsed YOps specification. */
export const spec = _spec;

/** The initialized op registry. */
export const registry = _registry;
