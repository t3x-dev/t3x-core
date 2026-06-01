import http, { type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('pino', () => {
  const noop = () => {};
  const logger = { debug: noop, info: noop, warn: noop, error: noop, fatal: noop, trace: noop };
  return { default: () => logger };
});

const { app } = await import('../server.js');

interface JsonResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: unknown;
}

function getPort(server: Server): number {
  const address = server.address() as AddressInfo | null;
  if (!address || typeof address.port !== 'number') {
    throw new Error('Test server is not listening on a TCP port');
  }
  return address.port;
}

async function requestJson(
  server: Server,
  path: string,
  options?: { headers?: Record<string, string>; method?: string; body?: unknown }
): Promise<JsonResponse> {
  return await new Promise((resolve, reject) => {
    const rawBody = options?.body === undefined ? undefined : JSON.stringify(options.body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: getPort(server),
        path,
        method: options?.method ?? 'GET',
        headers: {
          ...options?.headers,
          ...(rawBody
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(rawBody) }
            : {}),
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: raw ? JSON.parse(raw) : null,
          });
        });
      }
    );

    req.on('error', reject);
    if (rawBody) {
      req.write(rawBody);
    }
    req.end();
  });
}

describe('runner server routes', () => {
  let server: Server;
  let originalFetch: typeof globalThis.fetch;
  const originalEnv = {
    RUNNER_ENABLE_DEBUG_ROUTES: process.env.RUNNER_ENABLE_DEBUG_ROUTES,
    RUNNER_DEBUG_TOKEN: process.env.RUNNER_DEBUG_TOKEN,
    N8N_API_KEY: process.env.N8N_API_KEY,
  };

  beforeAll(async () => {
    originalFetch = globalThis.fetch;
    server = await new Promise<Server>((resolve) => {
      const instance = app.listen(0, () => resolve(instance));
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.RUNNER_ENABLE_DEBUG_ROUTES = originalEnv.RUNNER_ENABLE_DEBUG_ROUTES;
    process.env.RUNNER_DEBUG_TOKEN = originalEnv.RUNNER_DEBUG_TOKEN;
    process.env.N8N_API_KEY = originalEnv.N8N_API_KEY;
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  it('GET /health returns ok and request id header', async () => {
    const res = await requestJson(server, '/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { status: 'ok', service: 't3x-runner' },
    });
    expect(res.headers['x-request-id']).toMatch(/^[a-f0-9]{12}$/);
  });

  it('GET / returns service metadata with docs link and hides debug routes by default', async () => {
    const res = await requestJson(server, '/');
    const body = res.body as {
      success: boolean;
      data: {
        service: string;
        docs: string;
        endpoints: Record<string, string | undefined>;
      };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.service).toBe('t3x-runner');
    expect(body.data.docs).toBe('https://github.com/t3x-dev/t3x-core/tree/main/apps/runner/docs');
    expect(body.data.endpoints.debug_n8n).toBeUndefined();
  });

  it('GET /ready returns ready when engine health succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const res = await requestJson(server, '/ready');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { status: 'ready', api: 'reachable' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('GET /ready returns 503 when engine health returns non-ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const res = await requestJson(server, '/ready');
    const body = res.body as {
      success: boolean;
      error: { code: string; message: string };
    };

    expect(res.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_READY');
    expect(body.error.message).toContain('503');
  });

  it('GET /ready returns 503 when engine health is unreachable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('boom'));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const res = await requestJson(server, '/ready');
    const body = res.body as {
      success: boolean;
      error: { code: string; message: string };
    };

    expect(res.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_READY');
    expect(body.error.message).toContain('boom');
  });

  it('GET /debug/n8n-check returns 404 when debug routes are disabled', async () => {
    const res = await requestJson(server, '/debug/n8n-check');
    const body = res.body as { error: { code: string } };

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('GET / exposes debug route and returns NO_API_KEY when enabled on localhost', async () => {
    process.env.RUNNER_ENABLE_DEBUG_ROUTES = 'true';
    delete process.env.N8N_API_KEY;

    const rootRes = await requestJson(server, '/');
    const res = await requestJson(server, '/debug/n8n-check');
    const rootBody = rootRes.body as {
      data: { endpoints: Record<string, string | undefined> };
    };
    const body = res.body as {
      success: boolean;
      error: { code: string };
    };

    expect(rootBody.data.endpoints.debug_n8n).toBe('GET /debug/n8n-check');
    expect(res.status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NO_API_KEY');
  });

  it('GET /debug/n8n-check requires bearer auth when exposed off localhost', async () => {
    process.env.RUNNER_ENABLE_DEBUG_ROUTES = 'true';
    process.env.RUNNER_DEBUG_TOKEN = 'debug-secret';

    const res = await requestJson(server, '/debug/n8n-check', {
      headers: { Host: 'runner.example.com' },
    });
    const body = res.body as { error: { code: string } };

    expect(res.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /debug/n8n-check fails closed when exposed off localhost without a configured token', async () => {
    process.env.RUNNER_ENABLE_DEBUG_ROUTES = 'true';
    delete process.env.RUNNER_DEBUG_TOKEN;

    const res = await requestJson(server, '/debug/n8n-check', {
      headers: { Host: 'runner.example.com' },
    });
    const body = res.body as { error: { code: string } };

    expect(res.status).toBe(503);
    expect(body.error.code).toBe('DEBUG_AUTH_NOT_CONFIGURED');
  });

  it('POST /webhook/run executes a registered agent and returns an eval result', async () => {
    const registerRes = await requestJson(server, '/agents', {
      method: 'POST',
      body: {
        id: 'webhook-agent',
        name: 'Webhook Agent',
        endpoint: 'http://agent.example/run',
        type: 'http',
      },
    });
    expect(registerRes.status).toBe(200);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ answer: 'ok' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const res = await requestJson(server, '/webhook/run', {
      method: 'POST',
      body: {
        agent_id: 'webhook-agent',
        input: { prompt: 'hello' },
        auto_eval: true,
      },
    });
    const body = res.body as {
      success: boolean;
      data: {
        run_id: string;
        output: unknown;
        trace: { status: string };
        eval_result: unknown;
      };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.run_id).toMatch(/^run_/);
    expect(body.data.output).toEqual({ answer: 'ok' });
    expect(body.data.trace.status).toBe('completed');
    expect(body.data.eval_result).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://agent.example/run',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prompt: 'hello' }),
      })
    );
  });

  it('POST /run fails the trace when the registered agent returns a non-2xx response', async () => {
    const registerRes = await requestJson(server, '/agents', {
      method: 'POST',
      body: {
        id: 'failing-proxy-agent',
        name: 'Failing Proxy Agent',
        endpoint: 'http://agent.example/fail',
        type: 'http',
      },
    });
    expect(registerRes.status).toBe(200);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => ({ error: 'upstream failed' }),
    }) as unknown as typeof globalThis.fetch;

    const res = await requestJson(server, '/run', {
      method: 'POST',
      body: {
        agent_id: 'failing-proxy-agent',
        input: { prompt: 'hello' },
      },
    });
    const body = res.body as {
      success: boolean;
      error: { code: string; message: string };
      data: { record: { status: string; error: { message: string } } };
    };

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('RUN_FAILED');
    expect(body.error.message).toContain('Agent request failed with 502');
    expect(body.data.record.status).toBe('failed');
    expect(body.data.record.error.message).toContain('Agent request failed with 502');
  });

  it('POST /webhook/run fails the trace when the registered agent returns a non-2xx response', async () => {
    const registerRes = await requestJson(server, '/agents', {
      method: 'POST',
      body: {
        id: 'failing-webhook-agent',
        name: 'Failing Webhook Agent',
        endpoint: 'http://agent.example/fail-webhook',
        type: 'http',
      },
    });
    expect(registerRes.status).toBe(200);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({ error: 'agent unavailable' }),
    }) as unknown as typeof globalThis.fetch;

    const res = await requestJson(server, '/webhook/run', {
      method: 'POST',
      body: {
        agent_id: 'failing-webhook-agent',
        input: { prompt: 'hello' },
        auto_eval: true,
      },
    });
    const body = res.body as {
      success: boolean;
      error: { code: string; message: string };
      data: { trace: { status: string; error: { message: string } }; eval_result: unknown };
    };

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('RUN_FAILED');
    expect(body.error.message).toContain('Agent request failed with 503');
    expect(body.data.trace.status).toBe('failed');
    expect(body.data.trace.error.message).toContain('Agent request failed with 503');
    expect(body.data.eval_result).toBeNull();
  });
});
