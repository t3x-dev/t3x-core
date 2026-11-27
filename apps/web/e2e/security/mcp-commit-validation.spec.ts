import type { CommitYSchemaRun, Turn } from '@t3x-dev/api-client';
import { expect, test } from '@playwright/test';
import {
  account,
  authoringScopes,
  invoke,
  type Mcp,
  mcpClient,
  mintDirect,
  registerDirect,
} from '../fixtures/mcp-qualification';

const tool = 't3x_commit_validation';
const summary = {
  problem: 'A reviewer needs evidence for an exact historical revision.',
  audience: 'Maintainers inspecting saved validation results',
  outcome: 'The reviewer can trace each validation Run to the intended Commit.',
};
const requirements = {
  title: 'Read a Run by ID',
  priority: 'must',
  acceptance: ['Show the recorded findings for the exact Commit.'],
};

function trees(slots: Record<string, string>) {
  return [
    { key: 'summary', slots, children: [] },
    {
      key: 'requirements',
      slots: {},
      children: [{ key: 'validation_history', slots: requirements, children: [] }],
    },
  ];
}

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.skip(
  process.env.T3X_E2E_AUTH_ENABLED !== '1' || process.env.T3X_E2E_MCP_PHASE !== 'commit-validation',
  'Requires the isolated authentication-enabled MCP Commit YSchema Run phase.'
);

test('run exact historical Commit validation and separate read from trigger authority', async ({
  request,
}) => {
  const { actor } = await registerDirect(request, account('runowner'));
  const reader = await registerDirect(request, account('runreader'));
  const { id: readerId } = await reader.actor<{ id: string }>('GET', '/auth/me');
  const { project_id } = await actor<{ project_id: string }>('POST', '/projects', {
    name: 'Commit Validation Fixture',
  });
  const foreign = await actor<{ project_id: string }>('POST', '/projects', {
    name: 'Foreign Commit Fixture',
  });
  const { conversation_id } = await actor<{ conversation_id: string }>('POST', '/conversations', {
    project_id,
    title: 'Historical validation evidence',
  });
  const turn = await actor<Turn>('POST', '/turns', {
    project_id,
    conversation_id,
    role: 'user',
    content: Object.values(summary).join(' '),
  });
  const commit = async (
    project: string,
    expected_head: string | null,
    slots: Record<string, string>,
    source?: string
  ) =>
    (
      await actor<{ commit: { digest: string } }>('POST', '/commits', {
        project_id: project,
        expected_head,
        content: { trees: trees(slots) },
        ...(source ? { source_conversation_id: source } : {}),
      })
    ).commit.digest;
  const historical = await commit(project_id, null, summary, conversation_id);
  const current = await commit(project_id, historical, {
    problem: summary.problem,
    outcome: summary.outcome,
  });
  const unrelated = await commit(foreign.project_id, null, summary);
  const key = await mintDirect(actor, project_id, authoringScopes);
  const editor = mcpClient(key.key, 'runs,runs:trigger');
  const viewer = mcpClient(reader.session, 'runs,runs:trigger');
  const readsOnly = mcpClient(reader.session, 'runs');

  const rejects = async (client: Mcp, args: Record<string, unknown>, status: number) => {
    const result = await client.call(tool, args);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0]?.text ?? '{}')).toMatchObject({ error: { status } });
  };
  const inputs = {
    action: 'run',
    project_id,
    commit_hash: historical,
    schema_name: 't3x/prd',
    schema_version: 'v2',
  };
  try {
    await Promise.all([editor.connect(), viewer.connect(), readsOnly.connect()]);
    expect((await editor.list()).tools.map(({ name }) => name)).toContain(tool);
    await rejects(editor, { ...inputs, commit_hash: 'HEAD' }, 400);
    await rejects(editor, { ...inputs, schema_version: 'v99' }, 400);
    await rejects(editor, { ...inputs, commit_hash: unrelated }, 403);
    const stored = await invoke<Omit<CommitYSchemaRun, 'result'>>(editor, tool, inputs);
    expect(stored).toMatchObject({
      id: expect.stringMatching(/^ysvr_/),
      project_id,
      commit_hash: historical,
      schema_name: 't3x/prd',
      schema_version: 'v2',
      schema_hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      status: 'passed',
      findings: { errors: [], gaps: [], fixes: [] },
      provenance_by_path: {
        'summary/problem': [
          {
            origin: 'user_evidence',
            sourceId: `t3x://projects/${project_id}/conversations/${conversation_id}/turns/${encodeURIComponent(turn.turn_hash)}`,
          },
        ],
      },
    });
    const failed = await invoke(editor, tool, { ...inputs, commit_hash: current });
    expect(failed).toMatchObject({
      commit_hash: current,
      schema_hash: stored.schema_hash,
      status: 'failed',
      valid: true,
      ready: false,
      findings: {
        gaps: expect.arrayContaining([
          expect.objectContaining({ code: 'REQUIRED_SLOT_MISSING', path: 'summary/audience' }),
        ]),
      },
    });

    const read = { action: 'read', project_id, run_id: stored.id };
    await rejects(viewer, read, 403);
    await actor('PUT', `/projects/${project_id}/guests`, {
      principal: { kind: 'human', principal_id: readerId },
      role: 'viewer',
      expires_at: null,
    });
    await rejects(viewer, inputs, 403);
    expect((await readsOnly.call(tool, inputs)).isError).toBe(true);
    expect(await invoke(readsOnly, tool, read)).toEqual(stored);
    await rejects(readsOnly, { ...read, project_id: foreign.project_id }, 404);
  } finally {
    await Promise.allSettled([editor.close(), viewer.close(), readsOnly.close()]);
  }
});
