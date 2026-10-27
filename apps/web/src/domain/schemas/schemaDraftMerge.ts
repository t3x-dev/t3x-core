import { type SchemaDefinition, schemaRecord } from './schemaFieldEditing';

export type SchemaMergeConflict = { path: string; current: unknown; incoming: unknown };
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function equal(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return left.length === right.length && left.every((value, index) => equal(value, right[index]));
  return (
    object(left) &&
    object(right) &&
    Object.keys(left).length === Object.keys(right).length &&
    Object.keys(left).every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]))
  );
}
/** Three-way merge: preserve local edits, and require a decision for overlapping changes. */
export function mergeSchemaDraft(
  base: SchemaDefinition,
  current: SchemaDefinition,
  incoming: SchemaDefinition,
  choices: Record<string, 'current' | 'incoming'> = {}
) {
  const conflicts: SchemaMergeConflict[] = [];
  function merge(before: unknown, local: unknown, next: unknown, path: string): unknown {
    if (equal(local, before)) return next;
    if (equal(next, before) || equal(local, next)) return local;
    if (object(local) && object(next) && (object(before) || before === undefined)) {
      const previous = schemaRecord(before);
      return Object.fromEntries(
        [
          ...new Set([...Object.keys(previous), ...Object.keys(local), ...Object.keys(next)]),
        ].flatMap((key) => {
          const result = merge(previous[key], local[key], next[key], `${path}/${key}`);
          return result === undefined ? [] : [[key, result]];
        })
      );
    }
    if (choices[path]) return choices[path] === 'current' ? local : next;
    conflicts.push({ path, current: local, incoming: next });
    return local;
  }
  const definition = structuredClone(incoming);
  for (const key of ['nodes', 'relationTypes', 'rules']) {
    const result = merge(base[key], current[key], incoming[key], key);
    if (result === undefined) delete definition[key];
    else definition[key] = result;
  }
  return { definition, conflicts };
}
