import { YOPS_ERRORS, yopsError } from '../errors';
import { deepClone, deleteAtPath, resolvePath, setAtPath } from '../paths';
import type { OpHandler } from '../registry';

export const moveHandler: OpHandler = (doc, fields, index) => {
  const from = fields.from as string;
  const to = fields.to as string;

  if (to === from || to.startsWith(`${from}/`)) {
    return {
      doc,
      error: yopsError(
        YOPS_ERRORS.INVALID_PATH,
        `Cannot move path "${from}" into its own subtree "${to}"`,
        index
      ),
    };
  }

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

  let cloned = deepClone(doc);
  cloned = setAtPath(cloned, to, sourceValue);
  const deleted = deleteAtPath(cloned, from);
  if (deleted === false) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.PATH_NOT_FOUND, `Path "${from}" could not be deleted`, index),
    };
  }

  return { doc: deleted };
};
