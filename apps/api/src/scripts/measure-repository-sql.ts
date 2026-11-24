/** Profile actual repository reads against a disposable embedded database. */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDB, createApp, getDB, getRuntimePostgresClient } from '@t3x-dev/api';
import { upsertWorkspaceDraft } from '@t3x-dev/storage';

async function availablePort(): Promise<number> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert(address && typeof address === 'object');
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

type Client = ReturnType<typeof getRuntimePostgresClient>;
type Bindings = Parameters<Client['unsafe']>[1];
type Statement = { text: string; bindings: Bindings };
type Explain = { 'QUERY PLAN': [{ 'Planning Time': number; 'Execution Time': number }] };

async function explainReads(client: Client, statements: Statement[]) {
  const started = performance.now();
  const reserved = await client.reserve();
  const acquired = performance.now();
  try {
    await reserved.unsafe('BEGIN READ ONLY');
    const reads = [];
    for (const [index, statement] of statements.entries()) {
      const sent = performance.now();
      await reserved.unsafe(statement.text, statement.bindings);
      const clientRoundTripMs = performance.now() - sent;
      const explainSent = performance.now();
      const [result] = await reserved.unsafe<Explain[]>(
        `EXPLAIN (ANALYZE, FORMAT JSON) ${statement.text}`,
        statement.bindings
      );
      reads.push({
        statement: index + 1,
        client_round_trip_ms: clientRoundTripMs,
        explain_client_round_trip_ms: performance.now() - explainSent,
        postgres_plan_ms: result['QUERY PLAN'][0]['Planning Time'],
        postgres_execute_ms: result['QUERY PLAN'][0]['Execution Time'],
      });
    }
    return { replay_pool_acquire_ms: acquired - started, reads };
  } finally {
    try {
      await reserved.unsafe('ROLLBACK');
    } finally {
      reserved.release();
    }
  }
}

assert(!process.env.DATABASE_URL, 'Run this diagnostic with DATABASE_URL unset.');
process.env.AUTH_DISABLED = 'true';
process.env.T3X_PG_PORT = String(await availablePort());
const storage = await mkdtemp(join(tmpdir(), 't3x-sql-profile-'));
process.env.T3X_DATA_DIR = storage;
try {
  const db = await getDB();
  const { app } = createApp({ repositoryReadTiming: true });
  const body = (data: object) => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  const response = await app.request('/api/v1/projects', body({ name: 'SQL timing profile' }));
  assert.equal(response.status, 201, 'Could not seed the diagnostic repository.');
  const { data } = (await response.json()) as { data: { project_id: string } };
  const project = `/api/v1/projects/${data.project_id}`;
  await upsertWorkspaceDraft(db, {
    project_id: data.project_id,
    workspace_id: 'workspace:main',
    target_branch: 'main',
    title: 'SQL timing profile',
    workspace_state: { title: 'SQL timing profile', targetBranch: 'main', schemaBindings: [] },
  });

  const client = getRuntimePostgresClient();
  const unsafe = client.unsafe;
  const results = [];
  for (const [label, path, init] of [
    ['repository_list', '/api/v1/projects?limit=20&cursor='],
    ['project_detail', project],
    [
      'schema_preview',
      `${project}/schema-studio/preview`,
      body({ candidateIds: [], workspaceId: 'workspace:main' }),
    ],
  ] as const) {
    const reads: Statement[] = [];
    let submitted = 0;
    client.unsafe = new Proxy(unsafe, {
      apply(target, receiver, args: [string, Bindings?]) {
        const [text, bindings] = args;
        submitted += 1;
        if (/^\s*select\b/i.test(text)) reads.push({ text, bindings });
        return Reflect.apply(target, receiver, args);
      },
    });
    let result: Response;
    const start = performance.now();
    try {
      result = await app.request(path, init);
      await result.arrayBuffer();
    } finally {
      client.unsafe = unsafe;
    }
    const requestMs = performance.now() - start;
    assert.equal(result.status, 200, `${label} returned ${result.status}.`);
    assert(reads.length > 0, `No SQL reads captured for ${label}.`);
    results.push({
      route: label,
      request_ms: requestMs,
      server_timing: result.headers.get('server-timing'),
      submitted_statements: submitted,
      ...(await explainReads(client, reads)),
    });
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await closeDB();
  await rm(storage, { recursive: true, force: true });
}
