/**
 * @yops-dev/core — DML Operations
 *
 * set:      Set a value at a path (creates intermediate mappings as needed).
 * unset:    Remove a key. Idempotent — no error if absent.
 * populate: Set multiple keys on a mapping at once.
 * append:   Add a value to a sequence.
 */

import type { YValue, YOpsError, SetOp, UnsetOp, PopulateOp, AppendOp } from '../types';
import { yopsError, YOPS_ERRORS } from '../errors';
import { resolvePath, setAtPath, deleteAtPath, deepClone } from '../paths';

type OpResult = { doc: YValue; error?: YOpsError };

// ── set ──────────────────────────────────────────────────────────────────────

export function applySet(doc: YValue, op: SetOp, index: number): OpResult {
  const { path, value } = op;

  try {
    const result = setAtPath(doc, path, value);
    return { doc: result };
  } catch (err) {
    return {
      doc,
      error: yopsError(
        YOPS_ERRORS.INVALID_PATH,
        `Cannot set at path "${path}": ${(err as Error).message}`,
        index,
      ),
    };
  }
}

// ── unset ────────────────────────────────────────────────────────────────────

export function applyUnset(doc: YValue, op: UnsetOp, index: number): OpResult {
  const { path } = op;

  const result = deleteAtPath(doc, path);
  if (result === false) {
    // Idempotent — missing key is not an error
    return { doc: deepClone(doc) };
  }

  return { doc: result };
}

// ── populate ─────────────────────────────────────────────────────────────────

export function applyPopulate(doc: YValue, op: PopulateOp, index: number): OpResult {
  const { path, values } = op;

  const target = resolvePath(doc, path);

  if (target === undefined) {
    return {
      doc,
      error: yopsError(
        YOPS_ERRORS.PATH_NOT_FOUND,
        `Path "${path}" does not exist`,
        index,
      ),
    };
  }

  if (target === null || typeof target !== 'object' || Array.isArray(target)) {
    return {
      doc,
      error: yopsError(
        YOPS_ERRORS.NOT_A_MAPPING,
        `Value at "${path}" is not a mapping`,
        index,
      ),
    };
  }

  // Apply each key in values onto the mapping at path
  let current = doc;
  for (const [key, value] of Object.entries(values)) {
    const keyPath = path === '' ? key : `${path}/${key}`;
    try {
      current = setAtPath(current, keyPath, value);
    } catch (err) {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.INVALID_PATH,
          `Cannot populate key "${key}" at "${path}": ${(err as Error).message}`,
          index,
        ),
      };
    }
  }

  return { doc: current };
}

// ── append ───────────────────────────────────────────────────────────────────

export function applyAppend(doc: YValue, op: AppendOp, index: number): OpResult {
  const { path, value } = op;

  const target = resolvePath(doc, path);

  if (target === undefined) {
    return {
      doc,
      error: yopsError(
        YOPS_ERRORS.PATH_NOT_FOUND,
        `Path "${path}" does not exist`,
        index,
      ),
    };
  }

  if (!Array.isArray(target)) {
    return {
      doc,
      error: yopsError(
        YOPS_ERRORS.NOT_A_SEQUENCE,
        `Value at "${path}" is not a sequence`,
        index,
      ),
    };
  }

  // Build the new array with the value appended
  const newArray = [...target, deepClone(value)];
  const result = setAtPath(doc, path, newArray);
  return { doc: result };
}
