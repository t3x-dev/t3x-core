import { createHash, randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import {
  account,
  type ApiCall,
  authoringScopes,
  type Credential,
  denied,
  type DraftVersion,
  invoke,
  type Mcp,
  mcpClient,
  mintBrowser,
  mintDirect,
  type PreparedReview,
  registerBrowser,
  registerDirect,
  revokeBrowser,
  selectedScopes,
} from '../fixtures/mcp-qualification';

const authEnabled = process.env.T3X_E2E_AUTH_ENABLED === '1';
const qualificationPhase = process.env.T3X_E2E_MCP_PHASE;

function policyFor(agent: Credential) {
  const any = { mode: 'any' };
  const claim = {
    allowedModes: ['authored', 'inferred', 'stated', 'unspecified'],
    minimumEvidence: 0,
    humanConfirmation: 'not_required',
  };
  const allow = { issuers: any, tools: any, environments: any };
  return {
    schema: 't3x.dev/acceptance-policy/v1',
    version: 1,
    authorization: {
      decide: {
        actors: { mode: 'one_of', values: [{ kind: 'agent', id: `agent:api-key:${agent.id}` }] },
      },
      override: {
        actors: { mode: 'one_of', values: [{ kind: 'human', id: 'user:no-override-fixture' }] },
      },
      allowSelfApproval: false,
    },
    claims: { intent: claim, rationale: claim },
    checks: {
      replay: allow,
      validation: { ...allow, requirement: 'optional', profiles: any, schemas: any, contexts: any },
      humanConfirmation: { issuers: any },
    },
    override: {
      allowClaimFailures: false,
      allowFailedValidation: false,
      allowMissingHumanConfirmation: false,
      allowMissingValidation: false,
    },
  };
}

async function qualifyCore(input: {
  actor: ApiCall;
  operatorSession: string;
  namespace: string;
  outsiderSession: string;
  issue: (id: string) => Promise<Credential>;
  evidence: (id: string) => Promise<{ id: string; content_hash: string }>;
  web?: Page;
}) {
  const repo = 'Core-loop-fixture';
  const { project_id } = await input.actor<{ project_id: string }>('POST', '/projects', {
    name: repo,
    namespace: input.namespace,
  });
  const projectUrl = `/projects/${project_id}`;
  const agent = await input.issue(project_id);
  const otherKey = await mintDirect(input.actor, project_id, authoringScopes);
  const [
    human,
    machine,
    outsider,
    limited,
    readonly,
    delivery,
    deliveryReader,
    rollback,
    foreignDelivery,
  ] = [
    mcpClient(input.operatorSession),
    mcpClient(agent.key),
    mcpClient(input.outsiderSession),
    mcpClient(otherKey.key),
    mcpClient(agent.key, 'read-only'),
    mcpClient(agent.key, 'delivery,delivery:prepare,delivery:deploy'),
    mcpClient(input.operatorSession, 'delivery'),
    mcpClient(agent.key, 'delivery:rollback'),
    mcpClient(input.outsiderSession, 'delivery:deploy,delivery:rollback'),
  ];
  try {
    await Promise.all(
      [
        human,
        machine,
        outsider,
        limited,
        readonly,
        delivery,
        deliveryReader,
        rollback,
        foreignDelivery,
      ].map((client) => client.connect())
    );
    expect((await readonly.list()).tools.map(({ name }) => name)).not.toContain('t3x_commit');
    await denied(readonly, 't3x_query', { target: 'workspace_activity', project_id, id: 'hidden' });
    await expect(
      readonly.readResource(`t3x://projects/${project_id}/workspaces/hidden`)
    ).rejects.toThrow();
    const context = await invoke<{ actor_kind: string; project_id: string }>(
      machine,
      't3x_context',
      {}
    );
    expect(context).toMatchObject({ actor_kind: 'agent', project_id });
    expect(await invoke(human, 't3x_context', {})).toMatchObject({ actor_kind: 'human' });

    const repository = `${input.namespace}/${repo}`;
    const branch = (client: Mcp, ref: string) =>
      invoke<{ head_commit_hash: string | null; canonical_path: string }>(
        client,
        't3x_resolve_repository',
        { repository, ref }
      );
    const empty = await branch(machine, 'main');
    expect(empty.head_commit_hash).toBeNull();
    await denied(outsider, 't3x_resolve_repository', { repository, ref: 'main' });

    // Pin the first Schema through the existing human Web Workspace entry on the empty ref.
    const material = await input.evidence(project_id);
    const workspace_id = 'core-first-schema';
    const workspaceUrl = `${projectUrl}/workspaces/${workspace_id}`;
    const created = await input.actor<{ workspace: { revision: number } }>('PATCH', workspaceUrl, {
      workspace: {
        id: workspace_id,
        title: 'First Schema',
        targetBranch: 'main',
        status: 'draft',
        baseCommitHash: null,
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
          {
            canonicalName: 't3x/prd',
            version: 'v2',
            mode: 'pinned',
            rootKey: 'prd',
          },
        ],
        yopsDraft: { id: 'core-first-draft', operations: [] },
      },
    });
    await input.actor('POST', `${workspaceUrl}/authoring`, {
      request_id: randomUUID(),
      expected_workspace_revision: created.workspace.revision,
      expected_ref_head: null,
    });

    const activity = (id: string) =>
      invoke<DraftVersion>(human, 't3x_query', { target: 'workspace_activity', project_id, id });
    const exactDraft = (draft: DraftVersion) => ({
      expected_workspace_revision: draft.workspaceRevision,
      expected_revision: draft.compositionRevision,
      expected_ref_head: draft.basis.refHead,
    });
    const prepare = async (id: string, client = human) =>
      invoke<PreparedReview>(client, 't3x_draft_review', {
        action: 'prepare',
        project_id,
        workspace_id: id,
        request_id: randomUUID(),
        ...exactDraft(await activity(id)),
      });
    const machineSchema = await machine.call('t3x_edit', {
      mode: 'schema',
      project_id,
      workspace_id,
      request_id: randomUUID(),
      ...exactDraft(await activity(workspace_id)),
      schema_settings: {
        action: 'add_node',
        nodePath: '',
        name: 'disallowed',
        definition: {},
        intent: 'Fixture negative human-only check',
      },
    });
    expect(machineSchema.isError).toBe(true);
    expect(machineSchema.content[0]?.text).toContain('human principal');
    const firstReview = await prepare(workspace_id);
    const decideArgs = (review: PreparedReview, outcome: 'accepted' | 'rejected') => ({
      project_id,
      transition_id: review.view.transition_id,
      request_id: randomUUID(),
      outcome,
      precondition: review.view.precondition,
    });
    const fromSnapshot = await invoke<{ snapshot_digest: string }>(human, 't3x_draft_review', {
      action: 'read',
      project_id,
      workspace_id,
      snapshot_id: firstReview.review.snapshot_id,
    });
    expect(fromSnapshot.snapshot_digest).toBe(firstReview.review.snapshot_digest);
    await denied(machine, 'decide_transition', decideArgs(firstReview, 'accepted'));
    let initialCommit: string | null;
    if (input.web) {
      const page = input.web;
      await page.goto(`${empty.canonical_path}/reviews/${firstReview.review.address_number}`);
      const confirmation = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes('/transition/decide')
      );
      await page.getByRole('button', { name: 'Approve and commit', exact: true }).click();
      expect((await confirmation).ok()).toBe(true);
      initialCommit = (await branch(human, 'main')).head_commit_hash;
    } else {
      const accepted = await invoke<{ decision_digest: string }>(
        human,
        'decide_transition',
        decideArgs(firstReview, 'accepted')
      );
      expect((await branch(human, 'main')).head_commit_hash).toBeNull();
      const result = await invoke<{ commit_digest: string }>(human, 'commit_transition', {
        project_id,
        transition_id: firstReview.view.transition_id,
        request_id: randomUUID(),
        decision_digest: accepted.decision_digest,
        expected_head: null,
      });
      initialCommit = result.commit_digest;
    }
    expect(initialCommit).toMatch(/^sha256:/);

    // Only this isolated fixture ref gets a policy that permits machine Decision.
    const ref = 'machine-qualification';
    await input.actor('POST', '/branches', {
      project_id,
      name: ref,
      parent_branch: 'main',
      head_commit_hash: initialCommit,
    });
    await input.actor('PUT', `${projectUrl}/transition-policy-binding`, {
      ref_name: ref,
      uri: 't3x://policies/mcp-core-qualification/v1',
      policy: policyFor(agent),
    });
    const open = { project_id, ref, expected_head: initialCommit };
    const [one, two] = await Promise.all(
      [human, machine].map((client) =>
        invoke<{ workspace_id: string }>(client, 't3x_open_workspace', {
          ...open,
          request_id: randomUUID(),
        })
      )
    );
    expect(one.workspace_id).toBe(two.workspace_id);

    const write = async (content: Record<string, unknown>) =>
      invoke(machine, 't3x_edit', {
        mode: 'draft',
        project_id,
        workspace_id: one.workspace_id,
        request_id: randomUUID(),
        ...exactDraft(await activity(one.workspace_id)),
        operations: [{ set: { path: 'prd', value: content } }],
      });
    const valid = {
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
    await write({
      ...valid,
      requirements: { core: { ...valid.requirements.core, priority: 'invalid-priority' } },
    });
    const invalid = await prepare(one.workspace_id);
    await denied(machine, 'decide_transition', decideArgs(invalid, 'accepted'));
    const rejection = await invoke(machine, 'decide_transition', decideArgs(invalid, 'rejected'));
    expect(rejection).toMatchObject({ decision: { predicate: { outcome: 'rejected' } } });
    expect((await branch(human, ref)).head_commit_hash).toBe(initialCommit);
    await write(valid);
    const selfReview = await prepare(one.workspace_id, machine);
    await denied(machine, 'decide_transition', decideArgs(selfReview, 'accepted'));
    const review = await prepare(one.workspace_id);
    const args = decideArgs(review, 'accepted');
    await denied(limited, 'decide_transition', args);
    const decision = await invoke<{ decision_digest: string }>(machine, 'decide_transition', args);
    expect((await branch(human, ref)).head_commit_hash).toBe(initialCommit);
    const commitArgs = {
      project_id,
      transition_id: review.view.transition_id,
      request_id: randomUUID(),
      decision_digest: decision.decision_digest,
      expected_head: initialCommit,
    };
    await denied(limited, 'commit_transition', commitArgs);
    await denied(machine, 'commit_transition', {
      ...commitArgs,
      request_id: randomUUID(),
      expected_head: null,
    });
    const committed = await invoke<{ commit_digest: string }>(
      machine,
      'commit_transition',
      commitArgs
    );
    expect(await invoke(machine, 'commit_transition', commitArgs)).toMatchObject({
      reused: true,
      commit_digest: committed.commit_digest,
    });
    expect((await branch(human, ref)).head_commit_hash).toBe(committed.commit_digest);
    const bound = await invoke<{ schema_hash: string }>(machine, 't3x_committed_state', {
      action: 'schema_binding',
      project_id,
      commit_digest: committed.commit_digest,
    });
    expect(bound).toMatchObject({ status: 'bound', commit_digest: committed.commit_digest });
    const state = await invoke<{
      sourceState: { digest: string };
      value: Record<string, unknown>;
    }>(machine, 't3x_committed_state', {
      action: 'read',
      project_id,
      commit_digest: committed.commit_digest,
    });
    expect(state.value).toMatchObject({ prd: valid });
    const artifact = await invoke<{ content: string; byteDigest: string; byteLength: number }>(
      machine,
      't3x_committed_state',
      {
        action: 'export',
        project_id,
        commit_digest: committed.commit_digest,
        state_digest: state.sourceState.digest,
        format: 'json',
      }
    );
    expect(JSON.parse(artifact.content)).toEqual(state.value);
    expect(artifact.byteLength).toBe(Buffer.byteLength(artifact.content, 'utf8'));
    expect(artifact.byteDigest).toBe(
      `sha256:${createHash('sha256').update(artifact.content, 'utf8').digest('hex')}`
    );
    const result = await invoke(machine, 't3x_commit_result', {
      project_id,
      transition_id: review.view.transition_id,
      commit_digest: committed.commit_digest,
    });
    expect(result).toMatchObject({
      commit: { digest: committed.commit_digest },
      branch: { head_commit_hash: committed.commit_digest },
    });
    const deliveryTool = 't3x_workspace_delivery';
    const listArgs = { action: 'list', project_id, workspace_id: one.workspace_id };
    const deliveryState = await invoke<{
      workspace_revision: number;
      commit_digest: string;
      targets: { id: string }[];
    }>(deliveryReader, deliveryTool, listArgs);
    expect(deliveryState.commit_digest).toBe(committed.commit_digest);
    expect(deliveryState.targets.map((t) => t.id)).toContain('t3x:portable-artifact');
    const prepareArgs = {
      ...listArgs,
      action: 'prepare',
      request_id: randomUUID(),
      workspace_revision: deliveryState.workspace_revision,
      commit_digest: committed.commit_digest,
    };
    await denied(deliveryReader, deliveryTool, prepareArgs);
    const portable = await invoke<{
      receipt: { id: string; artifactDigest: string; status: string };
      artifact: {
        sourceCommit: { digest: string };
        schemaDigest: string;
        content: string;
        byteLength: number;
        byteDigest: string;
      };
    }>(delivery, deliveryTool, prepareArgs);
    expect(portable.receipt.status).toBe('prepared');
    expect(portable.artifact.schemaDigest).toBe(bound.schema_hash);
    expect(portable.artifact.sourceCommit.digest).toBe(committed.commit_digest);
    expect(portable.artifact.byteLength).toBe(Buffer.byteLength(portable.artifact.content));
    expect(portable.artifact.byteDigest).toBe(
      'sha256:' + createHash('sha256').update(portable.artifact.content).digest('hex')
    );
    expect(portable.receipt.artifactDigest).toBe(portable.artifact.byteDigest);
    expect(await invoke(deliveryReader, deliveryTool, listArgs)).toMatchObject({
      receipts: [expect.objectContaining({ id: portable.receipt.id })],
    });
    await denied(delivery, deliveryTool, {
      ...prepareArgs,
      workspace_revision: deliveryState.workspace_revision + 1,
    });
    await denied(delivery, deliveryTool, {
      ...prepareArgs,
      workspace_id,
      request_id: randomUUID(),
    });
    const deployArgs = {
      ...listArgs,
      action: 'deploy',
      request_id: randomUUID(),
      delivery_id: portable.receipt.id,
    };
    await denied(deliveryReader, deliveryTool, deployArgs);
    await denied(rollback, deliveryTool, deployArgs);
    await denied(foreignDelivery, deliveryTool, deployArgs);
    await denied(delivery, deliveryTool, { ...deployArgs, environment: 'production' });
    const first = await invoke<{ deployment: { id: string } }>(delivery, deliveryTool, deployArgs);
    expect(await invoke(delivery, deliveryTool, deployArgs)).toEqual(first);
    // Two fixed Reviews observe one basis. Advancing it invalidates the loser.
    await write({
      ...valid,
      summary: { ...valid.summary, outcome: 'Keep the previous Commit readable' },
    });
    const losingReview = await prepare(one.workspace_id);
    const winningReview = await prepare(one.workspace_id);
    const winningDecision = await invoke<{ decision_digest: string }>(
      machine,
      'decide_transition',
      decideArgs(winningReview, 'accepted')
    );
    const advanced = await invoke<{ commit_digest: string }>(machine, 'commit_transition', {
      project_id,
      transition_id: winningReview.view.transition_id,
      request_id: randomUUID(),
      decision_digest: winningDecision.decision_digest,
      expected_head: committed.commit_digest,
    });
    expect(advanced.commit_digest).not.toBe(committed.commit_digest);
    expect(await invoke(delivery, deliveryTool, prepareArgs)).toEqual(portable);
    await denied(delivery, deliveryTool, { ...prepareArgs, request_id: randomUUID() });
    const latest = await invoke<{ workspace_revision: number }>(
      deliveryReader,
      deliveryTool,
      listArgs
    );
    const next = await invoke<typeof portable>(delivery, deliveryTool, {
      ...prepareArgs,
      commit_digest: advanced.commit_digest,
      workspace_revision: latest.workspace_revision,
      request_id: randomUUID(),
    });
    expect(next.artifact.byteDigest).not.toBe(portable.artifact.byteDigest);
    await denied(delivery, deliveryTool, { ...deployArgs, delivery_id: next.receipt.id });
    const second = await invoke<{ deployment: { id: string } }>(delivery, deliveryTool, {
      ...deployArgs,
      delivery_id: next.receipt.id,
      request_id: randomUUID(),
    });
    expect(second.deployment).toMatchObject({
      previousArtifactDigest: portable.artifact.byteDigest,
      actualArtifactDigest: next.artifact.byteDigest,
    });
    const rollbackArgs = {
      ...listArgs,
      action: 'rollback',
      deployment_id: first.deployment.id,
      request_id: randomUUID(),
    };
    await denied(delivery, deliveryTool, rollbackArgs);
    await denied(foreignDelivery, deliveryTool, rollbackArgs);
    await denied(rollback, deliveryTool, { ...rollbackArgs, deployment_id: randomUUID() });
    const restored = await invoke<{ deployment: { id: string } }>(
      rollback,
      deliveryTool,
      rollbackArgs
    );
    expect(restored.deployment).toMatchObject({
      kind: 'rollback',
      previousArtifactDigest: next.artifact.byteDigest,
      desiredArtifactDigest: portable.artifact.byteDigest,
      actualArtifactDigest: portable.artifact.byteDigest,
    });
    expect(await invoke(rollback, deliveryTool, rollbackArgs)).toEqual(restored);
    expect(await invoke(deliveryReader, deliveryTool, listArgs)).toMatchObject({
      current_deployment: restored.deployment,
      deployments: [restored.deployment, second.deployment, first.deployment],
    });
    await denied(machine, 'decide_transition', decideArgs(losingReview, 'accepted'));
    const historical = await invoke(machine, 't3x_commit_result', {
      project_id,
      transition_id: review.view.transition_id,
      commit_digest: committed.commit_digest,
    });
    expect(historical).toMatchObject({
      commit: { digest: committed.commit_digest },
      branch: { head_commit_hash: advanced.commit_digest },
    });
    if (input.web) {
      await revokeBrowser(input.web);
    } else {
      await input.actor('DELETE', `/api-keys/${agent.id}`);
    }
    const revoked = await machine.call('t3x_context', {});
    expect(revoked.isError).toBe(true);
    expect(JSON.parse(revoked.content[0]?.text ?? '{}')).toMatchObject({ error: { status: 401 } });
    await input.actor('DELETE', `/api-keys/${otherKey.id}`);
  } finally {
    await Promise.allSettled(
      [
        human,
        machine,
        outsider,
        limited,
        readonly,
        delivery,
        deliveryReader,
        rollback,
        foreignDelivery,
      ].map((client) => client.close())
    );
  }
}

// Issuance returns a one-time key. Playwright artifacts must never capture it.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test.describe('MCP core qualification', () => {
  test.skip(!authEnabled, 'Requires the isolated authentication-enabled stack.');

  test('isolated API credentials and real stdio', async ({ request }) => {
    test.skip(qualificationPhase !== 'api', 'Run the API phase on a fresh qualification stack.');
    test.setTimeout(120000);
    const owner = account('direct');
    const [person, outsider] = await Promise.all([
      registerDirect(request, owner),
      registerDirect(request, account('outsider')),
    ]);
    await qualifyCore({
      ...person,
      operatorSession: person.session,
      namespace: owner.namespace,
      outsiderSession: outsider.session,
      issue: (id) => mintDirect(person.actor, id),
    });
  });

  test('Web-issued Agent credential and trusted Web confirmation', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(qualificationPhase !== 'web', 'Run the Web phase on a fresh qualification stack.');
    test.setTimeout(120000);
    const owner = account('web');
    const person = await registerBrowser(page, owner);
    const outsider = await registerDirect(request, account('other'));
    await qualifyCore({
      ...person,
      operatorSession: person.session,
      namespace: owner.namespace,
      outsiderSession: outsider.session,
      issue: (id) => mintBrowser(page, id, testInfo.outputPath('agent-token-form.png')),
      web: page,
    });
  });
});
