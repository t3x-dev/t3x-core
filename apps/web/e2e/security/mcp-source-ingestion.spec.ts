import { createHash, randomUUID } from 'node:crypto';
import type { SourceIngestionReceipt, Turn } from '@t3x-dev/api-client';
import { expect, test } from '@playwright/test';
import {
  account,
  authoringScopes,
  invoke,
  mcpClient,
  mintDirect,
  registerDirect,
} from '../fixtures/mcp-qualification';

const tool = 't3x_ingest_source';
const bytes = Buffer.from('Machine-ingested fixture attachment.\n', 'utf8');

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.skip(
  process.env.T3X_E2E_AUTH_ENABLED !== '1' || process.env.T3X_E2E_MCP_PHASE !== 'source-ingestion',
  'Requires the isolated authenticated MCP source ingestion stack.'
);

test('agent ingestion preserves exact receipts, parent CAS, provenance and archive state', async ({
  request,
}) => {
  const { actor, session } = await registerDirect(request, account('ingestor'));
  const { project_id } = await actor<{ project_id: string }>('POST', '/projects', {
    name: 'Source ingestion fixture',
  });
  const foreign = await actor<{ project_id: string }>('POST', '/projects', {
    name: 'Other ingestion fixture',
  });
  const [key, otherKey] = await Promise.all([
    mintDirect(actor, project_id, authoringScopes),
    mintDirect(actor, project_id, authoringScopes),
  ]);
  const agent = mcpClient(key.key, 'sources,sources:ingest');
  const otherAgent = mcpClient(otherKey.key, 'sources:ingest');
  const human = mcpClient(session, 'sources:ingest');
  try {
    await Promise.all([agent.connect(), otherAgent.connect(), human.connect()]);
    expect((await agent.list()).tools.map(({ name }) => name)).toContain(tool);
    const call = (action: string, request_id: string, input = {}) =>
      invoke<SourceIngestionReceipt>(agent, tool, { action, project_id, request_id, ...input });
    const checkError = async (
      client: typeof agent,
      status: number,
      input: { action: string; request_id: string } & Record<string, unknown>
    ) => {
      const result = await client.call(tool, { project_id, ...input });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0]?.text ?? '{}')).toMatchObject({ error: { status } });
    };

    const createId = randomUUID();
    await checkError(agent, 404, { action: 'receipt', request_id: createId });
    const title = 'Scoped machine Source Thread';
    await checkError(human, 403, { action: 'create_thread', request_id: createId, title });
    await checkError(agent, 403, {
      action: 'create_thread',
      request_id: createId,
      title,
      project_id: foreign.project_id,
    });
    const [thread, concurrent] = await Promise.all([
      call('create_thread', createId, { title }),
      call('create_thread', createId, { title }),
    ]);
    expect(thread).toEqual(concurrent);
    expect(thread.actor).toEqual({ kind: 'agent', id: `agent:api-key:${key.id}` });
    expect(await call('receipt', createId)).toEqual(thread);
    await checkError(otherAgent, 404, { action: 'receipt', request_id: createId });
    await checkError(agent, 409, {
      action: 'create_thread',
      request_id: createId,
      title: 'Different',
    });
    if (thread.result.action !== 'create_thread') throw new Error('Expected a thread receipt.');
    const source_thread_id = thread.result.source_thread_id;

    const appendId = randomUUID();
    const first = {
      source_thread_id,
      expected_parent_turn_hash: null,
      content: 'Agent supplied text, not a user original.',
    };
    await checkError(agent, 400, {
      action: 'append_turn',
      request_id: appendId,
      ...first,
      role: 'user',
    });
    const firstReceipt = await call('append_turn', appendId, first);
    if (firstReceipt.result.action !== 'append_turn') throw new Error('Expected a turn receipt.');
    const firstTurn = await actor<Turn>('GET', `/turns/${firstReceipt.result.turn_hash}`);
    expect(firstTurn).toMatchObject({
      role: 'tool',
      parent_turn_hash: null,
      content: first.content,
    });
    expect(firstReceipt.result.content_digest).toBe(
      `sha256:${createHash('sha256').update(first.content).digest('hex')}`
    );
    await checkError(agent, 409, { action: 'append_turn', request_id: randomUUID(), ...first });
    const next = {
      ...first,
      expected_parent_turn_hash: firstTurn.turn_hash,
      content: 'Second agent-supplied entry.',
    };
    const concurrentTurns = await Promise.all(
      [randomUUID(), randomUUID()].map((request_id) =>
        agent.call(tool, { project_id, action: 'append_turn', request_id, ...next })
      )
    );
    expect(concurrentTurns.filter((result) => result.isError)).toHaveLength(1);
    expect(
      JSON.parse(concurrentTurns.find((result) => result.isError)?.content[0]?.text ?? '{}')
    ).toMatchObject({
      error: { status: 409 },
    });
    expect(await call('receipt', appendId)).toEqual(firstReceipt);
    expect(await call('append_turn', appendId, first)).toEqual(firstReceipt);
    const { turns } = await actor<{ turns: Turn[] }>(
      'GET',
      `/turns?conversation_id=${source_thread_id}`
    );
    expect(turns).toHaveLength(2);
    const read = await agent.call('t3x_source_context', {
      action: 'turn_excerpt',
      project_id,
      source_thread_id,
      turn_hash: firstTurn.turn_hash,
    });
    expect(JSON.parse(read.content[0]?.text ?? '{}')).toMatchObject({ error: { status: 404 } });
    const humanOriginal = await actor<Turn>('POST', '/turns', {
      project_id,
      conversation_id: source_thread_id,
      role: 'user',
      content: 'Human-authored entry.',
    });
    expect(
      await invoke(agent, 't3x_source_context', {
        action: 'turn_excerpt',
        project_id,
        source_thread_id,
        turn_hash: humanOriginal.turn_hash,
      })
    ).toMatchObject({ quote: humanOriginal.content });

    const uploadId = randomUUID();
    const upload = {
      filename: 'machine-source.txt',
      mime_type: 'text/plain',
      bytes_base64: bytes.toString('base64'),
    };
    const stored = await call('upload_material', uploadId, upload);
    if (stored.result.action !== 'upload_material') throw new Error('Expected a material receipt.');
    expect(stored.result).toMatchObject({
      attachment_digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      material_created_by: `agent:api-key:${key.id}`,
    });
    const path = `/projects/${project_id}/materials/${stored.result.material_id}`;
    expect(await actor('GET', path)).toMatchObject({
      created_by: stored.result.material_created_by,
      content_text: bytes.toString('utf8'),
    });
    await actor('DELETE', path);
    expect(await call('receipt', uploadId)).toEqual(stored);
    expect(await call('upload_material', uploadId, upload)).toEqual(stored);
    const sameMaterial = await call('upload_material', randomUUID(), upload);
    expect(sameMaterial.result).toEqual(stored.result);
    expect(await actor('GET', path)).toMatchObject({ archived_at: expect.any(String) });
  } finally {
    await Promise.allSettled([agent.close(), otherAgent.close(), human.close()]);
  }
});
