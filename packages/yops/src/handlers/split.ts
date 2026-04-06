import type { OpHandler } from '../registry';
import { resolvePath, deepClone, setAtPath, deleteAtPath } from '../paths';
import { yopsError, YOPS_ERRORS } from '../errors';
import type { YValue } from '../types';

export const splitHandler: OpHandler = (doc, fields, index) => {
  const path = fields.path as string;
  const into = fields.into as { [groupName: string]: string[] };

  const target = resolvePath(doc, path);

  if (target === undefined || target === null || typeof target !== 'object' || Array.isArray(target)) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.NOT_A_MAPPING, `Path "${path}" is not a mapping`, index),
    };
  }

  const targetMap = target as { [key: string]: YValue };

  for (const groupKeys of Object.values(into)) {
    for (const key of groupKeys) {
      if (!(key in targetMap)) {
        return {
          doc,
          error: yopsError(
            YOPS_ERRORS.PATH_NOT_FOUND,
            `Key "${key}" does not exist in mapping at "${path}"`,
            index,
          ),
        };
      }
    }
  }

  const allMovedKeys = new Set(Object.values(into).flat());
  for (const groupName of Object.keys(into)) {
    if (groupName in targetMap && !allMovedKeys.has(groupName)) {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.ALREADY_EXISTS,
          `Group name "${groupName}" already exists in mapping at "${path}"`,
          index,
        ),
      };
    }
  }

  let cloned = deepClone(doc);

  for (const [groupName, groupKeys] of Object.entries(into)) {
    const groupMap: { [key: string]: YValue } = {};
    for (const key of groupKeys) {
      groupMap[key] = deepClone(targetMap[key]);
    }
    const groupPath = path === '' ? groupName : `${path}/${groupName}`;
    cloned = setAtPath(cloned, groupPath, groupMap);
  }

  for (const key of allMovedKeys) {
    const keyPath = path === '' ? key : `${path}/${key}`;
    const deleted = deleteAtPath(cloned, keyPath);
    if (deleted !== false) {
      cloned = deleted;
    }
  }

  return { doc: cloned };
};
