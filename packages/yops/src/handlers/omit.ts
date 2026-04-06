import type { OpHandler } from '../registry';
import { resolvePath, deepClone, setAtPath } from '../paths';
import { yopsError, YOPS_ERRORS } from '../errors';
import type { YValue } from '../types';

export const omitHandler: OpHandler = (doc, fields, index) => {
  const path = fields.path as string;
  const keys = fields.keys as string[];

  const target = resolvePath(doc, path);

  if (target === undefined || target === null || typeof target !== 'object' || Array.isArray(target)) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.NOT_A_MAPPING, `Path "${path}" is not a mapping`, index),
    };
  }

  const targetMap = target as { [key: string]: YValue };
  const omitSet = new Set(keys);

  const kept: { [key: string]: YValue } = {};
  for (const key of Object.keys(targetMap)) {
    if (!omitSet.has(key)) {
      kept[key] = deepClone(targetMap[key]);
    }
  }

  const result = setAtPath(doc, path, kept);
  return { doc: result };
};
