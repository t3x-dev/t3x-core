import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { getV4AuthorFromContext } from '../lib/auth';

// Mock dependencies
vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve({})),
}));

vi.mock('@t3x-dev/storage', () => ({
  findUserById: vi.fn(),
}));

/**
 * Creates a minimal Hono app that extracts V4 author from request context
 * and returns it as JSON.
 */
function createTestApp() {
  const app = new Hono();
  app.get('/author', async (c) => {
    const author = await getV4AuthorFromContext(c);
    return c.json(author);
  });
  app.get('/author-with-client', async (c) => {
    const author = await getV4AuthorFromContext(c, {
      type: 'human',
      name: 'Client User',
      id: 'client_123',
    });
    return c.json(author);
  });
  return app;
}

describe('getV4AuthorFromContext', () => {
  const app = createTestApp();

  it('returns default anonymous author when no auth and no client author', async () => {
    const res = await app.request('/author');

    const author = await res.json();
    expect(author).toEqual({
      type: 'human',
      name: 'Anonymous',
    });
  });

  it('returns client-supplied author when no auth context', async () => {
    const res = await app.request('/author-with-client');

    const author = await res.json();
    expect(author).toEqual({
      type: 'human',
      name: 'Client User',
      id: 'client_123',
    });
  });
});
