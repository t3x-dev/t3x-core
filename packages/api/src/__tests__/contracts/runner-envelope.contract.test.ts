import { Hono } from 'hono';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { assertProjectAccessMock, getDBMock } = vi.hoisted(() => ({
  assertProjectAccessMock: vi.fn(),
  getDBMock: vi.fn(),
}));

vi.mock('../../lib/db', () => ({ getDB: getDBMock }));
vi.mock('../../lib/project-access', () => ({ assertProjectAccess: assertProjectAccessMock }));

const originalRunnerServiceToken = process.env.RUNNER_SERVICE_TOKEN;
const originalFetch = globalThis.fetch;
const { runnerRoutes } = await import('../../routes/runner.openapi');

describe('Runner API response envelope', () => {
  const app = new Hono();
  app.route('/', runnerRoutes);

  beforeEach(() => {
    process.env.RUNNER_SERVICE_TOKEN = 'runner-proxy-test-secret';
    getDBMock.mockResolvedValue({});
    assertProjectAccessMock.mockResolvedValue({ id: 'project-a' });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ success: true, data: { agent_id: 'agent_envelope_test' } })
      ) as typeof globalThis.fetch;
  });

  afterEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = originalFetch;
  });

  afterAll(() => {
    if (originalRunnerServiceToken === undefined) delete process.env.RUNNER_SERVICE_TOKEN;
    else process.env.RUNNER_SERVICE_TOKEN = originalRunnerServiceToken;
  });

  it('authorizes the project and proxies agent registration with service auth', async () => {
    const res = await app.request('/runner/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: 'project-a',
        id: 'agent_envelope_test',
        name: 'Envelope Test Agent',
        endpoint: 'https://93.184.216.34/run',
        type: 'http',
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { agent_id: 'agent_envelope_test' },
    });
    expect(assertProjectAccessMock).toHaveBeenCalledWith(expect.anything(), {}, 'project-a');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://t3x-runner:8080/agents',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer runner-proxy-test-secret',
        }),
        body: expect.stringContaining('"project_id":"project-a"'),
      })
    );
  });

  it('returns structured errors for requests without project scope', async () => {
    const res = await app.request('/runner/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'missing_required_fields' }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not contact Runner when project authorization fails', async () => {
    assertProjectAccessMock.mockResolvedValue(
      Response.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
        { status: 403 }
      )
    );

    const res = await app.request('/runner/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: 'project-b',
        id: 'foreign-agent',
        name: 'Foreign Agent',
        endpoint: 'https://93.184.216.34/run',
        type: 'http',
      }),
    });

    expect(res.status).toBe(403);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
