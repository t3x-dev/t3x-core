/**
 * @yops-dev/core — Path Parser
 *
 * Addresses any node in a YAML document using a slash-separated path string.
 *
 * Segment types:
 *   key   — mapping key: `config/database/host`
 *   index — array index: `items/[0]`
 *   match — array key match: `users/[name=alice]/role`
 *
 * Quoted-segment escape (proposal A′ from #930): a segment that starts
 * with `"` is read as a quoted key. Inside the quotes, `\"` is a literal
 * double quote and `\\` is a literal backslash; every other character
 * (including `/`, `[`, `]`, `=`) is itself. This lets paths address keys
 * that contain reserved characters without forking the wire format —
 * `config/"db/prod"/host` resolves to the key `db/prod` under `config`.
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

/** Per-segment classification used after a path has been split on `/`. */
function classifyRawSegment(raw: string): PathSegment {
  // Array index: [n]
  const indexMatch = raw.match(/^\[(\d+)\]$/);
  if (indexMatch) {
    return { type: 'index', value: parseInt(indexMatch[1], 10) };
  }

  // Key match: [key=value]
  const matchMatch = raw.match(/^\[([^=\]]+)=([^\]]*)\]$/);
  if (matchMatch) {
    return { type: 'match', key: matchMatch[1], value: matchMatch[2] };
  }

  // Plain mapping key
  return { type: 'key', value: raw };
}

/**
 * Result type for the strict parser. Used by the validator (which surfaces
 * `YOPS_PATH_UNCLOSED_QUOTE` and `YOPS_PATH_INVALID_ESCAPE` diagnostics)
 * when callers need to know about parse-level errors. `parsePath` itself
 * stays permissive — it's used by handlers that already accept whatever
 * shape the user gave them.
 */
export type ParsePathResult =
  | { ok: true; segments: PathSegment[] }
  | {
      ok: false;
      code: 'UNCLOSED_QUOTE' | 'INVALID_ESCAPE';
      message: string;
      offset: number;
    };

/**
 * Strict parse: returns segments on success or a typed error on quoted-segment
 * malformation. Existing callers should keep using `parsePath` (which is
 * permissive); this is the entry point the validator builds on.
 */
export function tryParsePath(path: string): ParsePathResult {
  if (path === '') return { ok: true, segments: [] };

  const segments: PathSegment[] = [];
  let i = 0;

  while (i <= path.length) {
    if (i === path.length) {
      // Trailing `/` produces an empty final segment, matching today's
      // `path.split('/')` behaviour.
      segments.push({ type: 'key', value: '' });
      break;
    }

    if (path[i] === '"') {
      // Quoted segment. Read until the closing `"`, decoding escapes.
      const start = i;
      i++; // skip opening quote
      let value = '';
      let closed = false;
      while (i < path.length) {
        const c = path[i];
        if (c === '\\') {
          if (i + 1 >= path.length) {
            return {
              ok: false,
              code: 'INVALID_ESCAPE',
              message: `Trailing backslash inside quoted segment starting at offset ${start}`,
              offset: i,
            };
          }
          const next = path[i + 1];
          if (next === '"' || next === '\\') {
            value += next;
            i += 2;
            continue;
          }
          return {
            ok: false,
            code: 'INVALID_ESCAPE',
            message: `Invalid escape sequence "\\${next}" inside quoted segment starting at offset ${start}; only \\" and \\\\ are allowed`,
            offset: i,
          };
        }
        if (c === '"') {
          closed = true;
          i++; // consume closing quote
          break;
        }
        value += c;
        i++;
      }
      if (!closed) {
        return {
          ok: false,
          code: 'UNCLOSED_QUOTE',
          message: `Unclosed quoted segment starting at offset ${start}`,
          offset: start,
        };
      }
      segments.push({ type: 'key', value });
    } else {
      // Plain segment: read until next `/` (no quote-tracking — `"` mid-
      // segment is treated as a literal in today's behaviour and we
      // preserve that for backwards compat).
      const start = i;
      while (i < path.length && path[i] !== '/') i++;
      segments.push(classifyRawSegment(path.slice(start, i)));
    }

    // Expect `/` separator or end of input.
    if (i < path.length) {
      if (path[i] !== '/') {
        // Quoted segment followed by non-slash garbage (e.g. `"foo"bar/...`).
        // For now, treat as a plain segment continuation: read the trailing
        // chars and concat. This preserves a permissive surface; the
        // validator can warn on it later if needed.
        const start = i;
        while (i < path.length && path[i] !== '/') i++;
        const trailing = path.slice(start, i);
        const last = segments.pop();
        if (last && last.type === 'key') {
          segments.push({ type: 'key', value: last.value + trailing });
        } else {
          // Index/match followed by garbage — push as key concat for now.
          segments.push({ type: 'key', value: trailing });
        }
      }
      if (i < path.length && path[i] === '/') i++;
    } else {
      break;
    }
  }

  return { ok: true, segments };
}

/**
 * Parse a path string into an array of PathSegments.
 *
 * Permissive: invalid quoted-segment shapes fall back to the legacy
 * `path.split('/')` behaviour so existing callers see no change for any
 * path that doesn't use the new escape syntax. Callers that need to
 * detect parse errors (the validator) should use `tryParsePath` instead.
 */
export function parsePath(path: string): PathSegment[] {
  const result = tryParsePath(path);
  if (result.ok) return result.segments;

  // Fallback: replicate the legacy split-on-slash behaviour for paths
  // whose quoted segments are malformed. The strict parser surfaces the
  // error via `tryParsePath`; this entry point stays lenient so handlers
  // that today accept these inputs continue to.
  if (path === '') return [];
  return path.split('/').map(classifyRawSegment);
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
