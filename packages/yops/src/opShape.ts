/**
 * @yops-dev/core — Op shape helpers
 *
 * Shared between the engine and the classifier so they cannot disagree on
 * what counts as the operation key on an op object. The op key is the
 * first non-metadata key on the outer object; metadata keys (`source`)
 * are decorations that may appear in any position depending on how the
 * YAML emitter orders them.
 */

export const OP_METADATA_KEYS = new Set(['source']);

/**
 * Returns true iff `value` is a non-null, non-array plain object — the
 * only shape that can carry an operation. Used as a defensive boundary
 * check at the top of the engine loop so malformed `parseYOpsYaml`
 * output (a literal `null` op, a YAML scalar where a mapping was
 * expected, an array used in place of a mapping) yields a clean
 * INVALID_OP rather than a TypeError.
 */
export function isMappingObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Resolve the operation name on an op object: the first key that is not
 * a known metadata key. Accepts `unknown` and returns `null` when the
 * input isn't a mapping object so callers can treat malformed input as
 * a typed error rather than a thrown exception.
 */
export function resolveOpName(op: unknown): string | null {
  if (!isMappingObject(op)) return null;
  for (const key of Object.keys(op)) {
    if (!OP_METADATA_KEYS.has(key)) return key;
  }
  return null;
}
