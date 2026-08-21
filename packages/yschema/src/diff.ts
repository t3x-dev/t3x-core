import type { YSchema } from './p0';

export type YSchemaContractChangeKind = 'ADD' | 'CHANGE' | 'REMOVE';

export interface YSchemaContractChange {
  kind: YSchemaContractChangeKind;
  path: string;
  summary: string;
}

const IGNORED_ROOT_KEYS = new Set(['description', 'name', 'version']);

/** Compare two normalized Schemas without treating release metadata as contract changes. */
export function diffYSchemas(base: YSchema, target: YSchema): YSchemaContractChange[] {
  const changes: YSchemaContractChange[] = [];
  compareValues(base, target, '', changes);
  return changes;
}

function compareValues(
  base: unknown,
  target: unknown,
  path: string,
  changes: YSchemaContractChange[]
): void {
  if (path === '' && isRecord(base) && isRecord(target)) {
    const keys = Array.from(new Set([...Object.keys(base), ...Object.keys(target)]))
      .filter((key) => !IGNORED_ROOT_KEYS.has(key))
      .sort();
    for (const key of keys) compareProperty(base, target, key, key, changes);
    return;
  }

  if (isRecord(base) && isRecord(target)) {
    const keys = Array.from(new Set([...Object.keys(base), ...Object.keys(target)])).sort();
    for (const key of keys) compareProperty(base, target, key, `${path}.${key}`, changes);
    return;
  }

  if (!valuesEqual(base, target)) {
    changes.push({ kind: 'CHANGE', path, summary: 'Contract value changed.' });
  }
}

function compareProperty(
  base: Record<string, unknown>,
  target: Record<string, unknown>,
  key: string,
  path: string,
  changes: YSchemaContractChange[]
): void {
  if (!(key in base)) {
    changes.push({ kind: 'ADD', path, summary: 'Contract path added.' });
    return;
  }
  if (!(key in target)) {
    changes.push({ kind: 'REMOVE', path, summary: 'Contract path removed.' });
    return;
  }
  compareValues(base[key], target[key], path, changes);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
