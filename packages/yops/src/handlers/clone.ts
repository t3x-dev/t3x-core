import { YOPS_ERRORS, yopsError } from '../errors';
import { deepClone, resolvePath, setAtPath } from '../paths';
import type { OpHandler } from '../registry';

export const cloneHandler: OpHandler = (doc, fields, index) => {
  const from = fields.from as string;
  const to = fields.to as string;

  const sourceValue = resolvePath(doc, from);
  if (sourceValue === undefined) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.PATH_NOT_FOUND, `Path "${from}" does not exist`, index),
    };
  }

  if (resolvePath(doc, to) !== undefined) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.ALREADY_EXISTS, `Path "${to}" already exists`, index),
    };
  }

  const result = setAtPath(doc, to, deepClone(sourceValue));
  return { doc: result };
};
