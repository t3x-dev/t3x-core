import { YOPS_ERRORS, yopsError } from '../errors';
import { deepClone, resolvePath, setAtPath } from '../paths';
import type { OpHandler } from '../registry';
import type { YValue } from '../types';

export const sortHandler: OpHandler = (doc, fields, index) => {
  const path = fields.path as string;
  const by = fields.by as string | undefined;
  const order = (fields.order as string | undefined) ?? 'asc';

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

  const clonedArr = target.map((item) => deepClone(item));

  clonedArr.sort((a, b) => {
    let aVal: YValue;
    let bVal: YValue;

    if (by !== undefined) {
      aVal =
        a !== null && typeof a === 'object' && !Array.isArray(a)
          ? (a as { [key: string]: YValue })[by]
          : (undefined as unknown as YValue);
      bVal =
        b !== null && typeof b === 'object' && !Array.isArray(b)
          ? (b as { [key: string]: YValue })[by]
          : (undefined as unknown as YValue);
    } else {
      aVal = a;
      bVal = b;
    }

    let cmp: number;
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      cmp = aVal.localeCompare(bVal);
    } else if (typeof aVal === 'number' && typeof bVal === 'number') {
      cmp = aVal - bVal;
    } else {
      cmp = String(aVal).localeCompare(String(bVal));
    }

    return order === 'desc' ? -cmp : cmp;
  });

  const result = setAtPath(doc, path, clonedArr);
  return { doc: result };
};
