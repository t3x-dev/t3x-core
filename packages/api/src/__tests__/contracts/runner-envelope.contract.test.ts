import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { runnerRoutes } from '../../routes/runner.openapi';

describe('Runner API response envelope', () => {
  const app = new Hono();
  app.route('/', runnerRoutes);

  it('wraps registered agent ids in data', async () => {
    const res = await app.request('/runner/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'agent_envelope_test',
        name: 'Envelope Test Agent',
        endpoint: 'https://93.184.216.34/run',
        type: 'http',
      }),
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: { agent_id: 'agent_envelope_test' },
    });
    expect(body).not.toHaveProperty('agent_id');
  });

  it('returns structured errors for invalid runner requests', async () => {
    const res = await app.request('/runner/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'missing_required_fields' }),
    });

    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toEqual({
      code: 'INVALID_REQUEST',
      message: expect.any(String),
    });
  });

  it('rejects private runner endpoints by default', async () => {
    const originalAllowlist = process.env.RUNNER_ENDPOINT_ALLOWLIST;
    delete process.env.RUNNER_ENDPOINT_ALLOWLIST;
    try {
      const res = await app.request('/runner/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'metadata_target',
          name: 'Metadata Target',
          endpoint: 'http://169.254.169.254/latest/meta-data',
          type: 'http',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toMatchObject({
        success: false,
        error: { code: 'INVALID_REQUEST' },
      });
    } finally {
      if (originalAllowlist === undefined) delete process.env.RUNNER_ENDPOINT_ALLOWLIST;
      else process.env.RUNNER_ENDPOINT_ALLOWLIST = originalAllowlist;
    }
  });
});
