import { deepClone, deleteAtPath } from '../paths';
import type { OpHandler } from '../registry';

export const unsetHandler: OpHandler = (doc, fields, _index) => {
  const path = fields.path as string;

  const result = deleteAtPath(doc, path);
  if (result === false) {
    // Idempotent — missing key is not an error
    return { doc: deepClone(doc) };
  }

  return { doc: result };
};
