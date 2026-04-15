import { YOPS_ERRORS, yopsError } from '../errors';
import { deepClone, parsePath, resolvePath } from '../paths';
import type { OpHandler } from '../registry';
import type { YValue } from '../types';

function defineRecursive(current: YValue, keys: string[], idx: number): void {
  if (idx >= keys.length) return;

  const map = current as { [key: string]: YValue };
  const key = keys[idx];

  if (idx === keys.length - 1) {
    map[key] = {};
  } else {
    if (
      !(key in map) ||
      map[key] === null ||
      typeof map[key] !== 'object' ||
      Array.isArray(map[key])
    ) {
      map[key] = {};
    }
    defineRecursive(map[key], keys, idx + 1);
  }
}

export const defineHandler: OpHandler = (doc, fields, index) => {
  const path = fields.path as string;

  if (resolvePath(doc, path) !== undefined) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.ALREADY_EXISTS, `Path "${path}" already exists`, index),
    };
  }

  const segments = parsePath(path);
  for (const seg of segments) {
    if (seg.type !== 'key') {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.INVALID_PATH,
          `define only supports key segments; got "${JSON.stringify(seg)}" in path "${path}"`,
          index
        ),
      };
    }
  }

  const cloned = deepClone(doc);
  defineRecursive(
    cloned,
    segments.map((s) => (s as { type: 'key'; value: string }).value),
    0
  );
  return { doc: cloned };
};
