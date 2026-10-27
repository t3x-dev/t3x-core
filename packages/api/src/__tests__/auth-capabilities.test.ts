import { Hono } from 'hono';
import { afterEach, expect, it, vi } from 'vitest';
import { authMeRoutes } from '../routes/auth-me.openapi';

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => {
    throw new Error('Identity discovery must not load credentials');
  }),
}));
afterEach(() => vi.unstubAllEnvs());
function appFor(principal?: { id: string; user_id: string | null; principal_kind: string }) {
  const app = new Hono<{ Variables: { apiKey: unknown } }>();
  app.use('*', async (c, next) => {
    if (principal) c.set('apiKey', principal);
    await next();
  });
  app.route('/', authMeRoutes);
  return app;
}
it.each([
  ['human', 'owner', false],
  ['human', 'operator', true],
  ['agent', 'operator', false],
  ['service', 'operator', false],
])('derives %s %s permissions with the backend operator policy', async (kind, user, allowed) => {
  vi.stubEnv('AUTH_DISABLED', 'false');
  vi.stubEnv('T3X_OPERATOR_USER_IDS', 'operator');
  vi.stubEnv('T3X_OPERATOR_KEY_IDS', '');
  const res = await appFor({
    id: 'key',
    user_id: String(user),
    principal_kind: String(kind),
  }).request('/v1/auth/me/capabilities');
  expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  expect(await res.json()).toEqual({ success: true, data: { operator: allowed } });
});
it('uses the deliberate auth-disabled local rule without requiring a user profile', async () => {
  vi.stubEnv('AUTH_DISABLED', 'true');
  vi.stubEnv('NODE_ENV', 'test');
  const res = await appFor().request('/v1/auth/me/capabilities');
  expect((await res.json()).data.operator).toBe(true);
});
it('does not allow an unidentified request when authentication is enabled', async () => {
  vi.stubEnv('AUTH_DISABLED', 'false');
  const res = await appFor().request('/v1/auth/me/capabilities');
  expect((await res.json()).data.operator).toBe(false);
});
