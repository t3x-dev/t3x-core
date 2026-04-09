/**
 * @yops-dev/core — Path Parser
 *
 * Addresses any node in a YAML document using a slash-separated path string.
 *
 * Segment types:
 *   key   — mapping key: `config/database/host`
 *   index — array index: `items/[0]`
 *   match — array key match: `users/[name=alice]/role`
 */

import type { YValue } from './types';

/** Compare a match segment's string value against a YAML value with type coercion.
 *  `[id=1]` matches both `{ id: "1" }` and `{ id: 1 }`. */
function matchEquals(actual: YValue, expected: string): boolean {
  if (actual === expected) return true;
  if (typeof actual === 'number' && String(actual) === expected) return true;
  if (typeof actual === 'boolean' && String(actual) === expected) return true;
  return false;
}

/** Predicate: does this array item match a key-match segment? */
function itemMatchesSeg(item: YValue, seg: { key: string; value: string }): boolean {
  return (
    item !== null &&
    typeof item === 'object' &&
    !Array.isArray(item) &&
    matchEquals((item as { [key: string]: YValue })[seg.key], seg.value)
  );
}

// ── Types ──────────────────────────────────────────────────────────────────

export type PathSegment =
  | { type: 'key'; value: string }
  | { type: 'index'; value: number }
  | { type: 'match'; key: string; value: string };

// ── parsePath ──────────────────────────────────────────────────────────────

/**
 * Parse a path string into an array of PathSegments.
 * Empty string returns [].
 */
export function parsePath(path: string): PathSegment[] {
  if (path === '') return [];

  return path.split('/').map((segment) => {
    // Array index: [n]
    const indexMatch = segment.match(/^\[(\d+)\]$/);
    if (indexMatch) {
      return { type: 'index', value: parseInt(indexMatch[1], 10) } as PathSegment;
    }

    // Key match: [key=value]
    const matchMatch = segment.match(/^\[([^=\]]+)=([^\]]*)\]$/);
    if (matchMatch) {
      return { type: 'match', key: matchMatch[1], value: matchMatch[2] } as PathSegment;
    }

    // Plain mapping key
    return { type: 'key', value: segment } as PathSegment;
  });
}

// ── deepClone ──────────────────────────────────────────────────────────────

/**
 * Recursive deep clone of any YValue. Primitives are returned as-is.
 */
export function deepClone(value: YValue): YValue {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(deepClone);
  }
  const result: { [key: string]: YValue } = {};
  for (const key of Object.keys(value as { [key: string]: YValue })) {
    result[key] = deepClone((value as { [key: string]: YValue })[key]);
  }
  return result;
}

// ── resolvePath ────────────────────────────────────────────────────────────

/**
 * Navigate a document to find the value at the given path.
 * Returns undefined if any segment cannot be followed.
 */
export function resolvePath(doc: YValue, path: string): YValue | undefined {
  const segments = parsePath(path);
  if (segments.length === 0) return doc;

  let current: YValue = doc;

  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;

    if (seg.type === 'key') {
      if (typeof current !== 'object' || Array.isArray(current)) return undefined;
      const map = current as { [key: string]: YValue };
      if (!(seg.value in map)) return undefined;
      current = map[seg.value];
    } else if (seg.type === 'index') {
      if (!Array.isArray(current)) return undefined;
      if (seg.value < 0 || seg.value >= current.length) return undefined;
      current = current[seg.value];
    } else {
      // match
      if (!Array.isArray(current)) return undefined;
      const found = current.find((item) => itemMatchesSeg(item, seg));
      if (found === undefined) return undefined;
      current = found;
    }
  }

  return current;
}

// ── setAtPath ──────────────────────────────────────────────────────────────

/**
 * Deep clone doc and set value at the given path.
 * Creates intermediate mappings for missing key segments.
 * Throws if navigation encounters a type mismatch.
 * Empty path replaces the entire doc.
 */
export function setAtPath(doc: YValue, path: string, value: YValue): YValue {
  const segments = parsePath(path);
  if (segments.length === 0) return deepClone(value);

  const cloned = deepClone(doc);
  _setRecursive(cloned, segments, 0, value);
  return cloned;
}

function _setRecursive(current: YValue, segments: PathSegment[], idx: number, value: YValue): void {
  const seg = segments[idx];
  const isLast = idx === segments.length - 1;

  if (seg.type === 'key') {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      throw new Error(`Cannot set key "${seg.value}" on non-mapping value`);
    }
    const map = current as { [key: string]: YValue };
    if (isLast) {
      map[seg.value] = deepClone(value);
    } else {
      // Create intermediate mapping if key is absent
      if (!(seg.value in map)) {
        map[seg.value] = {};
      } else if (map[seg.value] === null || typeof map[seg.value] !== 'object') {
        // Scalar or null intermediate — refuse to silently overwrite
        throw new Error(`Cannot traverse through non-mapping value at "${seg.value}"`);
      }
      _setRecursive(map[seg.value], segments, idx + 1, value);
    }
  } else if (seg.type === 'index') {
    if (!Array.isArray(current)) {
      throw new Error(`Cannot use index [${seg.value}] on non-array value`);
    }
    if (isLast) {
      current[seg.value] = deepClone(value);
    } else {
      _setRecursive(current[seg.value], segments, idx + 1, value);
    }
  } else {
    // match
    if (!Array.isArray(current)) {
      throw new Error(`Cannot use key-match on non-array value`);
    }
    const matchIdx = current.findIndex((item) => itemMatchesSeg(item, seg));
    if (matchIdx === -1) {
      throw new Error(`No item found where ${seg.key}=${seg.value}`);
    }
    if (isLast) {
      current[matchIdx] = deepClone(value);
    } else {
      _setRecursive(current[matchIdx], segments, idx + 1, value);
    }
  }
}

// ── deleteAtPath ───────────────────────────────────────────────────────────

/**
 * Deep clone doc and delete the value at the given path.
 * Returns false if the path doesn't exist.
 * For key segments: deletes the key from the mapping.
 * For index segments: splices the element from the array.
 */
export function deleteAtPath(doc: YValue, path: string): YValue | false {
  const segments = parsePath(path);
  if (segments.length === 0) return false;

  // Verify the path exists before cloning and deleting
  if (resolvePath(doc, path) === undefined) {
    // Special case: for a key segment at the top level, check if it actually exists
    // resolvePath returns undefined for missing keys, but we want to be precise:
    // A delete on a missing key should return false.
    return false;
  }

  const cloned = deepClone(doc);
  const deleted = _deleteRecursive(cloned, segments, 0);
  if (!deleted) return false;
  return cloned;
}

function _deleteRecursive(current: YValue, segments: PathSegment[], idx: number): boolean {
  const seg = segments[idx];
  const isLast = idx === segments.length - 1;

  if (seg.type === 'key') {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return false;
    const map = current as { [key: string]: YValue };
    if (!(seg.value in map)) return false;
    if (isLast) {
      delete map[seg.value];
      return true;
    }
    return _deleteRecursive(map[seg.value], segments, idx + 1);
  } else if (seg.type === 'index') {
    if (!Array.isArray(current)) return false;
    if (seg.value < 0 || seg.value >= current.length) return false;
    if (isLast) {
      current.splice(seg.value, 1);
      return true;
    }
    return _deleteRecursive(current[seg.value], segments, idx + 1);
  } else {
    // match
    if (!Array.isArray(current)) return false;
    const matchIdx = current.findIndex((item) => itemMatchesSeg(item, seg));
    if (matchIdx === -1) return false;
    if (isLast) {
      current.splice(matchIdx, 1);
      return true;
    }
    return _deleteRecursive(current[matchIdx], segments, idx + 1);
  }
}
