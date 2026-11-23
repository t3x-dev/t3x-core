import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import {
  account,
  authoringScopes,
  invoke,
  mcpClient,
  mintDirect,
  registerDirect,
} from '../fixtures/mcp-qualification';

const tool = 't3x_repository_runs';
const seed = promisify(execFile);

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.skip(
  process.env.T3X_E2E_AUTH_ENABLED !== '1' || process.env.T3X_E2E_MCP_PHASE !== 'repository-runs',
  'Requires the isolated authentication-enabled MCP repository Runs phase.'
);

test('read saved repository Runs through the existing project authorization', async ({
  request,
}) => {
  test.setTimeout(60_000);
  const { actor, session } = await registerDirect(request, account('repoowner'));
  const reader = await registerDirect(request, account('reporeader'));
  const { id: readerId } = await reader.actor<{ id: string }>('GET', '/auth/me');
  const { project_id } = await actor<{ project_id: string }>('POST', '/projects', {
    name: 'Repository Runs Fixture',
  });
  const foreign = await actor<{ project_id: string }>('POST', '/projects', {
    name: 'Foreign Repository Runs Fixture',
  });
  await seed(
    'pnpm',
    [
      '--filter',
      '@t3x-dev/api',
      'exec',
      'tsx',
      'src/__tests__/fixtures/mcp-repository-runs.ts',
      project_id,
      foreign.project_id,
    ],
    { cwd: resolve(process.cwd(), '../..'), timeout: 35_000 }
  );
  const key = await mintDirect(actor, project_id, authoringScopes);
  const agent = mcpClient(key.key, 'runs:repository');
  const human = mcpClient(session, 'runs:repository');
  const viewer = mcpClient(reader.session, 'runs:repository');
  const list = { action: 'list', project_id };
  const read = { action: 'read', project_id, run_id: 'run_fixture_completed' };
  try {
    await Promise.all([agent.connect(), human.connect(), viewer.connect()]);
    expect((await agent.list()).tools.map(({ name }) => name)).toEqual([tool]);
    expect((await viewer.call(tool, list)).isError).toBe(true);
    await actor('PUT', `/projects/${project_id}/guests`, {
      principal: { kind: 'human', principal_id: readerId },
      role: 'viewer',
      expires_at: null,
    });
    const page = await invoke<{ runs: Array<{ project_id: string; status: string }> }>(
      viewer,
      tool,
      list
    );
    expect(page.runs).toHaveLength(5);
    expect(page.runs.every((run) => run.project_id === project_id)).toBe(true);
    expect(new Set(page.runs.map((run) => run.status))).toEqual(
      new Set(['queued', 'running', 'completed', 'failed'])
    );
    expect(await invoke(agent, tool, { ...list, status: 'queued', limit: 1 })).toMatchObject({
      runs: [{ run_id: 'run_fixture_queued', status: 'queued' }],
      next_offset: 1,
    });
    expect(
      await invoke(agent, tool, { ...list, status: 'queued', offset: 1, limit: 1 })
    ).toMatchObject({
      runs: [],
      next_offset: null,
    });
    const completed = await invoke(viewer, tool, read);
    expect(completed).toMatchObject({
      status: 'completed',
      commit_ref: 'fixture-ref',
      result: { eval_summary: 'Fixture passed.' },
    });
    expect(completed).not.toHaveProperty('inputs');
    expect(completed).not.toHaveProperty('workflow');
    expect(await invoke(agent, tool, { ...read, run_id: 'run_fixture_failed' })).toMatchObject({
      status: 'failed',
      result: { run_report: { error: 'Fixture failed.' } },
    });
    expect(await invoke(agent, tool, { ...read, run_id: 'run_fixture_legacy' })).toMatchObject({
      status: 'failed',
      result: null,
      result_unreadable: true,
    });

    expect((await agent.call(tool, { ...list, project_id: foreign.project_id })).isError).toBe(
      true
    );
    expect((await agent.call(tool, { ...read, run_id: 'run_fixture_foreign' })).isError).toBe(true);
    expect((await human.call(tool, { ...read, run_id: 'run_fixture_foreign' })).isError).toBe(true);
    expect((await viewer.call(tool, { ...list, action: 'trigger' })).isError).toBe(true);
    expect((await agent.call(tool, { action: 'list' })).isError).toBe(true);
  } finally {
    await Promise.allSettled([agent.close(), human.close(), viewer.close()]);
  }
});
