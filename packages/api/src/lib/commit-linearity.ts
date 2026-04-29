import { MainBranchLinearityError } from '@t3x-dev/storage';
import type { Context } from 'hono';
import { errorResponse } from './errors';

export function mapMainBranchLinearityError(c: Context, err: unknown) {
  if (err instanceof MainBranchLinearityError) {
    return errorResponse(c, err.code, err.message);
  }
  return null;
}
