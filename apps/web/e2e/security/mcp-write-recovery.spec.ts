import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, request as forward } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { SourceIngestionReceipt, SourceThread } from '@t3x-dev/api-client';
import { expect, test } from '@playwright/test';
import { API_ORIGIN } from '../fixtures/api-helpers';
import {
  account,
  authoringScopes,
  type Credential,
  invoke,
  mcpClient,
  mintDirect,
  registerDirect,
} from '../fixtures/mcp-qualification';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.skip(
  process.env.T3X_E2E_AUTH_ENABLED !== '1' || process.env.T3X_E2E_MCP_PHASE !== 'write-recovery',
  'Requires an isolated authenticated API and stdio client.'
);

test('recovers one persisted Source write after losing its API response', async ({ request }) => {
  const { actor } = await registerDirect(request, account('recovery'));
  const { project_id } = await actor<{ project_id: string }>('POST', '/projects', {
    name: 'MCP write recovery fixture',
  });
  const credential = await mintDirect(actor, project_id, authoringScopes);
  const request_id = randomUUID();
  const target = `/api/v1/projects/${project_id}/source-ingestions/${request_id}`;
  let writes = 0;
  let upstreamStatus: number | undefined;
  const proxy = createServer((incoming, outgoing) => {
    const drop = incoming.method === 'POST' && incoming.url === target;
    if (drop) writes++;
    const upstream = forward(
      API_ORIGIN,
      { path: incoming.url, method: incoming.method, headers: incoming.headers },
      (response) => {
        if (drop) {
          response.resume();
          response.once('end', () => {
            upstreamStatus = response.statusCode;
            outgoing.destroy();
          });
          return;
        }
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      }
    );
    upstream.on('error', () => outgoing.destroy());
    incoming.pipe(upstream);
  }).listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const proxyOrigin = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  const writer = mcpClient(credential.key, 'sources:ingest', proxyOrigin);
  const reader = mcpClient(credential.key, 'sources,sources:ingest');
  const title = 'Recover a persisted Source write';
  try {
    await writer.connect();
    const response = await writer.call('t3x_ingest_source', {
      action: 'create_thread',
      project_id,
      request_id,
      title,
    });
    expect(upstreamStatus).toBe(200);
    expect(response.isError).toBe(true);
    expect(JSON.parse(response.content[0]?.text ?? '{}')).toMatchObject({
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        write_outcome: 'unconfirmed',
        call_id: expect.any(String),
      },
    });
    await reader.connect();
    const receipt = await invoke<SourceIngestionReceipt>(reader, 't3x_ingest_source', {
      action: 'receipt',
      project_id,
      request_id,
    });
    expect(receipt).toMatchObject({ project_id, request_id, result: { action: 'create_thread' } });
    if (receipt.result.action !== 'create_thread')
      throw new Error('Expected a Source Thread receipt.');
    const threads = await invoke<SourceThread[]>(reader, 't3x_query', {
      target: 'source_threads',
      project_id,
    });
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ conversation_id: receipt.result.source_thread_id, title });
    expect(writes).toBe(1);
  } finally {
    await Promise.allSettled([writer.close(), reader.close()]);
    proxy.closeAllConnections();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
});

test('reject invalid and expired Agent credentials through stdio', async ({ request }) => {
  const { actor } = await registerDirect(request, account('expiry'));
  const { project_id } = await actor<{ project_id: string }>('POST', '/projects', {
    name: 'MCP credential expiry fixture',
  });
  const credential = await actor<Credential>('POST', '/api-keys', {
    name: 'Short-lived qualification Agent',
    principal_kind: 'agent',
    project_id,
    transition_scopes: authoringScopes,
    expires_at: new Date(Date.now() + 5000).toISOString(),
  });
  const invalid = mcpClient('invalid-qualification-credential', 'context');
  const expiring = mcpClient(credential.key, 'context');
  const outcome = async (client: typeof invalid) => {
    const result = await client.call('t3x_context', {});
    return { isError: Boolean(result.isError), ...JSON.parse(result.content[0]?.text ?? '{}') };
  };
  const unauthorized = { isError: true, error: { code: 'UNAUTHORIZED', status: 401 } };
  try {
    await Promise.all([invalid.connect(), expiring.connect()]);
    expect(await outcome(invalid)).toMatchObject(unauthorized);
    expect(await invoke(expiring, 't3x_context', {})).toMatchObject({
      actor_kind: 'agent',
      project_id,
      transition_scopes: expect.arrayContaining(authoringScopes),
    });
    await expect.poll(() => outcome(expiring), { timeout: 9000 }).toMatchObject(unauthorized);
  } finally {
    await Promise.allSettled([invalid.close(), expiring.close()]);
  }
});
