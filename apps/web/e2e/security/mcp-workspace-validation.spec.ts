import { createHash, randomUUID } from 'node:crypto';
import type { WorkspaceValidationDetails } from '@t3x-dev/api-client';
import { expect, test } from '@playwright/test';
import { API_BASE } from '../fixtures/api-helpers';
import {
  account,
  authoringScopes,
  invoke,
  mcpClient,
  mintDirect,
  registerDirect,
} from '../fixtures/mcp-qualification';

const tool = 't3x_workspace_validation';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.skip(
  process.env.T3X_E2E_AUTH_ENABLED !== '1' ||
    process.env.T3X_E2E_MCP_PHASE !== 'workspace-validation',
  'Requires the isolated authentication-enabled MCP Workspace validation phase.'
);

test('pin an authoring Draft validation and restrict its evidence to the Workspace owner', async ({
  request,
}) => {
  const { actor, session } = await registerDirect(request, account('validateowner'));
  const other = await registerDirect(request, account('validateother'));
  const { id: otherId } = await other.actor<{ id: string }>('GET', '/auth/me');
  const { project_id } = await actor<{ project_id: string }>('POST', '/projects', {
    name: 'Private Workspace Validation Fixture',
  });
  await actor('PUT', `/projects/${project_id}/guests`, {
    principal: { kind: 'human', principal_id: otherId },
    role: 'editor',
    expires_at: null,
  });
  const workspace_id = 'validation-fixture';
  const scope = { project_id, workspace_id };
  const workspace = `/projects/${project_id}/workspaces/${workspace_id}`;
  const created = await actor<{ workspace: { revision: number } }>('PATCH', workspace, {
    workspace: {
      id: workspace_id,
      title: 'Validation fixture',
      targetBranch: 'main',
      status: 'draft',
      device: { esphome: { name: 'legacy-device' } },
    },
  });
  const legacy = await actor<WorkspaceValidationDetails>(
    'POST',
    `${workspace}/validation-runs`,
    {}
  );
  const document = { device: { esphome: { name: 'authored-device' } } };
  const revision = await actor<{ workspaceRevision: number; compositionRevision: number }>(
    'POST',
    `${workspace}/authoring`,
    {
      request_id: randomUUID(),
      expected_workspace_revision: created.workspace.revision,
      expected_ref_head: null,
      legacy_document: document,
    }
  );
  const key = await mintDirect(actor, project_id, authoringScopes);
  const agent = mcpClient(key.key, 'runs:workspace,runs:workspace:trigger');
  const reader = mcpClient(session, 'runs:workspace');
  const foreign = mcpClient(other.session, 'runs:workspace,runs:workspace:trigger');
  const foreignRequest = (method: string, path: string, data?: Record<string, unknown>) =>
    request.fetch(`${API_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${other.session}` },
      data,
    });
  const runInput = {
    ...scope,
    action: 'run',
    expected_workspace_revision: revision.workspaceRevision,
    expected_composition_revision: revision.compositionRevision,
  };
  const badInput = async (input: Record<string, unknown>, status: number) => {
    const result = await agent.call(tool, input);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0]?.text ?? '{}')).toMatchObject({ error: { status } });
  };
  try {
    await Promise.all([agent.connect(), reader.connect(), foreign.connect()]);
    expect((await reader.call(tool, runInput)).isError).toBe(true);
    await badInput({ ...runInput, expected_workspace_revision: created.workspace.revision }, 409);
    await badInput(
      { ...runInput, expected_composition_revision: revision.compositionRevision + 1 },
      409
    );
    const { expected_composition_revision: _composition, ...missingComposition } = runInput;
    await badInput(missingComposition, 400);
    const details = await invoke<WorkspaceValidationDetails>(agent, tool, runInput);
    const hash = createHash('sha256').update(JSON.stringify(document.device)).digest('hex');
    expect(details).toMatchObject({
      run: {
        ...scope,
        subject_hash: `sha256:${hash}`,
        input_hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        status: 'environment_required',
        result_json: {
          draft_revision: {
            workspace_revision: revision.workspaceRevision,
            composition_revision: revision.compositionRevision,
          },
        },
      },
      steps: [expect.objectContaining({ error_code: 'OCI_RUNTIME_MISSING' })],
      findings: [expect.objectContaining({ severity: 'error', code: 'OCI_RUNTIME_MISSING' })],
    });
    expect(details.run.result_json).not.toHaveProperty('private_workspace_owner');
    expect(details.run.subject_hash).not.toBe(legacy.run.subject_hash);
    await expect(
      invoke(reader, tool, { ...scope, action: 'read', run_id: details.run.id })
    ).resolves.toEqual(details);
    const deniedRead = await foreign.call(tool, {
      ...scope,
      action: 'read',
      run_id: details.run.id,
    });
    expect(deniedRead.isError).toBe(true);
    const deniedRun = await foreign.call(tool, runInput);
    expect(deniedRun.isError).toBe(true);
    expect((await foreignRequest('GET', `${workspace}/validation-runs/latest`)).status()).toBe(404);
    const runPath = `/workspace-validation-runs/${details.run.id}`;
    expect((await foreignRequest('GET', runPath)).status()).toBe(404);
    const checks = `/projects/${project_id}/checks`;
    const recordId = encodeURIComponent(`validation:${details.run.id}`);
    const own = await actor<{ address: string; payload: { details: WorkspaceValidationDetails } }>(
      'GET',
      `${checks}/${recordId}`
    );
    expect(own.payload.details).toEqual(details);
    for (const id of [recordId, own.address]) {
      expect((await foreignRequest('GET', `${checks}/${id}`)).status()).toBe(404);
    }
    const visible = await other.actor<{ records: Array<{ id: string }> }>(
      'GET',
      `${checks}?kind=validation&limit=1`
    );
    expect(visible.records.map(({ id }) => id)).toEqual([`validation:${legacy.run.id}`]);
    expect(
      (await foreignRequest('GET', `/workspace-validation-runs/${legacy.run.id}`)).status()
    ).toBe(200);
  } finally {
    await Promise.allSettled([agent.close(), reader.close(), foreign.close()]);
  }
});
