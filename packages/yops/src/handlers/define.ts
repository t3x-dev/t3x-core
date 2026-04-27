import { YOPS_ERRORS, yopsError } from '../errors';
import { deepClone, parsePath, resolvePath } from '../paths';
import type { OpHandler } from '../registry';
import type { YValue } from '../types';

export const defineHandler: OpHandler = (doc, fields, index) => {
  const path = fields.path as string;

  const segments = parsePath(path);
  for (const seg of segments) {
    if (seg.type !== 'key') {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.INVALID_PATH,
          `define only supports key segments; got "${JSON.stringify(seg)}" in path "${path}"`,
          index
        ),
      };
    }
  }

  if (segments.length === 0) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.INVALID_PATH, `define requires a non-empty path`, index),
    };
  }

  // The spec contract: parent must exist and be a mapping; final key must be
  // absent. No mkdir-p, no overwriting non-mapping intermediates.
  const keys = segments.map((s) => (s as { type: 'key'; value: string }).value);
  const parentKeys = keys.slice(0, -1);
  const finalKey = keys[keys.length - 1];

  const parentPath = parentKeys.join('/');
  const parent = parentKeys.length === 0 ? doc : resolvePath(doc, parentPath);

  if (parent === undefined) {
    return {
      doc,
      error: yopsError(
        YOPS_ERRORS.PATH_NOT_FOUND,
        `Parent path "${parentPath}" does not exist`,
        index
      ),
    };
  }

  if (parent === null || typeof parent !== 'object' || Array.isArray(parent)) {
    return {
      doc,
      error: yopsError(
        YOPS_ERRORS.NOT_A_MAPPING,
        `Parent at "${parentPath}" is not a mapping`,
        index
      ),
    };
  }

  if (finalKey in (parent as Record<string, YValue>)) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.ALREADY_EXISTS, `Path "${path}" already exists`, index),
    };
  }

  const cloned = deepClone(doc);
  const clonedParent = parentKeys.length === 0 ? cloned : resolvePath(cloned, parentPath);
  (clonedParent as Record<string, YValue>)[finalKey] = {};
  return { doc: cloned };
};
