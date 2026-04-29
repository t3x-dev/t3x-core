import { BranchLinearityError } from '@t3x-dev/storage';
import type { Context } from 'hono';
import { errorResponse } from './errors';

export function mapBranchLinearityError(c: Context, err: unknown) {
  if (err instanceof BranchLinearityError) {
    return errorResponse(c, err.code, err.message);
  }
  return null;
}
