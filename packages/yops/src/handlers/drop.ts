import { YOPS_ERRORS, yopsError } from '../errors';
import { deleteAtPath } from '../paths';
import type { OpHandler } from '../registry';

export const dropHandler: OpHandler = (doc, fields, index) => {
  const path = fields.path as string;

  const result = deleteAtPath(doc, path);
  if (result === false) {
    return {
      doc,
      error: yopsError(YOPS_ERRORS.PATH_NOT_FOUND, `Path "${path}" does not exist`, index),
    };
  }

  return { doc: result };
};
