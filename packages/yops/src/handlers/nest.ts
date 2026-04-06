import type { OpHandler } from '../registry';
import { resolvePath, deepClone, setAtPath, deleteAtPath } from '../paths';
import { yopsError, YOPS_ERRORS } from '../errors';
import type { YValue } from '../types';

export const nestHandler: OpHandler = (doc, fields, index) => {
  const path = fields.path as string;
  const keys = fields.keys as string[];
  const under = fields.under as string;

  const target = resolvePath(doc, path);

  if (target === undefined || target === null || typeof target !== 'object' || Array.isArray(target)) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.NOT_A_MAPPING, `Path "${path}" is not a mapping`, index),
    };
  }

  const targetMap = target as { [key: string]: YValue };

  for (const key of keys) {
    if (!(key in targetMap)) {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.PATH_NOT_FOUND,
          `Key "${key}" does not exist in mapping at "${path}"`,
          index,
        ),
      };
    }
  }

  const keysSet = new Set(keys);
  if (under in targetMap && !keysSet.has(under)) {
    return {
      doc,
      error: yopsError(
        YOPS_ERRORS.ALREADY_EXISTS,
        `Key "${under}" already exists in mapping at "${path}"`,
        index,
      ),
    };
  }

  const nested: { [key: string]: YValue } = {};
  for (const key of keys) {
    nested[key] = deepClone(targetMap[key]);
  }

  let cloned = deepClone(doc);
  for (const key of keys) {
    const keyPath = path === '' ? key : `${path}/${key}`;
    const deleted = deleteAtPath(cloned, keyPath);
    if (deleted !== false) {
      cloned = deleted;
    }
  }
  const wrapperPath = path === '' ? under : `${path}/${under}`;
  cloned = setAtPath(cloned, wrapperPath, nested);

  return { doc: cloned };
};
