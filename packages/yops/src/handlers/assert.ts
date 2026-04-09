import { YOPS_ERRORS, yopsError } from '../errors';
import { resolvePath } from '../paths';
import type { OpHandler } from '../registry';
import type { YValue } from '../types';

export const assertHandler: OpHandler = (doc, fields, index) => {
  const path = fields.path as string;
  const equals = fields.equals as YValue | undefined;
  const exists = fields.exists as boolean | undefined;
  const type = fields.type as string | undefined;

  const value = resolvePath(doc, path);
  const pathExists = value !== undefined;

  // exists condition
  if (exists !== undefined) {
    if (exists && !pathExists) {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.ASSERTION_FAILED,
          `Expected path "${path}" to exist but it does not`,
          index
        ),
      };
    }
    if (!exists && pathExists) {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.ASSERTION_FAILED,
          `Expected path "${path}" to not exist but it does`,
          index
        ),
      };
    }
  }

  // equals condition
  if (equals !== undefined) {
    if (!pathExists) {
      return {
        doc,
        error: yopsError(YOPS_ERRORS.ASSERTION_FAILED, `Path "${path}" does not exist`, index),
      };
    }
    if (JSON.stringify(value) !== JSON.stringify(equals)) {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.ASSERTION_FAILED,
          `Expected "${JSON.stringify(equals)}" at path "${path}" but got "${JSON.stringify(value)}"`,
          index
        ),
      };
    }
  }

  // type condition
  if (type !== undefined) {
    if (!pathExists) {
      return {
        doc,
        error: yopsError(YOPS_ERRORS.ASSERTION_FAILED, `Path "${path}" does not exist`, index),
      };
    }
    const actualType = Array.isArray(value)
      ? 'sequence'
      : value !== null && typeof value === 'object'
        ? 'mapping'
        : 'scalar';
    if (actualType !== type) {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.ASSERTION_FAILED,
          `Expected type "${type}" at path "${path}" but got "${actualType}"`,
          index
        ),
      };
    }
  }

  // No condition or all passed
  return { doc };
};
