// @yops-dev/core — Declarative YAML Operations

// ── Types ──

export { canonicalJson, canonicalKey, compareCodepoints, compareYValues } from './canonical';
export type { YOpCategory } from './classify';
export { classifyYOp } from './classify';
export { createEngine } from './engine';
export { YOPS_ERRORS, type YOpsErrorCode } from './errors';
export type { ParseResult } from './format';
export { formatYOps, parseYOpsYaml } from './format';
export { registerAllHandlers } from './handlers';
export type { ParsePathResult, PathSegment } from './paths';
export { parsePath, resolvePath, tryParsePath } from './paths';
export type {
  CompileYOpsMappingKeyOmitInput,
  CompileYOpsMappingKeyPickInput,
  CompileYOpsMappingKeyRenameInput,
  CompileYOpsPathCloneInput,
  CompileYOpsPathMoveInput,
  CompileYOpsPathReplacementInput,
  CompileYOpsRecipeInvocationResult,
  CompileYOpsRecipeInvocationsResult,
  CompileYOpsSequenceAppendInput,
  YOpsAbsentPathValue,
  YOpsPathValue,
  YOpsPresentPathValue,
  YOpsPrimitiveOperationName,
  YOpsRecipeCompiler,
  YOpsRecipeExpansion,
  YOpsRecipeId,
  YOpsRecipeInput,
  YOpsRecipeInvocation,
  YOpsRecipeProfile,
  YOpsRecipeProfileId,
  YOpsV1OperationName,
} from './recipes';
export {
  canonicalYOpsRecipeExpansion,
  canonicalYOpsRecipeInvocation,
  compileYOpsMappingKeyOmit,
  compileYOpsMappingKeyPick,
  compileYOpsMappingKeyRename,
  compileYOpsPathClone,
  compileYOpsPathMove,
  compileYOpsPathReplacement,
  compileYOpsRecipe,
  compileYOpsRecipeInvocation,
  compileYOpsRecipeInvocations,
  compileYOpsSequenceAppend,
  createYOpsRecipeInvocation,
  getYOpsRecipeCompiler,
  listYOpsRecipeCompilers,
  YOPS_OPS_V1_PROFILE_ID,
  YOPS_PRIMITIVE_OPERATION_NAMES,
  YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
  YOPS_RECIPE_APPEND_SEQUENCE_ITEM_ID,
  YOPS_RECIPE_CLONE_PATH_ID,
  YOPS_RECIPE_EXPANSION_SCHEMA,
  YOPS_RECIPE_INVOCATION_SCHEMA,
  YOPS_RECIPE_MOVE_PATH_ID,
  YOPS_RECIPE_OMIT_MAPPING_KEYS_ID,
  YOPS_RECIPE_PICK_MAPPING_KEYS_ID,
  YOPS_RECIPE_PROFILES,
  YOPS_RECIPE_RENAME_MAPPING_KEY_ID,
  YOPS_RECIPE_REPLACE_PATH_ID,
  YOPS_V1_FROZEN_OPERATION_NAMES,
  YOPS_V1_SPEC_DIGEST,
  YOPS_V1_SPEC_DIGEST_DOMAIN,
} from './recipes';
export type { OpHandler, OpResult } from './registry';
export { OpRegistry } from './registry';
export type { ValidationResult } from './schema';
export { validateOps, YOpSchema } from './schema';
export type { FieldSpec, OpSpec, PathFields, StabilityStatus, TestCase, YOpsSpec } from './spec';
export { parseSpec } from './spec';
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
  YOp,
  YOpsError,
  YOpsResult,
  YOpsWarning,
  YValue,
} from './types';
export type { YOpsDiagnostic, YOpsDiagnosticCode } from './validator';
export { validateYOpsOps, validateYOpsYaml, YOPS_DIAGNOSTIC_CODES } from './validator';

// ── Bootstrap: spec -> registry -> engine ──
// specData.ts is generated from yops.yaml at build time (pnpm generate:spec).
// No fs.readFileSync at runtime — works in Node, browsers, and bundlers.

import { initClassify } from './classify';
import { createEngine } from './engine';
import { registerAllHandlers } from './handlers';
import { OpRegistry } from './registry';
import { parseSpec } from './spec';
import { SPEC_YAML } from './specData';

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
