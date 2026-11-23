import { createHash, randomUUID } from 'node:crypto';
import type { ProposeTransitionResult, VerifyTransitionResult } from '@t3x-dev/api-client';
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

function byteDigest(bytes: Buffer) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

interface Prepared {
  proposal: Record<string, unknown>;
  files: Array<{ path: string; material_id: string; content_hash: string; text_digest: string }>;
}

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.skip(
  process.env.T3X_E2E_AUTH_ENABLED !== '1' || process.env.T3X_E2E_MCP_PHASE !== 'source-artifact',
  'Requires the isolated authentication-enabled MCP exact-source phase.'
);

test('prepare exact-source selectors and preserve file bytes through import, edit and revert', async ({
  request,
}) => {
  test.setTimeout(120000);
  const { actor, session } = await registerDirect(request, account('artifact'));
  const { project_id } = await actor<{ project_id: string }>('POST', '/projects', {
    name: 'Exact Source Fixture',
  });
  const foreignProject = await actor<{ project_id: string }>('POST', '/projects', {
    name: 'Foreign Source Fixture',
  });
  const upload = async (project: string, name: string, mimeType: string, buffer: Buffer) => {
    const response = await request.post(`${API_BASE}/projects/${project}/materials/document`, {
      headers: { Authorization: `Bearer ${session}` },
      multipart: { file: { name, mimeType, buffer } },
    });
    expect(response.ok(), `Upload fixture material ${name}`).toBe(true);
    return (await response.json()).data as { id: string; content_hash: string };
  };
  const original = Buffer.from(
    [
      '# 原始注释 🌱  ',
      'esphome:',
      '  name: source-original # preserve this comment',
      'esp32:',
      '  board: esp32dev',
      'wifi: !include wifi.yaml',
      '',
    ].join('\r\n')
  );
  const resource = Buffer.from('ssid: "Fixture network"\r\n');
  const csv = Buffer.from('name,value\r\nfixture,42\r\n');
  const [root, wifi, other, table] = await Promise.all([
    upload(project_id, 'device.yaml', 'text/yaml', original),
    upload(project_id, 'wifi.yaml', 'text/yaml', resource),
    upload(foreignProject.project_id, 'foreign.yaml', 'text/yaml', resource),
    upload(project_id, 'table.csv', 'text/csv', csv),
  ]);
  const workspace_id = 'source-artifact-fixture';
  const scope = { project_id, workspace_id };
  await actor('PATCH', `/projects/${project_id}/workspaces/${workspace_id}`, {
    workspace: {
      id: workspace_id,
      title: 'Source artifact fixture',
      targetBranch: 'main',
      status: 'draft',
    },
  });
  const key = await mintDirect(actor, project_id, authoringScopes);
  const agent = mcpClient(key.key, 'sources,transitions,transitions:prepare,state');
  const human = mcpClient(session, 'transitions,transitions:verify,decision:accept,commit');
  const tool = 't3x_source_artifact';
  try {
    await Promise.all([agent.connect(), human.connect()]);
    expect((await agent.list()).tools.map(({ name }) => name)).toContain(tool);
    expect((await human.list()).tools.map(({ name }) => name)).not.toContain(tool);
    const inputs = {
      ...scope,
      kind: 'exact_source_import',
      root_path: 'device.yaml',
      root: {
        material_id: root.id,
        content_hash: root.content_hash,
        expected_digest: byteDigest(original),
      },
      resources: [
        { path: 'wifi.yaml', material_id: wifi.id, expected_digest: byteDigest(resource) },
      ],
    };
    const rejects = async (overrides: Record<string, unknown>, status: number) => {
      const result = await agent.call(tool, { ...inputs, ...overrides });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0]?.text ?? '{}')).toMatchObject({ error: { status } });
    };
    await rejects({ root: { ...inputs.root, content_hash: 'wrong' } }, 409);
    await rejects({ root: { ...inputs.root, expected_digest: byteDigest(resource) } }, 409);
    await rejects({ resources: [{ ...inputs.resources[0], path: 'device.yaml' }] }, 400);
    await rejects({ resources: [...inputs.resources, ...inputs.resources] }, 400);
    await rejects({ resources: [{ ...inputs.resources[0], material_id: other.id }] }, 404);
    await rejects({ resources: [{ ...inputs.resources[0], path: '../wifi.yaml' }] }, 400);
    await rejects({ root: { material_id: table.id } }, 400);

    const parsed = await invoke<{
      quote: string;
      resource: { digest: string };
      content_hash: string;
    }>(agent, 't3x_source_context', {
      ...scope,
      action: 'material_excerpt',
      material_id: table.id,
    });
    expect(parsed.quote).toContain('| fixture | 42 |');
    expect(parsed.content_hash).toBe(table.content_hash);
    expect(parsed.resource.digest).toBe(byteDigest(Buffer.from(parsed.quote)));
    expect(parsed.resource.digest).not.toBe(byteDigest(csv));

    const prepared = await invoke<Prepared>(agent, tool, inputs);
    expect(prepared.files).toEqual([
      {
        path: 'device.yaml',
        material_id: root.id,
        content_hash: root.content_hash,
        text_digest: byteDigest(original),
      },
      {
        path: 'wifi.yaml',
        material_id: wifi.id,
        content_hash: wifi.content_hash,
        text_digest: byteDigest(resource),
      },
    ]);
    expect(await invoke(agent, tool, inputs)).toEqual(prepared);

    const artifact = {
      format: 't3x.dev/workspace-source-artifact/v1',
      root_path: 'device.yaml',
      resources: [{ path: 'wifi.yaml', material_id: wifi.id, content_hash: wifi.content_hash }],
    };
    for (const overrides of [
      { root: { material_id: root.id, content_hash: 'wrong' } },
      { artifact: { ...artifact, resources: [{ path: 'device.yaml', material_id: wifi.id }] } },
      { artifact: { ...artifact, resources: [{ path: 'wifi.yaml', material_id: other.id }] } },
    ]) {
      const result = await agent.call('propose_transition', {
        ...prepared.proposal,
        ...overrides,
        request_id: randomUUID(),
      });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0]?.text ?? '{}')).toMatchObject({ error: { status: 400 } });
    }

    const advance = async (proposal: Record<string, unknown>, expected_head: string | null) => {
      const args = { ...proposal, request_id: randomUUID() };
      const created = await invoke<ProposeTransitionResult>(agent, 'propose_transition', args);
      expect(created.view.precondition.ref_head).toBe(expected_head);
      expect(await invoke(agent, 'propose_transition', args)).toMatchObject({
        transition_id: created.transition_id,
        reused: true,
      });
      const transition = { project_id, transition_id: created.transition_id };
      const verified = await invoke<VerifyTransitionResult>(human, 'verify_transition', {
        ...transition,
        request_id: randomUUID(),
      });
      expect(verified.view.precondition.ref_head).toBe(expected_head);
      const decision = await invoke<{ decision_digest: string }>(human, 'decide_transition', {
        ...transition,
        request_id: randomUUID(),
        outcome: 'accepted',
        precondition: verified.view.precondition,
      });
      const committed = await invoke<{ commit_digest: string }>(human, 'commit_transition', {
        ...transition,
        decision_digest: decision.decision_digest,
        expected_head,
        request_id: randomUUID(),
      });
      return committed.commit_digest;
    };
    const expectBytes = async (commit_digest: string, bytes: Buffer) => {
      const state = await invoke<{ value: string }>(agent, 't3x_committed_state', {
        action: 'read',
        project_id,
        commit_digest,
      });
      expect(byteDigest(Buffer.from(state.value))).toBe(byteDigest(bytes));
      expect(Buffer.from(state.value)).toEqual(bytes);
    };
    const imported = await advance(prepared.proposal, null);
    await expectBytes(imported, original);
    const edit = await invoke<Prepared>(agent, tool, { ...scope, kind: 'exact_source_edit' });
    expect(edit.files).toEqual(prepared.files.slice(1));
    const edited = await advance(
      {
        ...edit.proposal,
        operations: [
          {
            op: 'replace_scalar',
            path: ['esphome', 'name'],
            expect: 'source-original',
            value: 'source-edited',
          },
        ],
      },
      imported
    );
    await expectBytes(
      edited,
      Buffer.from(original.toString('utf8').replace('source-original', 'source-edited'))
    );
    const revert = await invoke<Prepared>(agent, tool, { ...scope, kind: 'exact_source_revert' });
    expect(revert.proposal).toMatchObject({ commit_id: edited });
    const restored = await advance(revert.proposal, edited);
    await expectBytes(restored, original);
    await expectBytes(imported, original);
  } finally {
    await Promise.allSettled([agent.close(), human.close()]);
  }
});
