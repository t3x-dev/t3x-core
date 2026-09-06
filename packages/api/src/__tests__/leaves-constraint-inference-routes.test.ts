import { Hono } from 'hono';
import { expect, it, vi } from 'vitest';

const getDB = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('Retired writers must not open storage');
  })
);
vi.mock('../lib/db', () => ({ getDB }));

import { leavesRoutes } from '../routes/leaves.openapi';

const app = new Hono();
app.route('/', leavesRoutes);
it.each([
  ['POST', '/v1/leaves'],
  ['PATCH', '/v1/leaves/archived'],
  ['DELETE', '/v1/leaves/archived'],
  ['POST', '/v1/leaves/archived/generate'],
  ['POST', '/v1/leaves/archived/validate'],
  ['POST', '/v1/commits/hash/leaves/batch'],
  ['POST', '/v1/leaves/archived/restore'],
  ['DELETE', '/v1/leaf-history/history'],
  ['POST', '/v1/leaves/archived/suggest-constraints'],
  ['POST', '/v1/leaves/archived/learn-from-edits'],
  ['POST', '/v1/leaves/archived/reverse-learn'],
  ['POST', '/v1/leaves/archived/compare'],
])('retires %s %s before reading storage or starting inference', async (method, path) => {
  const response = await app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ output: 'overwrite', provider: 'must-not-run' }),
  });
  expect(response.status).toBe(410);
  expect((await response.json()).error).toMatchObject({
    code: 'LEAF_WRITER_RETIRED',
    message: expect.stringContaining('State or Commit'),
  });
  expect(getDB).not.toHaveBeenCalled();
});
