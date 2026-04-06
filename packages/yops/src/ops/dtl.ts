/**
 * @yops-dev/core — DTL Operations
 *
 * move:   Relocate a subtree to a new path.
 * clone:  Deep copy a subtree to a new path.
 * nest:   Wrap sibling keys under a new parent key.
 * split:  Distribute keys from a mapping into new child mappings.
 * fold:   Collapse a single-child mapping into its parent.
 * merge:  Combine sibling mappings into one.
 * sort:   Sort a sequence (optionally by a key, optionally descending).
 * unique: Deduplicate a sequence (optionally by a key field).
 * pick:   Keep only specified keys in a mapping.
 * omit:   Remove specified keys from a mapping (idempotent).
 */

import { yopsError, YOPS_ERRORS } from '../errors';
import { resolvePath, deepClone, parsePath, deleteAtPath, setAtPath } from '../paths';
import type {
  YValue,
  YOpsError,
  MoveOp,
  CloneOp,
  NestOp,
  SplitOp,
  FoldOp,
  MergeOp,
  SortOp,
  UniqueOp,
  PickOp,
  OmitOp,
} from '../types';

type OpResult = { doc: YValue; error?: YOpsError };

// ── move ─────────────────────────────────────────────────────────────────────

export function applyMove(doc: YValue, op: MoveOp, index: number): OpResult {
  const { from, to } = op;

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

  // Deep clone doc, set value at target, then delete source
  let cloned = deepClone(doc);
  cloned = setAtPath(cloned, to, sourceValue);
  const deleted = deleteAtPath(cloned, from);
  if (deleted === false) {
    // Should not happen since we verified source exists, but guard anyway
    return {
      doc,
      error: yopsError(YOPS_ERRORS.PATH_NOT_FOUND, `Path "${from}" could not be deleted`, index),
    };
  }

  return { doc: deleted };
}

// ── clone ─────────────────────────────────────────────────────────────────────

export function applyClone(doc: YValue, op: CloneOp, index: number): OpResult {
  const { from, to } = op;

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
}

// ── nest ──────────────────────────────────────────────────────────────────────

export function applyNest(doc: YValue, op: NestOp, index: number): OpResult {
  const { path, keys, under } = op;

  const target = resolvePath(doc, path);

  if (target === undefined || target === null || typeof target !== 'object' || Array.isArray(target)) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.NOT_A_MAPPING, `Path "${path}" is not a mapping`, index),
    };
  }

  const targetMap = target as { [key: string]: YValue };

  // Verify all keys exist
  for (const key of keys) {
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

  // Build the nested object from listed keys
  const nested: { [key: string]: YValue } = {};
  for (const key of keys) {
    nested[key] = deepClone(targetMap[key]);
  }

  // Deep clone doc, delete original keys, add wrapper
  let cloned = deepClone(doc);
  for (const key of keys) {
    const keyPath = path === '' ? key : `${path}/${key}`;
    const deleted = deleteAtPath(cloned, keyPath);
    if (deleted !== false) {
      cloned = deleted;
    }
  }
  const wrapperPath = path === '' ? under : `${path}/${under}`;
  cloned = setAtPath(cloned, wrapperPath, nested);

  return { doc: cloned };
}

// ── split ─────────────────────────────────────────────────────────────────────

export function applySplit(doc: YValue, op: SplitOp, index: number): OpResult {
  const { path, into } = op;

  const target = resolvePath(doc, path);

  if (target === undefined || target === null || typeof target !== 'object' || Array.isArray(target)) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.NOT_A_MAPPING, `Path "${path}" is not a mapping`, index),
    };
  }

  const targetMap = target as { [key: string]: YValue };

  // Verify all listed keys exist
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

  // Collect all keys that will be moved
  const allMovedKeys = new Set(Object.values(into).flat());

  // Deep clone doc, create child mappings, delete originals
  let cloned = deepClone(doc);

  // Create each group
  for (const [groupName, groupKeys] of Object.entries(into)) {
    const groupMap: { [key: string]: YValue } = {};
    for (const key of groupKeys) {
      groupMap[key] = deepClone(targetMap[key]);
    }
    const groupPath = path === '' ? groupName : `${path}/${groupName}`;
    cloned = setAtPath(cloned, groupPath, groupMap);
  }

  // Delete the original keys
  for (const key of allMovedKeys) {
    const keyPath = path === '' ? key : `${path}/${key}`;
    const deleted = deleteAtPath(cloned, keyPath);
    if (deleted !== false) {
      cloned = deleted;
    }
  }

  return { doc: cloned };
}

// ── fold ──────────────────────────────────────────────────────────────────────

export function applyFold(doc: YValue, op: FoldOp, index: number): OpResult {
  const { path } = op;

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

  // Find the parent path
  const segments = parsePath(path);
  const parentPath = segments
    .slice(0, -1)
    .map((s) => {
      if (s.type === 'key') return s.value;
      if (s.type === 'index') return `[${s.value}]`;
      return `[${s.key}=${s.value}]`;
    })
    .join('/');

  // Deep clone, delete the wrapper, set child at parent level
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
}

// ── merge ─────────────────────────────────────────────────────────────────────

export function applyMerge(doc: YValue, op: MergeOp, index: number): OpResult {
  const { path, keys, into } = op;

  const target = resolvePath(doc, path);

  if (target === undefined || target === null || typeof target !== 'object' || Array.isArray(target)) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.NOT_A_MAPPING, `Path "${path}" is not a mapping`, index),
    };
  }

  const targetMap = target as { [key: string]: YValue };

  // Verify all keys exist
  for (const key of keys) {
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

  // Merge all mappings — last wins on key conflicts
  const merged: { [key: string]: YValue } = {};
  for (const key of keys) {
    const val = targetMap[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(merged, deepClone(val));
    }
  }

  // Deep clone doc, delete original keys, set merged
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
}

// ── sort ──────────────────────────────────────────────────────────────────────

export function applySort(doc: YValue, op: SortOp, index: number): OpResult {
  const { path, by, order = 'asc' } = op;

  const target = resolvePath(doc, path);

  if (target === undefined) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.PATH_NOT_FOUND, `Path "${path}" does not exist`, index),
    };
  }

  if (!Array.isArray(target)) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.NOT_A_SEQUENCE, `Value at "${path}" is not a sequence`, index),
    };
  }

  const clonedArr = target.map((item) => deepClone(item));

  clonedArr.sort((a, b) => {
    let aVal: YValue;
    let bVal: YValue;

    if (by !== undefined) {
      aVal =
        a !== null && typeof a === 'object' && !Array.isArray(a)
          ? (a as { [key: string]: YValue })[by]
          : undefined as unknown as YValue;
      bVal =
        b !== null && typeof b === 'object' && !Array.isArray(b)
          ? (b as { [key: string]: YValue })[by]
          : undefined as unknown as YValue;
    } else {
      aVal = a;
      bVal = b;
    }

    let cmp: number;
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      cmp = aVal.localeCompare(bVal);
    } else if (typeof aVal === 'number' && typeof bVal === 'number') {
      cmp = aVal - bVal;
    } else {
      // Fallback: string coercion
      cmp = String(aVal).localeCompare(String(bVal));
    }

    return order === 'desc' ? -cmp : cmp;
  });

  const result = setAtPath(doc, path, clonedArr);
  return { doc: result };
}

// ── unique ────────────────────────────────────────────────────────────────────

export function applyUnique(doc: YValue, op: UniqueOp, index: number): OpResult {
  const { path, by } = op;

  const target = resolvePath(doc, path);

  if (target === undefined) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.PATH_NOT_FOUND, `Path "${path}" does not exist`, index),
    };
  }

  if (!Array.isArray(target)) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.NOT_A_SEQUENCE, `Value at "${path}" is not a sequence`, index),
    };
  }

  const seen = new Set<string>();
  const deduped: YValue[] = [];

  for (const item of target) {
    let key: string;
    if (by !== undefined) {
      const val =
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? (item as { [key: string]: YValue })[by]
          : undefined;
      key = JSON.stringify(val);
    } else {
      key = JSON.stringify(item);
    }

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(deepClone(item));
    }
  }

  const result = setAtPath(doc, path, deduped);
  return { doc: result };
}

// ── pick ──────────────────────────────────────────────────────────────────────

export function applyPick(doc: YValue, op: PickOp, index: number): OpResult {
  const { path, keys } = op;

  const target = resolvePath(doc, path);

  if (target === undefined || target === null || typeof target !== 'object' || Array.isArray(target)) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.NOT_A_MAPPING, `Path "${path}" is not a mapping`, index),
    };
  }

  const targetMap = target as { [key: string]: YValue };
  const keepSet = new Set(keys);

  // Build a new mapping with only the listed keys
  const picked: { [key: string]: YValue } = {};
  for (const key of Object.keys(targetMap)) {
    if (keepSet.has(key)) {
      picked[key] = deepClone(targetMap[key]);
    }
  }

  const result = setAtPath(doc, path, picked);
  return { doc: result };
}

// ── omit ──────────────────────────────────────────────────────────────────────

export function applyOmit(doc: YValue, op: OmitOp, index: number): OpResult {
  const { path, keys } = op;

  const target = resolvePath(doc, path);

  if (target === undefined || target === null || typeof target !== 'object' || Array.isArray(target)) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.NOT_A_MAPPING, `Path "${path}" is not a mapping`, index),
    };
  }

  const targetMap = target as { [key: string]: YValue };
  const omitSet = new Set(keys);

  // Build a new mapping without the listed keys
  const kept: { [key: string]: YValue } = {};
  for (const key of Object.keys(targetMap)) {
    if (!omitSet.has(key)) {
      kept[key] = deepClone(targetMap[key]);
    }
  }

  const result = setAtPath(doc, path, kept);
  return { doc: result };
}
