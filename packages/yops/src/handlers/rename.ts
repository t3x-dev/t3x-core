import type { OpHandler } from '../registry';
import { deepClone, resolvePath, parsePath } from '../paths';
import { yopsError, YOPS_ERRORS } from '../errors';
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
        index,
      ),
    };
  }

  const oldKey = lastSeg.value;
  const parentPath = segments.slice(0, -1).map((s) => {
    if (s.type === 'key') return s.value;
    if (s.type === 'index') return `[${s.value}]`;
    return `[${s.key}=${s.value}]`;
  }).join('/');

  const parent = parentPath === '' ? doc : resolvePath(doc, parentPath);

  if (parent === null || parent === undefined || typeof parent !== 'object' || Array.isArray(parent)) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.NOT_A_MAPPING, `Parent at "${parentPath}" is not a mapping`, index),
    };
  }

  const parentMap = parent as { [key: string]: YValue };

  if (to in parentMap) {
    return {
      doc,
      error: yopsError(
        YOPS_ERRORS.ALREADY_EXISTS,
        `Key "${to}" already exists at the same level as "${path}"`,
        index,
      ),
    };
  }

  const cloned = deepClone(doc);
  const clonedParent = (parentPath === '' ? cloned : resolvePath(cloned, parentPath)) as { [key: string]: YValue };

  const entries = Object.entries(clonedParent);
  for (const key of Object.keys(clonedParent)) {
    delete clonedParent[key];
  }
  for (const [k, v] of entries) {
    clonedParent[k === oldKey ? to : k] = v;
  }

  return { doc: cloned };
};
