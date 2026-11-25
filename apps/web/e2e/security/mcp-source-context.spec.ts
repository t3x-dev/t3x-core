import { createHash } from 'node:crypto';
import type { GenerationModelCatalog, Pin, SourceThread, Turn } from '@t3x-dev/api-client';
import { expect, test } from '@playwright/test';
import {
  account,
  authoringScopes,
  invoke,
  mcpClient,
  mintDirect,
  registerDirect,
} from '../fixtures/mcp-qualification';

const tool = 't3x_source_context';
const digest = (text: string) =>
  `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.skip(
  process.env.T3X_E2E_AUTH_ENABLED !== '1' || process.env.T3X_E2E_MCP_PHASE !== 'source-context',
  'Requires the isolated authenticated MCP source qualification phase.'
);

test('read exact Source excerpts and the server model catalog through authenticated stdio', async ({
  request,
}) => {
  const { actor, session, evidence } = await registerDirect(request, account('sources'));
  const { project_id } = await actor<{ project_id: string }>('POST', '/projects', {
    name: 'Sources Fixture',
  });
  const foreign = await actor<{ project_id: string }>('POST', '/projects', {
    name: 'Other Sources Fixture',
  });
  const material = await evidence(project_id);
  const otherMaterial = await evidence(foreign.project_id);
  const title = 'Immutable Source fixture';
  const { conversation_id } = await actor<{ conversation_id: string }>('POST', '/conversations', {
    project_id,
    title,
  });
  const userTurn = await actor<Turn>('POST', '/turns', {
    project_id,
    conversation_id,
    role: 'user',
    content: 'Read 🐟 this exact original reply.',
  });
  const assistantTurn = await actor<Turn>('POST', '/turns', {
    project_id,
    conversation_id,
    role: 'assistant',
    content: 'Generated reply.',
    parent_turn_hash: userTurn.turn_hash,
    rings: {},
  });
  const key = await mintDirect(actor, project_id, authoringScopes);
  const agent = mcpClient(key.key, 'sources,sources:write');
  const baseline = mcpClient(session, 'read-only');
  try {
    await Promise.all([agent.connect(), baseline.connect()]);
    expect((await agent.list()).tools.map(({ name }) => name)).toContain(tool);
    expect((await baseline.list()).tools.map(({ name }) => name)).not.toContain(tool);
    const id = conversation_id;
    const thread = await invoke<SourceThread>(agent, 't3x_query', { target: 'source_thread', id });
    expect(thread).toMatchObject({ conversation_id, project_id, title });
    expect(await invoke(agent, 't3x_query', { target: 'conversation', id })).toEqual(thread);
    const threads = await invoke(agent, 't3x_query', { target: 'source_threads', project_id });
    expect(threads).toEqual(expect.arrayContaining([expect.objectContaining({ conversation_id })]));
    expect(await invoke(agent, 't3x_query', { target: 'conversations', project_id })).toEqual(threads);
    for (const uri of [`t3x://source-threads/${id}`, `t3x://conversations/${id}`]) {
      const resource = await agent.readResource(uri);
      expect(resource.contents[0].uri).toEqual(uri);
      expect(JSON.parse(resource.contents[0].text)).toEqual({ kind: 'source_thread', ...thread });
    }
    const sourceEvidence = { target: 'source_evidence', id, project_id };
    expect(await invoke(agent, 't3x_query', sourceEvidence)).toMatchObject({
      availability: { mode: 'available', reasons: [] },
      source: { id, project_id, title },
      turns: {
        total: 2,
        items: expect.arrayContaining([
          expect.objectContaining({ turn_hash: userTurn.turn_hash, role: 'user' }),
          expect.objectContaining({
            turn_hash: assistantTurn.turn_hash,
            parent_turn_hash: userTurn.turn_hash,
            role: 'assistant',
          }),
        ]),
      },
    });
    const deniedEvidence = await agent.call('t3x_query', {
      ...sourceEvidence,
      project_id: foreign.project_id,
    });
    expect(deniedEvidence.isError).toBe(true);
    expect(JSON.parse(deniedEvidence.content[0]?.text ?? '{}')).toMatchObject({
      error: { code: 'FORBIDDEN', status: 403 },
    });

    expect(await invoke(agent, tool, { action: 'materials', project_id, limit: 1 })).toMatchObject({
      items: [{ material_id: material.id, content_hash: material.content_hash }],
      next_offset: null,
    });

    const materialPath = `/projects/${project_id}/materials/${material.id}`;
    const stored = await actor<{ content_text: string }>('GET', materialPath);
    const reference = {
      action: 'material_excerpt',
      project_id,
      material_id: material.id,
      start: 4,
      end: 16,
    };
    expect(
      await invoke(agent, tool, { ...reference, expected_digest: digest(stored.content_text) })
    ).toMatchObject({
      material_id: material.id,
      content_hash: material.content_hash,
      quote: stored.content_text.slice(4, 16),
      char_start: 4,
      char_end: 16,
      next_start: 16,
      resource: {
        uri: `t3x://projects/${project_id}/materials/${material.id}`,
        digest: digest(stored.content_text),
      },
    });
    const error = async (args: Record<string, unknown>, status: number) => {
      const result = await agent.call(tool, args);
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0]?.text ?? '{}')).toMatchObject({ error: { status } });
    };
    await error({ ...reference, material_id: otherMaterial.id }, 404);
    await error({ ...reference, expected_digest: digest('wrong text') }, 409);

    const threadArgs = { action: 'turn_excerpt', project_id, source_thread_id: conversation_id };
    expect(
      await invoke(agent, tool, { ...threadArgs, turn_hash: userTurn.turn_hash, start: 5, end: 7 })
    ).toMatchObject({
      quote: '🐟',
      char_start: 5,
      char_end: 7,
      turn_hash: userTurn.turn_hash,
      resource: { digest: digest(userTurn.content) },
    });
    await error({ ...threadArgs, turn_hash: userTurn.turn_hash, start: 6, end: 7 }, 400);
    await error({ ...threadArgs, turn_hash: assistantTurn.turn_hash }, 404);
    await error(
      { ...threadArgs, project_id: foreign.project_id, turn_hash: userTurn.turn_hash },
      404
    );

    const source = { project_id, ref_id: conversation_id, type: 'conversation' };
    const pin = await invoke<Pin>(agent, 't3x_admin', { action: 'create_pin', ...source });
    expect(pin).toMatchObject(source);
    expect(await invoke(agent, 't3x_query', { target: 'pin', id: pin.id })).toEqual(pin);
    expect(await invoke(agent, 't3x_query', { target: 'pins', project_id })).toEqual([pin]);
    await invoke(agent, 't3x_admin', { action: 'delete_pin', pin_id: pin.id });
    expect(await invoke(agent, 't3x_query', { target: 'pins', project_id })).toEqual([]);

    const catalog = await actor<GenerationModelCatalog>('GET', '/llm/models');
    const visible = catalog.providers.filter(
      (provider) => provider.available && provider.models.length > 0
    );
    expect(await invoke(agent, tool, { action: 'models' })).toMatchObject({ providers: visible });
  } finally {
    await Promise.allSettled([agent.close(), baseline.close()]);
  }
});
