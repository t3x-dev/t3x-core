/**
 * @yops-dev/core — Error Codes
 */

export const YOPS_ERRORS = {
  PATH_NOT_FOUND: 'PATH_NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  NOT_A_MAPPING: 'NOT_A_MAPPING',
  NOT_A_SEQUENCE: 'NOT_A_SEQUENCE',
  NOT_SIBLINGS: 'NOT_SIBLINGS',
  NOT_FOLDABLE: 'NOT_FOLDABLE',
  INVALID_PATH: 'INVALID_PATH',
  ASSERTION_FAILED: 'ASSERTION_FAILED',
  UNKNOWN_OP: 'UNKNOWN_OP',
} as const;

export type YOpsErrorCode = (typeof YOPS_ERRORS)[keyof typeof YOPS_ERRORS];

export function yopsError(code: YOpsErrorCode, message: string, op_index: number) {
  return { code, message, op_index };
}
