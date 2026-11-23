import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { ProposeTransitionResult, SourceIngestionReceipt, Turn } from '@t3x-dev/api-client';
import { expect, test } from '@playwright/test';
import {
  account,
  authoringScopes,
  type DraftVersion,
  invoke,
  mcpClient,
  mintDirect,
  type PreparedReview,
  registerDirect,
} from '../fixtures/mcp-qualification';

const tool = 't3x_generate_proposal';
const quotation = 'Traceable Source title';
const original = `Use this exact product title: ${quotation}.`;

interface ModelPrompt {
  sources: Array<{ sourceIndex: number; content: string }>;
}

async function localModel(port: number) {
  let calls = 0;
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404).end();
      return;
    }
    if (request.headers.authorization !== 'Bearer t3x-local-fixture-only') {
      response.writeHead(401).end();
      return;
    }
    calls++;
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const prompt = JSON.parse(
        body.messages.findLast(({ role }: { role: string }) => role === 'user').content
      ) as ModelPrompt;
      const source = prompt.sources.find(({ content }) => content === original);
      if (!source) throw new Error('The actual Wire prompt omitted the selected original turn.');
      const pointer = {
        sourceIndex: source.sourceIndex,
        locator: { scheme: 't3x.text-quote/v1', value: { quote: quotation, occurrence: 0 } },
      };
      const draft = {
        schema: 't3x.dev/proposal-generation-draft/v1',
        version: 1,
        posture: 'guided',
        intent: { mode: 'stated', value: quotation, evidencePointers: [pointer] },
        rationale: { mode: 'unspecified' },
        changes: [
          {
            id: 'source-title',
            operations: [{ set: { path: 'prd/title', value: quotation } }],
            claimedOrigin: 'source_backed',
            evidencePointers: [pointer],
            basisPointers: [],
            assumptions: [],
            reason: 'The original user turn supplies the title verbatim.',
            challenges: [],
          },
        ],
        warnings: [],
      };
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(draft) } }],
          usage: { prompt_tokens: 12, completion_tokens: 10 },
        })
      );
    } catch {
      response
        .writeHead(400, { 'Content-Type': 'application/json' })
        .end('{"error":"Invalid local model fixture prompt"}');
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  return {
    calls: () => calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.skip(
  process.env.T3X_E2E_AUTH_ENABLED !== '1' ||
    process.env.T3X_E2E_MCP_PHASE !== 'proposal-generation',
  'Requires the isolated authentication-enabled MCP Proposal Generation phase.'
);

test('generate a governed candidate through stdio and apply it independently to a fixed Review', async ({
  request,
}) => {
  test.setTimeout(120000);
  const port = Number(process.env.T3X_E2E_F3_MODEL_PORT);
  expect(Number.isInteger(port) && port > 0).toBe(true);
  expect(process.env.OPENAI_BASE_URL).toBe(`http://127.0.0.1:${port}/v1`);
  expect(process.env.OPENAI_API_KEY === 't3x-local-fixture-only').toBe(true);

  const { actor, session, evidence } = await registerDirect(request, account('generation'));
  const { project_id } = await actor<{ project_id: string }>('POST', '/projects', {
    name: 'Proposal Generation Fixture',
  });
  const foreign = await actor<{ project_id: string }>('POST', '/projects', {
    name: 'Foreign Generation Evidence',
  });
  const [material, otherMaterial] = await Promise.all([
    evidence(project_id),
    evidence(foreign.project_id),
  ]);
  const { conversation_id } = await actor<{ conversation_id: string }>('POST', '/conversations', {
    project_id,
    title: 'Human Source Thread',
  });
  const turn = await actor<Turn>('POST', '/turns', {
    project_id,
    conversation_id,
    role: 'user',
    content: original,
  });
  const key = await mintDirect(actor, project_id, authoringScopes);
  const agent = mcpClient(
    key.key,
    'workspace,sources,sources:ingest,sources:generate,workspace:candidates:write,transitions'
  );
  const human = mcpClient(session, 'workspace,workspace:write,transitions,transitions:prepare');
  const model = await localModel(port);
  try {
    await Promise.all([agent.connect(), human.connect()]);
    expect((await agent.list()).tools.map(({ name }) => name)).toContain(tool);
    expect((await human.list()).tools.map(({ name }) => name)).not.toContain(tool);
    const workspace_id = 'proposal-generation-fixture';
    const scope = { project_id, workspace_id };
    const workspace = `/projects/${project_id}/workspaces/${workspace_id}`;
    const created = await actor<{ workspace: { revision: number } }>('PATCH', workspace, {
      workspace: {
        id: workspace_id,
        title: 'Candidate generation fixture',
        targetBranch: 'main',
        status: 'draft',
        baseCommitHash: null,
        sourceBundle: [
          {
            id: `material:${material.id}`,
            type: 'document',
            title: 'Included text',
            materialId: material.id,
            contentHash: material.content_hash,
          },
        ],
        schemaBindings: [
          { canonicalName: 't3x/prd', version: 'v2', mode: 'pinned', rootKey: 'prd' },
        ],
        yopsDraft: { id: 'generation-fixture', operations: [] },
      },
    });
    await actor('POST', `${workspace}/authoring`, {
      request_id: randomUUID(),
      expected_workspace_revision: created.workspace.revision,
      expected_ref_head: null,
    });
    const activity = () =>
      invoke<DraftVersion & { current: Record<string, unknown> }>(agent, 't3x_query', {
        target: 'workspace_activity',
        project_id,
        id: workspace_id,
      });
    const exact = (draft: DraftVersion) => ({
      expected_workspace_revision: draft.workspaceRevision,
      expected_revision: draft.compositionRevision,
      expected_ref_head: draft.basis.refHead,
    });
    const prd = {
      title: 'Original fixture title',
      summary: {
        problem: 'Evidence traceability',
        audience: 'Fixture readers',
        outcome: 'Verify the Source',
      },
      requirements: {
        core: { title: 'Test it', priority: 'must', acceptance: ['Show exact evidence'] },
      },
    };
    await invoke(human, 't3x_edit', {
      ...scope,
      mode: 'draft',
      request_id: randomUUID(),
      ...exact(await activity()),
      operations: [{ set: { path: 'prd', value: prd } }],
    });
    const before = await activity();
    const ingested = await invoke<SourceIngestionReceipt>(agent, 't3x_ingest_source', {
      action: 'upload_material',
      project_id,
      request_id: randomUUID(),
      filename: 'f3-machine-source.txt',
      mime_type: 'text/plain',
      bytes_base64: Buffer.from('Agent-origin text.').toString('base64'),
    });
    if (ingested.result.action !== 'upload_material')
      throw new Error('Expected the F2 material receipt.');
    const generation = {
      ...scope,
      request_id: randomUUID(),
      if_revision: before.workspaceRevision,
      instruction: 'Use the exact title from the original user turn.',
      source_material_ids: [material.id],
      source_turn_hashes: [turn.turn_hash],
      provider: 'openai',
    };
    const rejects = async (input: Record<string, unknown>, status: number) => {
      const result = await agent.call(tool, { ...generation, ...input });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0]?.text ?? '{}')).toMatchObject({ error: { status } });
    };
    await rejects({ if_revision: before.workspaceRevision - 1 }, 409);
    await rejects({ source_material_ids: [otherMaterial.id] }, 400);
    await rejects({ source_material_ids: [ingested.result.material_id] }, 400);
    await rejects({ source_material_ids: [], source_turn_hashes: [] }, 400);
    const unavailable = await agent.call(tool, {
      ...generation,
      model: 'fixture-unavailable-model',
    });
    expect(unavailable.isError).toBe(true);
    expect(JSON.parse(unavailable.content[0]?.text ?? '{}')).toMatchObject({
      error: { code: 'GENERATION_NOT_CONFIGURED' },
    });
    expect(model.calls()).toBe(0);

    const candidate = await invoke<ProposeTransitionResult>(agent, tool, generation);
    expect(candidate.reused).toBe(false);
    const afterGeneration = await activity();
    expect(afterGeneration).toMatchObject({
      current: before.current,
      workspaceRevision: before.workspaceRevision,
      compositionRevision: before.compositionRevision,
    });
    expect(await invoke(agent, tool, generation)).toMatchObject({
      transition_id: candidate.transition_id,
      reused: true,
    });
    expect(model.calls()).toBe(1);
    await rejects({ instruction: 'Different request facts' }, 409);

    await invoke(agent, 't3x_publish_candidate', {
      ...scope,
      transition_id: candidate.transition_id,
      request_id: randomUUID(),
    });
    const applied = await activity();
    expect(applied.current).toEqual({ prd: { ...prd, title: quotation } });
    expect(applied.basis.refHead).toBeNull();
    expect(await invoke(agent, tool, generation)).toMatchObject({
      transition_id: candidate.transition_id,
      reused: true,
    });
    expect(model.calls()).toBe(1);
    const fixed = await invoke<PreparedReview>(human, 't3x_draft_review', {
      ...scope,
      action: 'prepare',
      ...exact(applied),
      request_id: randomUUID(),
    });
    const snapshot = await invoke(human, 't3x_draft_review', {
      ...scope,
      action: 'read',
      snapshot_id: fixed.review.snapshot_id,
    });
    expect(snapshot).toMatchObject({
      snapshot_digest: fixed.review.snapshot_digest,
      snapshot: {
        transition: {
          checks: {
            runner: {
              runs: expect.arrayContaining([
                expect.objectContaining({
                  predicate: expect.objectContaining({
                    inputArtifacts: expect.arrayContaining([
                      expect.objectContaining({
                        uri: `t3x://projects/${project_id}/conversations/${conversation_id}/turns/${encodeURIComponent(turn.turn_hash)}`,
                        digest: `sha256:${createHash('sha256').update(original).digest('hex')}`,
                      }),
                    ]),
                  }),
                }),
              ]),
            },
          },
        },
      },
    });
  } finally {
    await Promise.allSettled([agent.close(), human.close(), model.close()]);
  }
});
