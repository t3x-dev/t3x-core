import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type {
  TransitionProtocolValue,
  WorkspaceAuthoringView,
  WorkspaceReconciliationPreparation,
} from '@t3x-dev/api-client';
import {
  account,
  authoringScopes,
  invoke,
  type Mcp,
  mcpClient,
  mintDirect,
  type PreparedReview,
  registerDirect,
} from '../fixtures/mcp-qualification';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.skip(
  process.env.T3X_E2E_AUTH_ENABLED !== '1' ||
    process.env.T3X_E2E_MCP_PHASE !== 'workspace-reconciliation',
  'Requires the isolated authentication-enabled MCP Workspace reconciliation phase.'
);

test('reconcile concurrent Draft edits against exact advancing branch heads', async ({
  request,
}) => {
  test.setTimeout(120000);
  const owner = await registerDirect(request, account('reconcile'));
  const [remoteOwner, discardOwner] = await Promise.all([
    registerDirect(request, account('upstream')),
    registerDirect(request, account('discard')),
  ]);
  const { project_id } = await owner.actor<{ project_id: string }>('POST', '/projects', {
    name: 'MCP Workspace Reconciliation',
  });
  for (const collaborator of [remoteOwner, discardOwner]) {
    const { id } = await collaborator.actor<{ id: string }>('GET', '/auth/me');
    await owner.actor('PUT', `/projects/${project_id}/guests`, {
      principal: { kind: 'human', principal_id: id },
      role: 'editor',
      expires_at: null,
    });
  }
  const material = await owner.evidence(project_id);
  const key = await mintDirect(owner.actor, project_id, authoringScopes);
  const profile =
    'read-only,workspace,workspace:write,transitions,transitions:prepare,decision:accept,commit';
  const human = mcpClient(owner.session, profile);
  const remote = mcpClient(remoteOwner.session, profile);
  const discarder = mcpClient(discardOwner.session, 'workspace,workspace:write');
  const agent = mcpClient(key.key, 'workspace,workspace:write');
  const read = (workspace_id: string, client = human) =>
    invoke<WorkspaceAuthoringView>(client, 't3x_query', {
      target: 'workspace_activity',
      project_id,
      id: workspace_id,
    });
  const edit = (
    workspace_id: string,
    version: WorkspaceAuthoringView,
    path: string,
    value: TransitionProtocolValue
  ) => ({
    mode: 'draft',
    project_id,
    workspace_id,
    request_id: randomUUID(),
    expected_workspace_revision: version.workspaceRevision,
    expected_revision: version.compositionRevision,
    expected_ref_head: version.basis.refHead,
    operations: [{ set: { path, value } }],
  });
  const open = async (
    workspace_id: string,
    head: string | null,
    client = human,
    actor = owner.actor
  ) => {
    const { workspace } = await actor<{ workspace: { revision: number } }>(
      'PATCH',
      `/projects/${project_id}/workspaces/${workspace_id}`,
      {
        workspace: {
          id: workspace_id,
          title: workspace_id,
          status: 'draft',
          targetBranch: 'main',
          baseCommitHash: head,
          sourceBundle: [
            {
              id: `material:${material.id}`,
              type: 'document',
              title: 'core-loop-evidence.txt',
              materialId: material.id,
              contentHash: material.content_hash,
            },
          ],
          schemaBindings: [
            { canonicalName: 't3x/prd', version: 'v2', mode: 'pinned', rootKey: 'prd' },
          ],
        },
      }
    );
    await invoke(client, 't3x_edit', {
      mode: 'initialize_draft',
      project_id,
      workspace_id,
      request_id: randomUUID(),
      expected_workspace_revision: workspace.revision,
      expected_ref_head: head,
    });
    return read(workspace_id, client);
  };
  const prepare = (workspace_id: string, version: WorkspaceAuthoringView, client = human) =>
    invoke<PreparedReview>(client, 't3x_draft_review', {
      action: 'prepare',
      project_id,
      workspace_id,
      request_id: randomUUID(),
      expected_workspace_revision: version.workspaceRevision,
      expected_revision: version.compositionRevision,
      expected_ref_head: version.basis.refHead,
    });
  const commit = async (review: PreparedReview, expected_head: string | null, client = human) => {
    const transition = { project_id, transition_id: review.view.transition_id };
    const decision = await invoke<{ decision_digest: string }>(client, 'decide_transition', {
      ...transition,
      request_id: randomUUID(),
      outcome: 'accepted',
      precondition: review.view.precondition,
    });
    return (
      await invoke<{ commit_digest: string }>(client, 'commit_transition', {
        ...transition,
        request_id: randomUUID(),
        decision_digest: decision.decision_digest,
        expected_head,
      })
    ).commit_digest;
  };
  const upstream = 'reconciliation-upstream';
  const advance = async (path: string, value: TransitionProtocolValue) => {
    const before = await read(upstream, remote);
    await invoke(remote, 't3x_edit', edit(upstream, before, path, value));
    return commit(
      await prepare(upstream, await read(upstream, remote), remote),
      before.basis.refHead,
      remote
    );
  };
  const sync = (workspace_id: string, version: WorkspaceAuthoringView, head: string) => ({
    project_id,
    workspace_id,
    expected_workspace_revision: version.workspaceRevision,
    expected_ref_head: head,
  });
  const preview = (
    workspace_id: string,
    version: WorkspaceAuthoringView,
    head: string,
    client = agent
  ) =>
    invoke<WorkspaceReconciliationPreparation>(client, 't3x_edit', {
      ...sync(workspace_id, version, head),
      mode: 'sync_preview',
      request_id: randomUUID(),
    });
  const decideSync = (
    workspace_id: string,
    preparation: WorkspaceReconciliationPreparation,
    mode: string
  ) => ({
    project_id,
    workspace_id,
    mode,
    request_id: randomUUID(),
    expected_workspace_revision: preparation.workspaceRevision,
    expected_ref_head: preparation.currentRefHead,
    preparation_digest: preparation.preparationDigest,
  });
  const expectError = (wire: Awaited<ReturnType<Mcp['call']>>, code: string) => {
    expect(wire.isError).toBe(true);
    expect(JSON.parse(wire.content[0]?.text ?? '{}')).toMatchObject({
      error: { status: 409, code },
    });
  };

  try {
    await Promise.all([human.connect(), agent.connect(), remote.connect(), discarder.connect()]);
    await open(upstream, null, remote, remoteOwner.actor);
    const basePrd = {
      title: 'V1 fixture',
      summary: {
        problem: 'Verify the core loop',
        audience: 'Fixture users',
        outcome: 'An exact Commit',
      },
      requirements: {
        core: {
          title: 'Complete the loop',
          priority: 'must',
          acceptance: ['Read the fixed Commit'],
        },
      },
    };
    const base = await advance('prd', basePrd);
    const local = 'reconciliation-local';
    const initial = await open(local, base);
    const racedEdits = ['Human Draft problem', 'Agent Draft problem'];
    const conflictPath = 'prd/summary/problem';
    const race = await Promise.all(
      [human, agent].map((client, index) =>
        client.call('t3x_edit', edit(local, initial, conflictPath, racedEdits[index]!))
      )
    );
    const loser = race.filter(({ isError }) => isError);
    expect(loser).toHaveLength(1);
    expectError(loser[0]!, 'DRAFT_CONFLICT');
    const problem = racedEdits[race.findIndex(({ isError }) => !isError)]!;
    const afterRace = await read(local, agent);
    expect(afterRace).toMatchObject({
      workspaceRevision: initial.workspaceRevision + 1,
      compositionRevision: initial.compositionRevision + 1,
      current: { prd: { ...basePrd, summary: { ...basePrd.summary, problem } } },
      actions: [
        expect.objectContaining({ operations: [{ set: { path: conflictPath, value: problem } }] }),
      ],
    });

    const beforeAdvance = await prepare(local, afterRace);
    const firstHead = await advance('prd/summary/outcome', 'Branch outcome');
    const behind = await read(local, agent);
    expect(behind).toMatchObject({
      basis: { refHead: base },
      synchronization: { required: true, currentRefHead: firstHead },
      current: afterRace.current,
    });
    expectError(
      await human.call('decide_transition', {
        project_id,
        transition_id: beforeAdvance.view.transition_id,
        request_id: randomUUID(),
        outcome: 'accepted',
        precondition: beforeAdvance.view.precondition,
      }),
      'CONFLICT'
    );
    const stale = await preview(local, behind, firstHead);
    expect(stale).toMatchObject({
      baseHead: base,
      currentRefHead: firstHead,
      conflicts: [],
      ours: { prd: { summary: { problem } } },
      theirs: { prd: { summary: { outcome: 'Branch outcome' } } },
    });
    const nextHead = await advance('prd/summary/audience', 'Branch audience');
    expectError(
      await agent.call('t3x_edit', decideSync(local, stale, 'sync_adopt')),
      'DRAFT_CONFLICT'
    );
    const stillBehind = await read(local, agent);
    expect(stillBehind).toMatchObject({
      workspaceRevision: behind.workspaceRevision,
      current: behind.current,
    });

    const ready = await preview(local, stillBehind, nextHead);
    const cancel = decideSync(local, ready, 'sync_cancel');
    expect(await invoke(agent, 't3x_edit', cancel)).toMatchObject({ kind: 'cancelled' });
    expect(await invoke(agent, 't3x_edit', cancel)).toMatchObject({ kind: 'reused' });
    const cancelled = await read(local, agent);
    expect(cancelled).toMatchObject({ basis: { refHead: base }, current: stillBehind.current });
    const merged = {
      prd: {
        ...basePrd,
        summary: { problem, outcome: 'Branch outcome', audience: 'Branch audience' },
      },
    };
    const pending = await preview(local, cancelled, nextHead);
    expect(pending).toMatchObject({ merged, conflicts: [] });
    expect(await invoke(agent, 't3x_edit', decideSync(local, pending, 'sync_adopt'))).toMatchObject(
      { kind: 'reconciled' }
    );
    expect(await read(local, agent)).toMatchObject({
      current: merged,
      basis: { refHead: nextHead },
      synchronization: { required: false },
    });

    const discard = 'reconciliation-discard';
    const discardDraft = await open(discard, nextHead, discarder, discardOwner.actor);
    await invoke(
      discarder,
      't3x_edit',
      edit(discard, discardDraft, conflictPath, 'Discarded problem')
    );
    const conflictHead = await advance(conflictPath, 'Branch problem');
    const conflicts = await preview(local, await read(local, agent), conflictHead);
    expect(conflicts.conflicts).toHaveLength(1);
    expect(conflicts.conflicts[0]).toMatchObject({
      path: `/${conflictPath}`,
      base: { value: basePrd.summary.problem },
      ours: { value: problem },
      theirs: { value: 'Branch problem' },
    });
    expectError(
      await agent.call('t3x_edit', decideSync(local, conflicts, 'sync_adopt')),
      'WORKSPACE_RECONCILIATION_CONFLICT'
    );
    const resolve = {
      ...decideSync(local, conflicts, 'sync_resolve'),
      resolutions: [{ conflict_id: conflicts.conflicts[0]!.id, choice: 'ours' }],
    };
    expectError(
      await agent.call('t3x_edit', {
        ...resolve,
        request_id: randomUUID(),
        resolutions: [{ conflict_id: conflicts.conflicts[0]!.id, choice: 'custom', value: 42 }],
      }),
      'WORKSPACE_RECONCILIATION_VALIDATION_FAILED'
    );
    expect(await read(local, agent)).toMatchObject({
      workspaceRevision: conflicts.workspaceRevision,
      current: merged,
    });
    expect(await invoke(agent, 't3x_edit', resolve)).toMatchObject({ kind: 'resolved' });
    const resolved = await read(local, agent);
    expect(resolved).toMatchObject({
      current: merged,
      basis: { refHead: conflictHead },
      synchronization: { required: false },
    });

    const discarded = await preview(
      discard,
      await read(discard, discarder),
      conflictHead,
      discarder
    );
    expect(
      await invoke(discarder, 't3x_edit', decideSync(discard, discarded, 'sync_discard'))
    ).toMatchObject({ kind: 'discarded' });
    expect(await read(discard, discarder)).toMatchObject({
      current: discarded.theirs,
      basis: { refHead: conflictHead },
      hasChanges: false,
    });

    const fresh = await prepare(local, resolved);
    expect(fresh.view.precondition.ref_head).toBe(conflictHead);
    expect(fresh.review.snapshot_digest).not.toBe(beforeAdvance.review.snapshot_digest);
    const commit_digest = await commit(fresh, conflictHead);
    expect(
      await invoke(human, 't3x_committed_state', { action: 'read', project_id, commit_digest })
    ).toMatchObject({ value: merged });
  } finally {
    await Promise.allSettled([human.close(), agent.close(), remote.close(), discarder.close()]);
  }
});

test('edit and remove a relation in a saved semantic Draft through stdio', async ({ request }) => {
  const owner = await registerDirect(request, account('relations'));
  const { project_id } = await owner.actor<{ project_id: string }>('POST', '/projects', {
    name: 'MCP Semantic Draft Relations',
  });
  const base = await owner.actor<{ commit: { digest: string } }>('POST', '/commits', {
    project_id,
    expected_head: null,
    content: {
      trees: [
        { key: 'editing', slots: { title: 'Edit the document' }, children: [] },
        { key: 'review', slots: { title: 'Review the document' }, children: [] },
      ],
      relations: [],
    },
  });
  const key = await mintDirect(owner.actor, project_id, authoringScopes);
  const agent = mcpClient(key.key, 'state,workspace,workspace:write');
  try {
    await agent.connect();
    const head = base.commit.digest;
    const { workspace_id } = await invoke<{ workspace_id: string }>(agent, 't3x_open_workspace', {
      project_id,
      ref: 'main',
      expected_head: head,
      request_id: randomUUID(),
    });
    const activity = () =>
      invoke<WorkspaceAuthoringView>(agent, 't3x_query', {
        project_id,
        target: 'workspace_activity',
        id: workspace_id,
      });
    const readRelations = () =>
      invoke(agent, 't3x_query', {
        project_id,
        target: 'workspace_activity',
        id: workspace_id,
        path: '/content/relations',
      });
    const setRelations = async (value: TransitionProtocolValue) => {
      const version = await activity();
      return invoke(agent, 't3x_edit', {
        project_id,
        workspace_id,
        mode: 'draft',
        request_id: randomUUID(),
        expected_workspace_revision: version.workspaceRevision,
        expected_revision: version.compositionRevision,
        expected_ref_head: head,
        operations: [{ set: { path: 'content/relations', value } }],
      });
    };
    const relation = { from: 'review', to: 'editing', type: 'depends_on' };
    expect(await readRelations()).toMatchObject({ found: true, value: [] });
    expect(await setRelations([relation])).toMatchObject({
      kind: 'published',
      compositionRevision: 1,
    });
    expect(await readRelations()).toMatchObject({ found: true, value: [relation] });
    expect(
      await invoke(agent, 't3x_committed_state', {
        project_id,
        action: 'read',
        commit_digest: head,
      })
    ).toMatchObject({ value: { content: { relations: [] } } });
    expect(await setRelations([])).toMatchObject({ kind: 'published', compositionRevision: 2 });
    expect(await readRelations()).toMatchObject({ found: true, value: [] });
  } finally {
    await agent.close();
  }
});
