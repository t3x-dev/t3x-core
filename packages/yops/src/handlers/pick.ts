import { YOPS_ERRORS, yopsError } from '../errors';
import { deepClone, resolvePath, setAtPath } from '../paths';
import type { OpHandler } from '../registry';
import type { YValue } from '../types';

export const pickHandler: OpHandler = (doc, fields, index) => {
  const path = fields.path as string;
  const keys = fields.keys as string[];

  const target = resolvePath(doc, path);

  if (target === undefined) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.PATH_NOT_FOUND, `Path "${path}" does not exist`, index),
    };
  }

  if (target === null || typeof target !== 'object' || Array.isArray(target)) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.NOT_A_MAPPING, `Path "${path}" is not a mapping`, index),
    };
  }

  const targetMap = target as { [key: string]: YValue };
  const keepSet = new Set(keys);

  const picked: { [key: string]: YValue } = {};
  for (const key of Object.keys(targetMap)) {
    if (keepSet.has(key)) {
      picked[key] = deepClone(targetMap[key]);
    }
  }

  const result = setAtPath(doc, path, picked);
  return { doc: result };
};
