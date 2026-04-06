import type { OpHandler } from '../registry';
import { resolvePath, setAtPath } from '../paths';
import { yopsError, YOPS_ERRORS } from '../errors';
import type { YValue } from '../types';

export const populateHandler: OpHandler = (doc, fields, index) => {
  const path = fields.path as string;
  const values = fields.values as { [key: string]: YValue };

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
      error: yopsError(YOPS_ERRORS.NOT_A_MAPPING, `Value at "${path}" is not a mapping`, index),
    };
  }

  let current = doc;
  for (const [key, value] of Object.entries(values)) {
    const keyPath = path === '' ? key : `${path}/${key}`;
    try {
      current = setAtPath(current, keyPath, value);
    } catch (err) {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.INVALID_PATH,
          `Cannot populate key "${key}" at "${path}": ${(err as Error).message}`,
          index,
        ),
      };
    }
  }

  return { doc: current };
};
