import { BranchLinearityError, CommitParentIntegrityError } from '@t3x-dev/storage';
import type { Context } from 'hono';
import { errorResponse } from './errors';

export function mapBranchLinearityError(c: Context, err: unknown) {
  if (err instanceof BranchLinearityError) {
    return errorResponse(c, err.code, err.message);
  }
  if (err instanceof CommitParentIntegrityError) {
    return errorResponse(
      c,
      err.code === 'PARENT_NOT_FOUND' ? 'PARENT_NOT_FOUND' : 'INVALID_REQUEST',
      err.message
    );
  }
  return null;
}
