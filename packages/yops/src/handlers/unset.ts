import { deepClone, deleteAtPath, parsePath, resolvePath } from '../paths';
import { YOPS_ERRORS, yopsError } from '../errors';
import type { OpHandler } from '../registry';

export const unsetHandler: OpHandler = (doc, fields, index) => {
  const path = fields.path as string;
  const segments = parsePath(path);
  const lastSegment = segments[segments.length - 1];

  if (!lastSegment || lastSegment.type !== 'key') {
    return {
      doc,
      error: yopsError(
        YOPS_ERRORS.NOT_A_MAPPING,
        `unset only supports removing mapping keys, got path "${path}"`,
        index
      ),
    };
  }

  const parentPath = segments
    .slice(0, -1)
    .map((segment) => {
      if (segment.type === 'key') return segment.value;
      if (segment.type === 'index') return `[${segment.value}]`;
      return `[${segment.key}=${segment.value}]`;
    })
    .join('/');

  const parent = parentPath === '' ? doc : resolvePath(doc, parentPath);
  if (parent !== undefined && (parent === null || typeof parent !== 'object' || Array.isArray(parent))) {
    return {
      doc,
      error: yopsError(
        YOPS_ERRORS.NOT_A_MAPPING,
        `Parent path "${parentPath || '<root>'}" is not a mapping`,
        index
      ),
    };
  }

  const result = deleteAtPath(doc, path);
  if (result === false) {
    // Idempotent — missing key is not an error
    return { doc: deepClone(doc) };
  }

  return { doc: result };
};
