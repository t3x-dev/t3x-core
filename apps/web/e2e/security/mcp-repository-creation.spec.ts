import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  account,
  authoringScopes,
  denied,
  type DraftVersion,
  invoke,
  mcpClient,
  mintDirect,
  type PreparedReview,
  registerDirect,
} from '../fixtures/mcp-qualification';

const branchProfile =
  'read-only,branches:create,workspace,workspace:write,transitions,transitions:prepare,transitions:verify,decision:accept,commit,schemas';
const content = (title: string) => ({
  prd: {
    title,
    summary: {
      problem: 'Verify exact branch ancestry',
      audience: 'Fixture users',
      outcome: 'Read the historical branch Workspace',
    },
    requirements: {
      core: {
        title: 'Verify the inherited Draft',
        priority: 'must',
        acceptance: ['Use the original Commit'],
      },
    },
  },
});

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.skip(
  process.env.T3X_E2E_AUTH_ENABLED !== '1' || process.env.T3X_E2E_MCP_PHASE !== 'repositories',
  'Requires the isolated authenticated MCP repository qualification phase.'
);

test('MCP creates a repository, pins a branch Workspace and validates against an exact Schema release', async ({
  request,
}) => {
  test.setTimeout(120000);
  const identity = account('repos');
  const { actor, session, evidence } = await registerDirect(request, identity);
  const repository = mcpClient(session, 'repositories:create');
  const human = mcpClient(session, branchProfile);
  const projectArgs = { action: 'create_project', name: 'Exact-branch-fixture' };
  const clients = [repository, human];
  try {
    await Promise.all(clients.map((client) => client.connect()));
    const adminActions = async (client: typeof human) => {
      const { tools } = await client.list();
      return tools.find(({ name }) => name === 't3x_admin');
    };
    expect(await adminActions(repository)).toMatchObject({
      inputSchema: { properties: { action: { enum: ['create_project'] } } },
    });
    expect(await adminActions(human)).toMatchObject({
      inputSchema: { properties: { action: { enum: ['create_branch'] } } },
    });

    const { project_id, canonical_path } = await invoke<{
      project_id: string;
      canonical_path: string;
    }>(repository, 't3x_admin', projectArgs);
    expect(canonical_path.toLowerCase()).toBe(
      `/${identity.namespace}/${projectArgs.name}`.toLowerCase()
    );
    const projectUrl = `/projects/${project_id}`;
    const agent = await mintDirect(actor, project_id, authoringScopes);
    const machine = mcpClient(agent.key, 'repositories:write');
    clients.push(machine);
    await machine.connect();
    expect(await adminActions(machine)).toMatchObject({
      inputSchema: { properties: { action: { enum: ['create_project', 'create_branch'] } } },
    });
    const machineCreation = await machine.call('t3x_admin', {
      ...projectArgs,
      name: 'Forbidden-machine-fixture',
    });
    expect(machineCreation.isError).toBe(true);
    expect(JSON.parse(machineCreation.content[0]?.text ?? '{}')).toMatchObject({
      error: { status: 403 },
    });
    await denied(human, 't3x_admin', { ...projectArgs, name: 'Hidden-repository-action-fixture' });

    const workspace_id = 'fixture-main';
    const workspaceUrl = `${projectUrl}/workspaces/${workspace_id}`;
    const material = await evidence(project_id);
    const created = await actor<{ workspace: { revision: number } }>('PATCH', workspaceUrl, {
      workspace: {
        id: workspace_id,
        title: 'Main',
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
          { canonicalName: 't3x/prd', version: 'v2', mode: 'pinned', rootKey: 'prd' },
        ],
        yopsDraft: { id: 'fixture-main-draft', operations: [] },
      },
    });
    await actor('POST', `${workspaceUrl}/authoring`, {
      request_id: randomUUID(),
      expected_workspace_revision: created.workspace.revision,
      expected_ref_head: null,
    });

    const draftVersion = async () => {
      const view = await invoke<DraftVersion>(human, 't3x_query', {
        target: 'workspace_activity',
        project_id,
        id: workspace_id,
      });
      return {
        expected_workspace_revision: view.workspaceRevision,
        expected_revision: view.compositionRevision,
        expected_ref_head: view.basis.refHead,
      };
    };
    const commit = async (title: string, expectedHead: string | null) => {
      await invoke(human, 't3x_edit', {
        mode: 'draft',
        project_id,
        workspace_id,
        request_id: randomUUID(),
        ...(await draftVersion()),
        operations: [{ set: { path: 'prd', value: content(title).prd } }],
      });
      const review = await invoke<PreparedReview>(human, 't3x_draft_review', {
        action: 'prepare',
        project_id,
        workspace_id,
        request_id: randomUUID(),
        ...(await draftVersion()),
      });
      const { decision_digest } = await invoke<{ decision_digest: string }>(
        human,
        'decide_transition',
        {
          project_id,
          transition_id: review.view.transition_id,
          request_id: randomUUID(),
          outcome: 'accepted',
          precondition: review.view.precondition,
        }
      );
      return invoke<{ commit_digest: string }>(human, 'commit_transition', {
        project_id,
        transition_id: review.view.transition_id,
        request_id: randomUUID(),
        decision_digest,
        expected_head: expectedHead,
      });
    };
    const historical = await commit('Historical Draft', null);
    const advanced = await commit('Updated parent Draft', historical.commit_digest);
    expect(advanced.commit_digest).not.toBe(historical.commit_digest);

    const fork = {
      action: 'create_branch',
      project_id,
      name: 'feature/exact-history',
      parent_branch: 'main',
      head_commit_hash: historical.commit_digest,
    };
    await denied(repository, 't3x_admin', fork);
    const first = await invoke(human, 't3x_admin', fork);
    expect(first).toMatchObject({ head_commit_hash: historical.commit_digest });
    expect(await invoke(human, 't3x_admin', fork)).toEqual(first);
    const conflict = await human.call('t3x_admin', {
      ...fork,
      head_commit_hash: advanced.commit_digest,
    });
    expect(conflict.isError).toBe(true);
    expect(JSON.parse(conflict.content[0]?.text ?? '{}')).toMatchObject({ error: { status: 409 } });

    const forkWorkspace = { project_id, id: `workspace_branch:${encodeURIComponent(fork.name)}` };
    expect(
      await invoke(human, 't3x_query', { target: 'workspace', ...forkWorkspace })
    ).toMatchObject({
      workspace: {
        baseCommitHash: historical.commit_digest,
        targetBranch: fork.name,
        schemaBindings: [{ canonicalName: 't3x/prd', version: 'v2' }],
      },
    });
    expect(
      await invoke(human, 't3x_query', {
        target: 'workspace_activity',
        path: '/prd/title',
        ...forkWorkspace,
      })
    ).toMatchObject({
      found: true,
      value: 'Historical Draft',
      basis: { refHead: historical.commit_digest },
    });

    const other = await actor<{ project_id: string }>('POST', '/projects', {
      name: 'Unrelated-branch-fixture',
    });
    const foreign = await human.call('t3x_admin', { ...fork, project_id: other.project_id });
    expect(foreign.isError).toBe(true);
    expect(JSON.parse(foreign.content[0]?.text ?? '{}')).toMatchObject({ error: { status: 404 } });
    const untouched = await actor<{ branches: Array<{ name: string }> }>(
      'GET',
      `/branches?project_id=${other.project_id}`
    );
    expect(untouched.branches.map(({ name }) => name)).toEqual(['main']);

    const schema = { project_id, canonical_name: 't3x/prd' };
    const catalog = await invoke<{ items: Array<{ release: { hash: string; version: string } }> }>(
      human,
      't3x_schema_registry',
      { action: 'list', ...schema }
    );
    expect(catalog.items).not.toHaveLength(0);
    const release = catalog.items[0]!.release;
    const exact = { ...schema, version: release.version, artifact_hash: release.hash };
    const binding = await invoke<{ schema_hash: string }>(human, 't3x_committed_state', {
      action: 'schema_binding',
      project_id,
      commit_digest: historical.commit_digest,
    });
    const definition = await invoke(human, 't3x_schema_registry', {
      action: 'read',
      ...exact,
      schema_hash: binding.schema_hash,
    });
    expect(definition).toMatchObject({
      canonical_name: schema.canonical_name,
      version: release.version,
      artifact_hash: release.hash,
      schema_hash: binding.schema_hash,
      definition: { version: 'v2' },
    });
    const validationInput = { action: 'validate', ...exact, schema_hash: binding.schema_hash };
    const valid = content('Valid Schema fixture').prd;
    expect(
      await invoke(human, 't3x_schema_registry', {
        ...validationInput,
        content: valid,
      })
    ).toMatchObject({ validation: { valid: true } });
    expect(
      await invoke(human, 't3x_schema_registry', {
        ...validationInput,
        content: { ...valid, requirements: { core: { ...valid.requirements.core, title: null } } },
      })
    ).toMatchObject({
      validation: {
        valid: false,
        errors: expect.arrayContaining([
          expect.objectContaining({
            code: 'INVALID_TYPE',
            path: 'requirements/core/title',
            details: { actual: 'null', expected: 'string' },
          }),
        ]),
      },
    });
    await denied(human, 't3x_schema_registry', {
      ...exact,
      action: 'read',
      artifact_hash: `sha256:${'0'.repeat(64)}`,
    });
  } finally {
    await Promise.allSettled(clients.map((client) => client.close()));
  }
});
