/**
 * Health Route Tests
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { healthRoutes } from '../routes/health';

describe('Health Route', () => {
  const app = new Hono();
  app.route('/', healthRoutes);

  it('GET /health returns success', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('ok');
    expect(data.data.version).toBe('1.0.0');
    expect(typeof data.data.uptime).toBe('number');
  });
});
