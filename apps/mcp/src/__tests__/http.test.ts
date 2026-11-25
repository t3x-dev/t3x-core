import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, request, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createInterface } from 'node:readline';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';

const credentials = new Map([
  ['fixture-first', 'proj_first'],
  ['fixture-second', 'proj_second'],
]);

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 't3x-http-test', version: '1.0.0' },
  },
};

const cleanup: Array<() => Promise<unknown>> = [];

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) {
    await close();
  }
});

function json(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

async function startFixture(publicUrl?: URL) {
  const active = new Map(credentials);
  const apiRequests: string[] = [];
  const pendingBranches: Array<() => void> = [];
  const stderr: string[] = [];
  let upstreamAvailable = true;
  const api = createServer((request, response) => {
    apiRequests.push(request.headers.authorization ?? '');
    if (!upstreamAvailable) {
      json(response, 503, { success: false, error: { code: 'UNAVAILABLE' } });
      return;
    }
    const token = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
    const project = active.get(token);
    if (!project) {
      json(response, 401, {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid fixture credential' },
      });
      return;
    }

    const url = new URL(request.url ?? '/', 'http://fixture.test');
    if (url.pathname === '/api/v1/auth/me/credential') {
      json(response, 200, {
        success: true,
        data: {
          actor_kind: 'agent',
          credential_kind: 'api_key',
          project_id: project,
          namespace_id: null,
          transition_scopes: [],
        },
      });
    } else if (
      url.pathname === '/api/v1/branches' &&
      url.searchParams.get('project_id') === project
    ) {
      // Hold the first request open until both principals are using the same MCP process.
      pendingBranches.push(() => {
        json(response, 200, { success: true, data: { branches: [{ name: project }] } });
      });
      if (pendingBranches.length === 2) {
        for (const finish of pendingBranches.splice(0)) finish();
      }
    } else {
      json(response, 403, {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Wrong fixture project' },
      });
    }
  });
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => {
    api.closeAllConnections();
    return new Promise<void>((resolve) => api.close(() => resolve()));
  });

  const child = spawn(process.execPath, ['dist/index.js'], {
    env: {
      PATH: process.env.PATH,
      HOST: '127.0.0.1',
      PORT: '0',
      T3X_TRANSPORT: 'http',
      T3X_MCP_BACKEND: 'api',
      T3X_MCP_CAPABILITIES: 'read-only',
      T3X_API_URL: `http://127.0.0.1:${(api.address() as AddressInfo).port}/api`,
      ...(publicUrl && { T3X_MCP_PUBLIC_URL: publicUrl.href }),
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  cleanup.push(() => stopChild(child));
  const endpoint = await new Promise<URL>((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('HTTP MCP startup timed out')), 5_000);
    child.once('error', reject);
    child.once('exit', (code) => {
      clearTimeout(deadline);
      reject(new Error(`HTTP MCP exited (${code ?? 'signal'}): ${stderr.join('\n')}`));
    });
    createInterface({ input: child.stderr }).on('line', (line) => {
      stderr.push(line);
      const url = /^T3X MCP HTTP listening on (http:\/\/127\.0\.0\.1:\d+\/mcp)$/.exec(line)?.[1];
      if (url) {
        clearTimeout(deadline);
        resolve(new URL(url));
      }
    });
  });
  return {
    endpoint,
    apiRequests,
    stderr,
    revoke: (token: string) => active.delete(token),
    failUpstream: () => {
      upstreamAvailable = false;
    },
  };
}

async function stopChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}

async function connect(endpoint: URL, token: string) {
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client(initialize.params.clientInfo);
  cleanup.push(() => client.close());
  await client.connect(transport, { timeout: 5_000 });
  return { client, transport };
}

function initializeStatus(endpoint: URL, headers: Record<string, string> = {}) {
  return new Promise<number | undefined>((resolve, reject) => {
    const req = request(
      endpoint,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      }
    );
    req.once('error', reject);
    req.setTimeout(5_000, () => req.destroy(new Error('MCP initialize request timed out')));
    req.end(JSON.stringify(initialize));
  });
}

describe('apps/mcp Streamable HTTP subprocess', () => {
  it('uses the caller credential on overlapping tool calls and rejects it immediately after revocation', async () => {
    const fixture = await startFixture();
    const first = await connect(fixture.endpoint, 'fixture-first');
    const second = await connect(fixture.endpoint, 'fixture-second');
    expect(first.transport.sessionId).toBeUndefined();
    expect(second.transport.sessionId).toBeUndefined();
    const tools = (await first.client.listTools()).tools.map(({ name }) => name);
    expect(tools).toContain('t3x_query');
    expect(tools).not.toContain('t3x_commit');

    const clients = [
      [first.client, 'proj_first'],
      [second.client, 'proj_second'],
    ] as const;
    await Promise.all(
      clients.map(async ([client, project]) => {
        const result = await client.callTool(
          { name: 't3x_query', arguments: { target: 'branches', project_id: project } },
          undefined,
          { timeout: 5_000 }
        );
        expect(result).toMatchObject({
          content: [{ type: 'text', text: JSON.stringify([{ name: project }], null, 2) }],
        });
      })
    );

    fixture.revoke('fixture-first');
    await expect(first.client.listTools()).rejects.toMatchObject({ code: 401 });
    await expect(second.client.listTools()).resolves.toMatchObject({ tools: expect.any(Array) });
    expect(fixture.stderr.join('\n')).not.toMatch(/fixture-first|fixture-second/);
  }, 15_000);

  it('checks host, origin and bearer before accepting a protocol request', async () => {
    const fixture = await startFixture();
    const { endpoint } = fixture;
    const valid = { Authorization: 'Bearer fixture-first' };
    const healthy = await fetch(new URL('/health', endpoint));
    expect(healthy.status).toBe(200);
    expect(await initializeStatus(endpoint)).toBe(401);
    expect(await initializeStatus(endpoint, { ...valid, Origin: 'https://other.example' })).toBe(
      403
    );
    expect(await initializeStatus(endpoint, { ...valid, Host: 'other.example' })).toBe(403);
    expect(fixture.apiRequests).toEqual([]);
    expect(await initializeStatus(endpoint, { Authorization: 'Bearer fixture-invalid' })).toBe(401);
    expect(await initializeStatus(endpoint, { ...valid, Origin: endpoint.origin })).toBe(200);
    for (const method of ['GET', 'DELETE']) {
      expect(
        await fetch(endpoint, { method, headers: { ...valid, Accept: 'text/event-stream' } })
      ).toMatchObject({ status: 405 });
    }
    fixture.failUpstream();
    expect(await initializeStatus(endpoint, valid)).toBeGreaterThanOrEqual(500);
  }, 15_000);

  it('accepts the configured public authority through a TLS-terminating proxy', async () => {
    const publicUrl = new URL('https://mcp.example.test:8443/mcp');
    const { endpoint, apiRequests } = await startFixture(publicUrl);
    expect(await fetch(new URL('/health', endpoint))).toMatchObject({ status: 200 });
    const valid = { Authorization: 'Bearer fixture-first' };
    expect(await initializeStatus(new URL('/other', endpoint), valid)).toBe(404);
    expect(await initializeStatus(endpoint, { ...valid, 'X-Forwarded-Host': publicUrl.host })).toBe(
      403
    );
    expect(
      await initializeStatus(endpoint, { ...valid, Host: publicUrl.host, Origin: endpoint.origin })
    ).toBe(403);
    expect(apiRequests).toEqual([]);
    expect(
      await initializeStatus(endpoint, {
        ...valid,
        Host: publicUrl.host,
        Origin: publicUrl.origin,
      })
    ).toBe(200);
  }, 15_000);
});
