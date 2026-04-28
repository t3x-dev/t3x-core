import { canonicalKey } from '../canonical';
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

  if (by !== undefined) {
    for (const item of target) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        return {
          doc,
          error: yopsError(
            YOPS_ERRORS.INVALID_OP,
            `unique by "${by}" requires every item at "${path}" to be a mapping`,
            index
          ),
        };
      }

      if (!Object.hasOwn(item, by)) {
        return {
          doc,
          error: yopsError(
            YOPS_ERRORS.INVALID_OP,
            `unique by "${by}" requires every item at "${path}" to contain that key`,
            index
          ),
        };
      }
    }
  }

  for (const item of target) {
    let key: string;
    if (by !== undefined) {
      const val =
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? (item as { [key: string]: YValue })[by]
          : null;
      key = canonicalKey(val as YValue);
    } else {
      key = canonicalKey(item);
    }

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(deepClone(item));
    }
  }

  const result = setAtPath(doc, path, deduped);
  return { doc: result };
};
