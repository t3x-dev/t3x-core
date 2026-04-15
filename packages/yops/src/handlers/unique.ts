import { YOPS_ERRORS, yopsError } from '../errors';
import { deepClone, resolvePath, setAtPath } from '../paths';
import type { OpHandler } from '../registry';
import type { YValue } from '../types';

export const uniqueHandler: OpHandler = (doc, fields, index) => {
  const path = fields.path as string;
  const by = fields.by as string | undefined;

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

  const seen = new Set<string>();
  const deduped: YValue[] = [];

  for (const item of target) {
    let key: string;
    if (by !== undefined) {
      const val =
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? (item as { [key: string]: YValue })[by]
          : undefined;
      key = JSON.stringify(val);
    } else {
      key = JSON.stringify(item);
    }

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(deepClone(item));
    }
  }

  const result = setAtPath(doc, path, deduped);
  return { doc: result };
};
