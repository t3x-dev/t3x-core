import { YOPS_ERRORS, yopsError } from '../errors';
import { deepClone, deleteAtPath, hasOwnKey, resolvePath, setAtPath, setOwnKey } from '../paths';
import type { OpHandler } from '../registry';
import type { YValue } from '../types';

export const splitHandler: OpHandler = (doc, fields, index) => {
  const path = fields.path as string;
  const into = fields.into as { [groupName: string]: string[] };

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

  const seenSourceKeys = new Set<string>();
  for (const groupKeys of Object.values(into)) {
    for (const key of groupKeys) {
      if (seenSourceKeys.has(key)) {
        return {
          doc,
          error: yopsError(
            YOPS_ERRORS.INVALID_OP,
            `Key "${key}" cannot be assigned to multiple split groups`,
            index
          ),
        };
      }
      seenSourceKeys.add(key);
    }
  }

  for (const groupKeys of Object.values(into)) {
    for (const key of groupKeys) {
      if (!hasOwnKey(targetMap, key)) {
        return {
          doc,
          error: yopsError(
            YOPS_ERRORS.PATH_NOT_FOUND,
            `Key "${key}" does not exist in mapping at "${path}"`,
            index
          ),
        };
      }
    }
  }

  const allMovedKeys = new Set(Object.values(into).flat());
  for (const groupName of Object.keys(into)) {
    if (hasOwnKey(targetMap, groupName) && !allMovedKeys.has(groupName)) {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.ALREADY_EXISTS,
          `Group name "${groupName}" already exists in mapping at "${path}"`,
          index
        ),
      };
    }
  }

  // Build group mappings from the original target (before any mutations)
  const groups: { [groupName: string]: { [key: string]: YValue } } = {};
  for (const [groupName, groupKeys] of Object.entries(into)) {
    const groupMap: { [key: string]: YValue } = {};
    for (const key of groupKeys) {
      setOwnKey(groupMap, key, deepClone(targetMap[key]));
    }
    setOwnKey(groups, groupName, groupMap);
  }

  let cloned = deepClone(doc);

  // Delete source keys first (before creating groups, to avoid collision)
  for (const key of allMovedKeys) {
    const keyPath = path === '' ? key : `${path}/${key}`;
    const deleted = deleteAtPath(cloned, keyPath);
    if (deleted !== false) {
      cloned = deleted;
    }
  }

  // Then create group mappings
  for (const [groupName, groupMap] of Object.entries(groups)) {
    const groupPath = path === '' ? groupName : `${path}/${groupName}`;
    cloned = setAtPath(cloned, groupPath, groupMap);
  }

  return { doc: cloned };
};
