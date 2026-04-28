import { YOPS_ERRORS, yopsError } from '../errors';
import { deepClone, deleteAtPath, resolvePath, setAtPath } from '../paths';
import type { OpHandler } from '../registry';
import type { YValue } from '../types';

export const mergeHandler: OpHandler = (doc, fields, index) => {
  const path = fields.path as string;
  const keys = fields.keys as string[];
  const into = fields.into as string;

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
      error: yopsError(YOPS_ERRORS.NOT_A_MAPPING, `Path "${path}" is not a mapping`, index),
    };
  }

  const targetMap = target as { [key: string]: YValue };

  for (const key of keys) {
    if (!(key in targetMap)) {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.NOT_SIBLINGS,
          `Key "${key}" is not a sibling under "${path}"`,
          index
        ),
      };
    }
  }

  for (const key of keys) {
    const val = targetMap[key];
    if (val === null || typeof val !== 'object' || Array.isArray(val)) {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.NOT_A_MAPPING,
          `Key "${key}" in "${path}" is not a mapping`,
          index
        ),
      };
    }
  }

  const merged: { [key: string]: YValue } = {};
  for (const key of keys) {
    const val = targetMap[key];
    Object.assign(merged, deepClone(val as { [k: string]: YValue }));
  }

  let cloned = deepClone(doc);
  for (const key of keys) {
    const keyPath = path === '' ? key : `${path}/${key}`;
    const deleted = deleteAtPath(cloned, keyPath);
    if (deleted !== false) {
      cloned = deleted;
    }
  }
  const intoPath = path === '' ? into : `${path}/${into}`;
  cloned = setAtPath(cloned, intoPath, merged);

  return { doc: cloned };
};
