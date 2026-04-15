import { YOPS_ERRORS, yopsError } from '../errors';
import { setAtPath } from '../paths';
import type { OpHandler } from '../registry';
import type { YValue } from '../types';

export const setHandler: OpHandler = (doc, fields, index) => {
  const path = fields.path as string;
  const value = fields.value as YValue;

  try {
    const result = setAtPath(doc, path, value);
    return { doc: result };
  } catch (err) {
    return {
      doc,
      error: yopsError(
        YOPS_ERRORS.INVALID_PATH,
        `Cannot set at path "${path}": ${(err as Error).message}`,
        index
      ),
    };
  }
};
