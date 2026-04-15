import { YOPS_ERRORS, yopsError } from '../errors';
import { deepClone, resolvePath, setAtPath } from '../paths';
import type { OpHandler } from '../registry';
import type { YValue } from '../types';

export const appendHandler: OpHandler = (doc, fields, index) => {
  const path = fields.path as string;
  const value = fields.value as YValue;

  const target = resolvePath(doc, path);

  if (target === undefined) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.PATH_NOT_FOUND, `Path "${path}" does not exist`, index),
    };
  }

  if (!Array.isArray(target)) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.NOT_A_SEQUENCE, `Value at "${path}" is not a sequence`, index),
    };
  }

  const newArray = [...target, deepClone(value)];
  const result = setAtPath(doc, path, newArray);
  return { doc: result };
};
