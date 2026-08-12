import type { ApiKey } from '@t3x-dev/core';
import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';
import { hasOperatorAccess } from '../lib/operator-access';

function contextFor(apiKey?: Partial<ApiKey>): Context {
  const complete = apiKey
    ? ({
        id: 'ak_member',
        user_id: 'user_member',
        project_id: null,
        principal_kind: 'human',
        transition_scopes: [],
        ...apiKey,
      } as ApiKey)
    : undefined;
  return { get: () => complete } as unknown as Context;
}

describe('operator access', () => {
  it('fails closed for ordinary human and missing principals', () => {
    expect(hasOperatorAccess(contextFor(), {})).toBe(false);
    expect(hasOperatorAccess(contextFor({ principal_kind: 'human' }), {})).toBe(false);
  });

  it('accepts explicitly configured human user and key identifiers', () => {
    expect(
      hasOperatorAccess(contextFor({}), { T3X_OPERATOR_USER_IDS: 'user_other, user_member' })
    ).toBe(true);
    expect(hasOperatorAccess(contextFor({}), { T3X_OPERATOR_KEY_IDS: 'ak_other, ak_member' })).toBe(
      true
    );
  });

  it('never grants operator access to machine principals', () => {
    expect(
      hasOperatorAccess(contextFor({ principal_kind: 'service' }), {
        T3X_OPERATOR_KEY_IDS: 'ak_member',
        T3X_OPERATOR_USER_IDS: 'user_member',
      })
    ).toBe(false);
  });

  it('preserves local auth-disabled development while production remains fail closed', () => {
    expect(
      hasOperatorAccess(contextFor({}), { AUTH_DISABLED: 'true', NODE_ENV: 'development' })
    ).toBe(true);
    expect(
      hasOperatorAccess(contextFor({}), { AUTH_DISABLED: 'true', NODE_ENV: 'production' })
    ).toBe(false);
    expect(
      hasOperatorAccess(contextFor({}), {
        AUTH_DISABLED: 'true',
        NODE_ENV: 'production',
        T3X_ALLOW_AUTH_DISABLED_IN_PRODUCTION: 'true',
      })
    ).toBe(true);
  });
});
