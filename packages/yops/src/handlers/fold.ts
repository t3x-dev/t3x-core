import type { OpHandler } from '../registry';
import { resolvePath, deepClone, setAtPath, deleteAtPath, parsePath } from '../paths';
import { yopsError, YOPS_ERRORS } from '../errors';
import type { YValue } from '../types';

export const foldHandler: OpHandler = (doc, fields, index) => {
  const path = fields.path as string;

  const target = resolvePath(doc, path);

  if (target === undefined || target === null || typeof target !== 'object' || Array.isArray(target)) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.NOT_FOLDABLE, `Path "${path}" is not a mapping`, index),
    };
  }

  const targetMap = target as { [key: string]: YValue };
  const childKeys = Object.keys(targetMap);

  if (childKeys.length !== 1) {
    return {
      doc,
      error: yopsError(
        YOPS_ERRORS.NOT_FOLDABLE,
        `Mapping at "${path}" has ${childKeys.length} keys (need exactly 1 to fold)`,
        index,
      ),
    };
  }

  const childKey = childKeys[0];
  const childValue = deepClone(targetMap[childKey]);

  const segments = parsePath(path);
  const parentPath = segments
    .slice(0, -1)
    .map((s) => {
      if (s.type === 'key') return s.value;
      if (s.type === 'index') return `[${s.value}]`;
      return `[${s.key}=${s.value}]`;
    })
    .join('/');

  let cloned = deepClone(doc);
  const deleted = deleteAtPath(cloned, path);
  if (deleted === false) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.NOT_FOLDABLE, `Could not delete path "${path}"`, index),
    };
  }
  cloned = deleted;

  const childTargetPath = parentPath === '' ? childKey : `${parentPath}/${childKey}`;
  cloned = setAtPath(cloned, childTargetPath, childValue);

  return { doc: cloned };
};
