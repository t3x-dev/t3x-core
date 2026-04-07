import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { yopsValidateRoutes } from '../routes/yops-validate.openapi';

describe('POST /v1/yops/validate', () => {
  const app = new Hono();
  app.route('/', yopsValidateRoutes);

  it('returns preview for valid YOps', async () => {
    const res = await app.request(
      new Request('http://localhost/v1/yops/validate', {
        method: 'POST',
        body: JSON.stringify({
          trees: [{ key: 'trip', slots: { destination: 'Hangzhou' }, children: [], source: {} }],
          relations: [],
          yops: [{ set: { path: 'trip/destination', value: 'Tokyo' } }],
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.ok).toBe(true);
    expect(body.data.applied).toBe(1);
    expect(body.data.preview).toBeDefined();
  });

  it('returns error for invalid path', async () => {
    const res = await app.request(
      new Request('http://localhost/v1/yops/validate', {
        method: 'POST',
        body: JSON.stringify({
          trees: [{ key: 'trip', slots: {}, children: [], source: {} }],
          relations: [],
          yops: [{ set: { path: 'trip/nonexistent/deep', value: 'x' } }],
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ok).toBe(false);
    expect(body.data.error.code).toBeDefined();
    expect(body.data.error.op_index).toBe(0);
  });

  it('returns 400 for empty yops array', async () => {
    const res = await app.request(
      new Request('http://localhost/v1/yops/validate', {
        method: 'POST',
        body: JSON.stringify({
          trees: [{ key: 'trip', slots: {}, children: [], source: {} }],
          relations: [],
          yops: [],
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
  });
});
