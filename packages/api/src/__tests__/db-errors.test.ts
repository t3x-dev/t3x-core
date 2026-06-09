import { describe, expect, it } from 'vitest';
import { hasDbErrorCode } from '../lib/db-errors';

describe('hasDbErrorCode', () => {
  it('finds a direct database error code', () => {
    expect(hasDbErrorCode({ code: '23505' }, '23505')).toBe(true);
  });

  it('finds a database error code wrapped in a cause chain', () => {
    const err = new Error('wrapped', {
      cause: new Error('inner', {
        cause: { code: '23503' },
      }),
    });

    expect(hasDbErrorCode(err, '23503')).toBe(true);
  });

  it('returns false when the code is missing', () => {
    expect(hasDbErrorCode(new Error('missing'), '23505')).toBe(false);
  });

  it('handles cyclic cause chains', () => {
    const err: { cause?: unknown } = {};
    err.cause = err;

    expect(hasDbErrorCode(err, '23505')).toBe(false);
  });
});
