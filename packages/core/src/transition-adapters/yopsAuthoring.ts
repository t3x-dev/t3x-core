/** Native document operations for application authoring. Kept distinct from legacy semantic-tree YOps. */
export {
  applyYOps as applyNativeYOps,
  canonicalJson as canonicalNativeYValue,
  compileYOpsOperationsToPrimitiveProfile as compileNativeYOpsToPrimitives,
  parsePath as parseNativeYOpsPath,
  resolvePath as resolveNativeYOpsPath,
  type YOp as NativeYOp,
  YOpSchema as NativeYOpSchema,
  type YValue as NativeYValue,
} from '@t3x-dev/yops';
