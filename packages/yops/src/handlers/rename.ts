import { YOPS_ERRORS, yopsError } from '../errors';
import { deepClone, parsePath, resolvePath } from '../paths';
import type { OpHandler } from '../registry';
import type { YValue } from '../types';

export const renameHandler: OpHandler = (doc, fields, index) => {
  const path = fields.path as string;
  const to = fields.to as string;

  const value = resolvePath(doc, path);
  if (value === undefined) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.PATH_NOT_FOUND, `Path "${path}" does not exist`, index),
    };
  }

  const segments = parsePath(path);
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
  const parentPath = segments
    .slice(0, -1)
    .map((s) => {
      if (s.type === 'key') return s.value;
      if (s.type === 'index') return `[${s.value}]`;
      return `[${s.key}=${s.value}]`;
    })
    .join('/');

  // resolvePath returned a value above, so the parent must exist and
  // be traversable as a mapping with `oldKey` in scope. (resolvePath
  // returns undefined for a key segment against an array or scalar, so
  // those cases are already filtered into PATH_NOT_FOUND.)
  const parentMap = (parentPath === '' ? doc : resolvePath(doc, parentPath)) as {
    [key: string]: YValue;
  };

  if (to in parentMap) {
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
  const clonedParent = (parentPath === '' ? cloned : resolvePath(cloned, parentPath)) as {
    [key: string]: YValue;
  };

  const entries = Object.entries(clonedParent);
  for (const key of Object.keys(clonedParent)) {
    delete clonedParent[key];
  }
  for (const [k, v] of entries) {
    clonedParent[k === oldKey ? to : k] = v;
  }

  return { doc: cloned };
};
