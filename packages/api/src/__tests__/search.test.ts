import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { searchRoutes } from '../routes/search.openapi';

describe('Search Route', () => {
  const app = new Hono();
  app.route('/', searchRoutes);

  it('returns 501 until tree-based search is implemented', async () => {
    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: 'proj_1',
        query: 'refund policy',
        mode: 'hybrid',
      }),
    });

    expect(res.status).toBe(501);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Search is pending tree-based implementation.',
      },
    });
  });
});
