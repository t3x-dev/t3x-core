import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { getAuthorFromContext } from '../lib/auth';

/**
 * Creates a minimal Hono app that extracts author from request context
 * and returns it as JSON, allowing us to test getAuthorFromContext
 * with real HTTP request headers.
 */
function createTestApp() {
  const app = new Hono();
  app.get('/author', async (c) => {
    const author = await getAuthorFromContext(c);
    return c.json(author);
  });
  return app;
}

describe('getAuthorFromContext', () => {
  const app = createTestApp();

  it('returns verified author when both headers are present', async () => {
    const res = await app.request('/author', {
      headers: {
        'X-User-Name': 'Alice',
        'X-User-Email': 'alice@example.com',
      },
    });

    const author = await res.json();
    expect(author).toEqual({
      name: 'Alice',
      identity: 'email:alice@example.com',
      verification: 'verified',
    });
  });

  it('returns local author when no headers are present', async () => {
    const res = await app.request('/author');

    const author = await res.json();
    expect(author.verification).toBe('none');
    expect(author.identity).toMatch(/^local:/);
    expect(author.name).toBeDefined();
  });

  it('returns local author when only X-User-Name is present', async () => {
    const res = await app.request('/author', {
      headers: {
        'X-User-Name': 'Bob',
      },
    });

    const author = await res.json();
    expect(author.verification).toBe('none');
    expect(author.identity).toMatch(/^local:/);
  });

  it('returns local author when only X-User-Email is present', async () => {
    const res = await app.request('/author', {
      headers: {
        'X-User-Email': 'bob@example.com',
      },
    });

    const author = await res.json();
    expect(author.verification).toBe('none');
    expect(author.identity).toMatch(/^local:/);
  });

  it('uses exact header values for verified author', async () => {
    const res = await app.request('/author', {
      headers: {
        'X-User-Name': 'Jane Doe',
        'X-User-Email': 'jane.doe@company.org',
      },
    });

    const author = await res.json();
    expect(author.name).toBe('Jane Doe');
    expect(author.identity).toBe('email:jane.doe@company.org');
  });
});
