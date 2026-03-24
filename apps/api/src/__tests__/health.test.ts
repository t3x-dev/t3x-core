/**
 * Health Route Tests
 */

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { healthRoutes } from '../routes/health';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

describe('Health Route', () => {
  const app = new Hono();
  app.route('/', healthRoutes);

  it('GET /health returns success', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('ok');
    expect(data.data.version).toBe('1.0.0');
    expect(typeof data.data.uptime).toBe('number');
  });
});
