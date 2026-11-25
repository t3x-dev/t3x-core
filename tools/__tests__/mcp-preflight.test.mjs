import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { preflightMcp } from '../mcp-preflight.mjs';

test('preflight negotiates stdio and checks the advertised tools and authenticated context', async () => {
  const api = createServer((request, response) => {
    assert.equal(request.url, '/api/v1/auth/me/credential');
    const authorized = request.headers.authorization === 'Bearer fixture';
    response.writeHead(authorized ? 200 : 401, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify(
        authorized
          ? {
              success: true,
              data: {
                actor_kind: 'agent',
                credential_kind: 'mcp',
                project_id: 'fixture-project',
                namespace_id: null,
                transition_scopes: [],
              },
            }
          : { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credential' } }
      )
    );
  });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  try {
    const options = { apiUrl: `http://127.0.0.1:${api.address().port}/api`, apiKey: 'fixture' };
    const result = await preflightMcp({ ...options, expectedTools: ['t3x_query'] });
    assert.match(result.protocolVersion, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(result.serverVersion);
    assert.ok(result.tools.some(({ name }) => name === 't3x_context'));
    await assert.rejects(preflightMcp({ ...options, apiKey: 'revoked' }), /HTTP 401/);
    await assert.rejects(
      preflightMcp({ ...options, expectedTools: ['commit_transition'] }),
      /does not expose/
    );
  } finally {
    const closed = once(api, 'close');
    api.close();
    await closed;
  }
});
