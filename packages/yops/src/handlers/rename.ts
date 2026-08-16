import { YOPS_ERRORS, yopsError } from '../errors';
import { deepClone, hasOwnKey, parsePath, resolvePathSegments, setOwnKey } from '../paths';
import type { OpHandler } from '../registry';
import type { YValue } from '../types';

export const renameHandler: OpHandler = (doc, fields, index) => {
  const path = fields.path as string;
  const to = fields.to as string;

  const segments = parsePath(path);
  const value = resolvePathSegments(doc, segments);
  if (value === undefined) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.PATH_NOT_FOUND, `Path "${path}" does not exist`, index),
    };
  }

  const lastSeg = segments[segments.length - 1];

  if (lastSeg.type !== 'key') {
    return {
      doc,
      error: yopsError(
        YOPS_ERRORS.INVALID_PATH,
        `rename only supports key segments; path "${path}" ends with a non-key segment`,
        index
      ),
    };
  }

  const oldKey = lastSeg.value;
  const parentSegments = segments.slice(0, -1);

  // Structured resolution returned a value above, so the parent must exist
  // and be traversable as a mapping with `oldKey` in scope. (Resolution
  // returns undefined for a key segment against an array or scalar, so
  // those cases are already filtered into PATH_NOT_FOUND.)
  const parentMap = resolvePathSegments(doc, parentSegments) as {
    [key: string]: YValue;
  };

  if (hasOwnKey(parentMap, to)) {
    return {
      doc,
      error: yopsError(
        YOPS_ERRORS.ALREADY_EXISTS,
        `Key "${to}" already exists at the same level as "${path}"`,
        index
      ),
    };
  }

  const cloned = deepClone(doc);
  const clonedParent = resolvePathSegments(cloned, parentSegments) as {
    [key: string]: YValue;
  };

  const entries = Object.entries(clonedParent);
  for (const key of Object.keys(clonedParent)) {
    delete clonedParent[key];
  }
  for (const [k, v] of entries) {
    setOwnKey(clonedParent, k === oldKey ? to : k, v);
  }

  return { doc: cloned };
};
