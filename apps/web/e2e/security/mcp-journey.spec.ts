import { createHash, randomUUID } from 'node:crypto';
import type {
  OpenWorkspaceResult,
  ProposeTransitionResult,
  SourceIngestionReceipt,
  StateExportArtifact,
  Turn,
  VerifyTransitionResult,
  WorkspaceDeliveryList,
  WorkspaceDeliveryResult,
  WorkspaceDeployment,
} from '@t3x-dev/api-client';
import { expect, test } from '@playwright/test';
import {
  account,
  type DraftVersion,
  invoke,
  mcpClient,
  mintBrowser,
  type PreparedReview,
  registerBrowser,
} from '../fixtures/mcp-qualification';
import { localModel, original, quotation } from '../fixtures/mcp-qualification-model';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.skip(
  process.env.T3X_E2E_AUTH_ENABLED !== '1' || process.env.T3X_E2E_MCP_PHASE !== 'journey',
  'Requires the isolated authenticated MCP journey phase.'
);

test('Web-authorized MCP Source to Commit and preview rollback', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const port = Number(process.env.T3X_E2E_F3_MODEL_PORT);
  expect(Number.isInteger(port) && port > 0).toBe(true);
  expect(process.env.OPENAI_BASE_URL).toBe(`http://127.0.0.1:${port}/v1`);
  expect(process.env.OPENAI_API_KEY === 't3x-local-fixture-only').toBe(true);

  const identity = account('journey');
  const { actor, session, evidence } = await registerBrowser(page, identity);
  const human = mcpClient(
    session,
    'repositories:create,transitions,transitions:prepare,transitions:verify'
  );
  const clients = [human];
  const model = await localModel(port);
  try {
    await human.connect();
    const { project_id, canonical_path } = await invoke<{
      project_id: string;
      canonical_path: string;
    }>(human, 't3x_admin', { action: 'create_project', name: 'MCP-Journey' });
    const credential = await mintBrowser(
      page,
      project_id,
      testInfo.outputPath('agent-token-form.png')
    );
    const agent = mcpClient(
      credential.key,
      'read-only,workspace,workspace:write,workspace:candidates:write,sources,sources:ingest,sources:generate,transitions,transitions:verify,decision:accept,delivery,delivery:prepare,delivery:deploy,delivery:rollback'
    );
    clients.push(agent);
    await agent.connect();
    expect(await invoke(agent, 't3x_context', {})).toMatchObject({
      actor_kind: 'agent',
      project_id,
    });
    const head = () =>
      invoke<{ canonical_path: string; head_commit_hash: string | null }>(
        agent,
        't3x_resolve_repository',
        { repository: canonical_path, ref: 'main' }
      );
    expect(await head()).toMatchObject({ canonical_path, head_commit_hash: null });

    const createThread = randomUUID();
    const ingest = (action: string, request_id: string, input: Record<string, unknown> = {}) =>
      invoke<SourceIngestionReceipt>(agent, 't3x_ingest_source', {
        action,
        project_id,
        request_id,
        ...input,
      });
    const thread = await ingest('create_thread', createThread, { title: 'Journey Source' });
    if (thread.result.action !== 'create_thread')
      throw new Error('Expected a Source Thread receipt.');
    const { source_thread_id } = thread.result;
    expect(await ingest('receipt', createThread)).toEqual(thread);
    const machineTurn = await ingest('append_turn', randomUUID(), {
      source_thread_id,
      expected_parent_turn_hash: null,
      content: 'Agent opened this thread to collect a requirement.',
    });
    if (machineTurn.result.action !== 'append_turn')
      throw new Error('Expected a machine turn receipt.');
    const turn = await actor<Turn>('POST', '/turns', {
      project_id,
      conversation_id: source_thread_id,
      role: 'user',
      content: original,
    });
    expect(turn.parent_turn_hash).toBe(machineTurn.result.turn_hash);
    expect(
      await invoke(agent, 't3x_source_context', {
        action: 'turn_excerpt',
        project_id,
        source_thread_id,
        turn_hash: turn.turn_hash,
      })
    ).toMatchObject({ quote: original });

    const project = `/projects/${project_id}`;
    const workspace_id = 'mcp-journey';
    const scope = { project_id, workspace_id };
    const workspace = `${project}/workspaces/${workspace_id}`;
    const material = await evidence(project_id);
    const initial = await actor<{ workspace: { revision: number } }>('PATCH', workspace, {
      workspace: {
        id: workspace_id,
        title: 'MCP journey',
        targetBranch: 'main',
        status: 'draft',
        baseCommitHash: null,
        sourceBundle: [
          {
            id: `material:${material.id}`,
            title: 'Qualification evidence',
            type: 'document',
            materialId: material.id,
            contentHash: material.content_hash,
          },
        ],
        schemaBindings: [
          { canonicalName: 't3x/prd', version: 'v2', mode: 'pinned', rootKey: 'prd' },
        ],
        yopsDraft: { id: 'journey-draft', operations: [] },
      },
    });
    await actor('POST', `${workspace}/authoring`, {
      request_id: randomUUID(),
      expected_workspace_revision: initial.workspace.revision,
      expected_ref_head: null,
    });
    expect(
      await invoke<OpenWorkspaceResult>(agent, 't3x_open_workspace', {
        project_id,
        ref: 'main',
        expected_head: null,
        request_id: randomUUID(),
      })
    ).toMatchObject({ workspace_id, basis_ref_head: null });
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
    const edit = async (path: string, value: unknown) =>
      invoke(agent, 't3x_edit', {
        ...scope,
        mode: 'draft',
        request_id: randomUUID(),
        ...exact(await activity()),
        operations: [{ set: { path, value } }],
      });
    const prd = {
      title: 'Initial title',
      summary: {
        problem: 'Qualification trail',
        audience: 'Fixture readers',
        outcome: 'Read the exact deployed version',
      },
      requirements: {
        core: { title: 'Trace the requirement', priority: 'must', acceptance: ['Read the Source'] },
      },
    };
    await edit('prd', prd);
    const basis = await activity();
    const generated = await invoke<ProposeTransitionResult>(agent, 't3x_generate_proposal', {
      ...scope,
      request_id: randomUUID(),
      if_revision: basis.workspaceRevision,
      instruction: 'Set the title from the human-authored turn.',
      source_material_ids: [material.id],
      source_turn_hashes: [turn.turn_hash],
      provider: 'openai',
    });
    expect(model.calls()).toBe(1);
    expect(await activity()).toMatchObject({
      current: basis.current,
      workspaceRevision: basis.workspaceRevision,
      compositionRevision: basis.compositionRevision,
    });
    const verified = await invoke<VerifyTransitionResult>(human, 'verify_transition', {
      project_id,
      transition_id: generated.transition_id,
      request_id: randomUUID(),
    });
    expect(verified.operational_results).toEqual([]);
    expect(verified.view.precondition.policy_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const denied = await agent.call('decide_transition', {
      project_id,
      transition_id: generated.transition_id,
      outcome: 'accepted',
      precondition: verified.view.precondition,
      request_id: randomUUID(),
    });
    expect(denied.isError).toBe(true);
    expect(JSON.parse(denied.content[0]?.text ?? '{}')).toMatchObject({
      error: { status: 403, details: { protocol_code: 'GENERATION_HUMAN_DECISION_REQUIRED' } },
    });
    expect((await head()).head_commit_hash).toBeNull();
    await invoke(agent, 't3x_publish_candidate', {
      ...scope,
      transition_id: generated.transition_id,
      request_id: randomUUID(),
    });
    const firstValue = { prd: { ...prd, title: quotation } };
    expect((await activity()).current).toEqual(firstValue);

    const prepareReview = async () =>
      invoke<PreparedReview>(human, 't3x_draft_review', {
        ...scope,
        action: 'prepare',
        ...exact(await activity()),
        request_id: randomUUID(),
      });
    const approve = async (review: PreparedReview, expectedHead: string | null) => {
      await page.goto(`${canonical_path}/reviews/${review.review.address_number}`);
      const decided = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes('/transition/decide')
      );
      await page.getByRole('button', { name: 'Approve and commit', exact: true }).click();
      expect((await decided).ok()).toBe(true);
      await expect.poll(async () => (await head()).head_commit_hash).not.toBe(expectedHead);
      const commit_digest = (await head()).head_commit_hash;
      expect(commit_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      if (!commit_digest) throw new Error('Web approval did not commit.');
      expect(
        await invoke(agent, 't3x_commit_result', {
          project_id,
          transition_id: review.view.transition_id,
          commit_digest,
        })
      ).toMatchObject({
        commit: { digest: commit_digest },
        branch: { head_commit_hash: commit_digest },
      });
      return commit_digest;
    };
    const firstReview = await prepareReview();
    const snapshot = await invoke(agent, 't3x_draft_review', {
      ...scope,
      action: 'read',
      snapshot_id: firstReview.review.snapshot_id,
    });
    const sourceDigest = `sha256:${createHash('sha256').update(original).digest('hex')}`;
    expect(snapshot).toMatchObject({
      snapshot_digest: firstReview.review.snapshot_digest,
      snapshot: {
        transition: {
          checks: {
            runner: {
              runs: expect.arrayContaining([
                expect.objectContaining({
                  predicate: expect.objectContaining({
                    inputArtifacts: expect.arrayContaining([
                      expect.objectContaining({
                        uri: `t3x://projects/${project_id}/conversations/${source_thread_id}/turns/${encodeURIComponent(turn.turn_hash)}`,
                        digest: sourceDigest,
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
    const exportCommit = async (commit_digest: string, expected: unknown) => {
      const stateInput = { project_id, commit_digest };
      const state = await invoke<{ sourceState: { digest: string }; value: unknown }>(
        agent,
        't3x_committed_state',
        { ...stateInput, action: 'read' }
      );
      expect(state.value).toEqual(expected);
      const artifact = await invoke<StateExportArtifact>(agent, 't3x_committed_state', {
        ...stateInput,
        action: 'export',
        state_digest: state.sourceState.digest,
        format: 'json',
      });
      expect(JSON.parse(artifact.content)).toEqual(expected);
      expect(artifact.sourceCommit.digest).toBe(commit_digest);
      expect(artifact.sourceState.digest).toBe(state.sourceState.digest);
      expect(artifact.byteDigest).toBe(
        `sha256:${createHash('sha256').update(artifact.content).digest('hex')}`
      );
      return state.sourceState.digest;
    };
    const list = () =>
      invoke<{
        workspace_revision: number;
        commit_digest: string | null;
        current_deployment: WorkspaceDeployment | null;
      }>(agent, 't3x_workspace_delivery', { ...scope, action: 'list' });
    const deploy = async (commit_digest: string, state_digest: string) => {
      const delivery = await list();
      expect(delivery.commit_digest).toBe(commit_digest);
      const { receipt, artifact } = await invoke<WorkspaceDeliveryResult>(
        agent,
        't3x_workspace_delivery',
        {
          ...scope,
          action: 'prepare',
          workspace_revision: delivery.workspace_revision,
          commit_digest,
          request_id: randomUUID(),
        }
      );
      expect(receipt).toMatchObject({ status: 'prepared', commitDigest: commit_digest });
      expect(artifact).toMatchObject({
        format: 'bundle',
        sourceCommit: { digest: commit_digest },
        sourceState: { digest: state_digest },
        byteDigest: receipt.artifactDigest,
      });
      const { deployment } = await invoke<{ deployment: WorkspaceDeployment }>(
        agent,
        't3x_workspace_delivery',
        {
          ...scope,
          action: 'deploy',
          delivery_id: receipt.id,
          request_id: randomUUID(),
        }
      );
      expect(deployment.actualArtifactDigest).toBe(receipt.artifactDigest);
      return deployment;
    };
    const firstCommit = await approve(firstReview, null);
    const firstDeploy = await deploy(firstCommit, await exportCommit(firstCommit, firstValue));
    const secondTitle = 'Revised preview title';
    await edit('prd/title', secondTitle);
    const secondCommit = await approve(await prepareReview(), firstCommit);
    const secondDeploy = await deploy(
      secondCommit,
      await exportCommit(secondCommit, { prd: { ...prd, title: secondTitle } })
    );
    expect(secondDeploy.actualArtifactDigest).not.toBe(firstDeploy.actualArtifactDigest);
    const { deployment: rollback } = await invoke<{ deployment: WorkspaceDeployment }>(
      agent,
      't3x_workspace_delivery',
      {
        ...scope,
        action: 'rollback',
        deployment_id: firstDeploy.id,
        request_id: randomUUID(),
      }
    );
    expect(rollback).toMatchObject({
      kind: 'rollback',
      previousArtifactDigest: secondDeploy.actualArtifactDigest,
      actualArtifactDigest: firstDeploy.actualArtifactDigest,
    });
    expect((await list()).current_deployment).toEqual(rollback);
    const webDelivery = await actor<WorkspaceDeliveryList>('GET', `${workspace}/deliveries`);
    expect(webDelivery.currentDeployment).toEqual(rollback);
    expect((await head()).head_commit_hash).toBe(secondCommit);
    await testInfo.attach('Journey evidence', {
      contentType: 'application/json',
      body: JSON.stringify({
        project_id,
        source_thread_id,
        source_digest: sourceDigest,
        review_digest: firstReview.review.snapshot_digest,
        first_commit: firstCommit,
        second_commit: secondCommit,
        preview_digest: rollback.actualArtifactDigest,
      }),
    });
  } finally {
    await Promise.allSettled([...clients.map((client) => client.close()), model.close()]);
  }
});
