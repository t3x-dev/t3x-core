/**
 * @yops-dev/core — DDL Operations
 *
 * define: Create an empty mapping at a path (with intermediate keys).
 * drop:   Remove a key and everything under it.
 * rename: Change a key's name without moving it (preserves insertion order).
 */

import type { YValue, DefineOp, DropOp, RenameOp, YOpsError } from '../types';
import { deepClone, resolvePath, parsePath, deleteAtPath } from '../paths';
import { yopsError, YOPS_ERRORS } from '../errors';

type OpResult = { doc: YValue; error?: YOpsError };

// ── define ──────────────────────────────────────────────────────────────────

export function applyDefine(doc: YValue, op: DefineOp, index: number): OpResult {
  const { path } = op;

  // Check that path already exists
  if (resolvePath(doc, path) !== undefined) {
    return {
      doc,
      error: yopsError(
        YOPS_ERRORS.ALREADY_EXISTS,
        `Path "${path}" already exists`,
        index,
      ),
    };
  }

  // Validate: only key segments allowed (no array access)
  const segments = parsePath(path);
  for (const seg of segments) {
    if (seg.type !== 'key') {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.INVALID_PATH,
          `define only supports key segments; got "${JSON.stringify(seg)}" in path "${path}"`,
          index,
        ),
      };
    }
  }

  // Build the new doc by traversing and creating intermediates
  const cloned = deepClone(doc);
  _defineRecursive(cloned, segments.map((s) => (s as { type: 'key'; value: string }).value), 0);
  return { doc: cloned };
}

function _defineRecursive(current: YValue, keys: string[], idx: number): void {
  if (idx >= keys.length) return;

  const map = current as { [key: string]: YValue };
  const key = keys[idx];

  if (idx === keys.length - 1) {
    // Leaf — create empty mapping
    map[key] = {};
  } else {
    // Intermediate — ensure mapping exists and descend
    if (!(key in map) || map[key] === null || typeof map[key] !== 'object' || Array.isArray(map[key])) {
      map[key] = {};
    }
    _defineRecursive(map[key], keys, idx + 1);
  }
}

// ── drop ────────────────────────────────────────────────────────────────────

export function applyDrop(doc: YValue, op: DropOp, index: number): OpResult {
  const { path } = op;

  const result = deleteAtPath(doc, path);
  if (result === false) {
    return {
      doc,
      error: yopsError(
        YOPS_ERRORS.PATH_NOT_FOUND,
        `Path "${path}" does not exist`,
        index,
      ),
    };
  }

  return { doc: result };
}

// ── rename ──────────────────────────────────────────────────────────────────

export function applyRename(doc: YValue, op: RenameOp, index: number): OpResult {
  const { path, to } = op;

  // Resolve the value at path — must exist
  const value = resolvePath(doc, path);
  if (value === undefined) {
    return {
      doc,
      error: yopsError(
        YOPS_ERRORS.PATH_NOT_FOUND,
        `Path "${path}" does not exist`,
        index,
      ),
    };
  }

  // Find the parent mapping
  const segments = parsePath(path);
  const lastSeg = segments[segments.length - 1];

  // rename only works on key segments
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
      error: yopsError(
        YOPS_ERRORS.NOT_A_MAPPING,
        `Parent at "${parentPath}" is not a mapping`,
        index,
      ),
    };
  }

  const parentMap = parent as { [key: string]: YValue };

  // Check that `to` doesn't already exist
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

  // Rebuild the doc with the renamed key (preserving insertion order)
  const cloned = deepClone(doc);

  // Navigate to the cloned parent
  const clonedParent = (parentPath === '' ? cloned : resolvePath(cloned, parentPath)) as { [key: string]: YValue };

  // Rebuild entries in order, substituting the old key for the new one
  const entries = Object.entries(clonedParent);
  for (const key of Object.keys(clonedParent)) {
    delete clonedParent[key];
  }
  for (const [k, v] of entries) {
    clonedParent[k === oldKey ? to : k] = v;
  }

  return { doc: cloned };
}
