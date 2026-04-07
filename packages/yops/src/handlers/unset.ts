import type { OpHandler } from '../registry';
import { deleteAtPath, deepClone } from '../paths';

export const unsetHandler: OpHandler = (doc, fields, _index) => {
  const path = fields.path as string;

  const result = deleteAtPath(doc, path);
  if (result === false) {
    // Idempotent — missing key is not an error
    return { doc: deepClone(doc) };
  }

  return { doc: result };
};
