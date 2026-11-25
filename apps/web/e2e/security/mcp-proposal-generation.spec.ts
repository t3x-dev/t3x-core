import { createHash, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { ProposeTransitionResult, SourceIngestionReceipt, Turn } from '@t3x-dev/api-client';
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
import {
  extractionQuote,
  extractionTurn,
  localModel,
  original,
  quotation,
} from '../fixtures/mcp-qualification-model';

const tool = 't3x_generate_proposal';

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

test('extract a compatibility proposal from one immutable Source turn through stdio', async ({
  request,
}) => {
  test.skip(
    process.env.T3X_E2E_MCP_PHASE !== 'proposal-generation',
    'Requires the proposal-generation phase.'
  );
  test.setTimeout(120000);
  const port = Number(process.env.T3X_E2E_F3_MODEL_PORT);
  expect(Number.isInteger(port) && port > 0).toBe(true);
  expect(process.env.OPENAI_BASE_URL).toBe(`http://127.0.0.1:${port}/v1`);
  expect(process.env.OPENAI_API_KEY === 't3x-local-fixture-only').toBe(true);

  const { actor } = await registerDirect(request, account('extraction'));
  const { project_id } = await actor<{ project_id: string }>('POST', '/projects', {
    name: 'Compatibility Extraction Fixture',
  });
  const { conversation_id } = await actor<{ conversation_id: string }>('POST', '/conversations', {
    project_id,
    title: 'Exact compatibility Source',
  });
  const turn = await actor<Turn>('POST', '/turns', {
    project_id,
    conversation_id,
    role: 'user',
    content: extractionTurn,
  });
  const workspace_id = 'compatibility-extraction';
  const path = `/projects/${project_id}/workspaces/${workspace_id}`;
  const { workspace } = await actor<{ workspace: { revision: number } }>('PATCH', path, {
    workspace: {
      id: workspace_id,
      title: 'Compatibility extraction',
      targetBranch: 'main',
      status: 'draft',
    },
  });
  const key = await mintDirect(actor, project_id, authoringScopes);
  const agent = mcpClient(
    key.key,
    'workspace,sources:write,transitions,transitions:prepare,transitions:verify'
  );
  const model = await localModel(port);

  try {
    await agent.connect();
    const scope = { project_id, workspace_id };
    const input = {
      ...scope,
      source_thread_id: conversation_id,
      turn_hashes: [turn.turn_hash],
      if_revision: workspace.revision,
      provider: 'openai',
    };
    const wrongTurn = await agent.call('t3x_extract', {
      ...input,
      turn_hashes: [`sha256:${'0'.repeat(64)}`],
    });
    expect(wrongTurn.isError).toBe(true);
    expect(JSON.parse(wrongTurn.content[0]?.text ?? '{}')).toMatchObject({
      error: { code: 'INVALID_REQUEST', status: 400 },
    });
    expect(model.calls()).toBe(0);
    const extracted = await invoke<{
      candidate_id: string;
      workspace: { revision: number };
    }>(agent, 't3x_extract', input);
    expect(extracted).toMatchObject({
      candidate_id: expect.stringMatching(/^candidate:[0-9a-f]{64}$/),
      workspace: { revision: workspace.revision + 1 },
      proposal: {
        schema: 't3x.dev/workspace-extraction-proposal/v1',
        mode: 'bootstrap',
        sourceSelector: { type: 'conversation', id: conversation_id, turnHashes: [turn.turn_hash] },
        baseCommitHash: null,
        actor: { kind: 'agent', id: `agent:api-key:${key.id}` },
        operations: expect.arrayContaining([
          expect.objectContaining({
            populate: { path: 'device', values: { name: extractionQuote } },
            source: expect.objectContaining({
              turn_ref: { turn_hash: turn.turn_hash, quote: extractionQuote },
            }),
          }),
        ]),
      },
    });
    expect(model.calls()).toBe(1);
    const response = await agent.call('propose_transition', {
      ...scope,
      kind: 'structured_yops',
      extraction_candidate_id: extracted.candidate_id,
      if_revision: extracted.workspace.revision,
      request_id: randomUUID(),
    });
    const proposed = JSON.parse(response.content[0]?.text ?? '{}') as ProposeTransitionResult & {
      error?: { message?: string; code?: string };
    };
    expect(response.isError, proposed.error?.message).toBeFalsy();
    const expectedActor = { kind: 'agent', id: `agent:api-key:${key.id}` };
    expect(proposed.view.transition.claims.actor).toEqual(expectedActor);
    expect(proposed.view.transition.change.operations).toEqual([
      { define: { path: 'device' } },
      { assert: { path: 'device', equals: {} } },
      { set: { path: 'device', value: { name: extractionQuote } } },
    ]);
    expect(await actor('GET', `${path}/extraction-transition`)).toMatchObject({
      candidate_id: extracted.candidate_id,
      transition_id: proposed.transition_id,
      workspace_revision: extracted.workspace.revision,
    });
    const verified = await invoke<ProposeTransitionResult>(agent, 'verify_transition', {
      project_id,
      transition_id: proposed.transition_id,
      request_id: randomUUID(),
    });
    expect(verified.view.transition.checks.replay.outcomes).toEqual(['verified']);
    expect(verified.view.precondition.ref_head).toBeNull();
    const operations = [{ set: { path: 'device/name', value: 'Explicit fixture name' } }];
    const direct = await invoke<ProposeTransitionResult>(agent, 't3x_edit', {
      ...scope,
      mode: 'proposal',
      if_revision: extracted.workspace.revision,
      request_id: randomUUID(),
      operations,
    });
    expect(direct.view).toMatchObject({
      precondition: { ref_head: null, workspace_revision: extracted.workspace.revision },
      transition: { change: { operations } },
    });
    expect(direct.view.transition.claims.actor).toEqual(expectedActor);
    expect(model.calls()).toBe(1);
  } finally {
    await Promise.allSettled([agent.close(), model.close()]);
  }
});
