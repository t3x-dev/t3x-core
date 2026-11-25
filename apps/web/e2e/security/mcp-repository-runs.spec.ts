import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
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

test('read saved Runs and dispatch one configured workflow per authorized request', async ({
  request,
}) => {
  test.setTimeout(90_000);
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
    const trigger = 't3x_trigger_repository_run';
    await expect(agent.call(trigger, {})).rejects.toMatchObject({ code: -32602 });
    const project = 'configured_run_fixture';
    const commit = async (id: string) =>
      (
        await actor<{ commit: { digest: string } }>('POST', '/commits', {
          project_id: id,
          expected_head: null,
          content: { trees: [{ key: 'root', slots: { description: id }, children: [] }] },
        })
      ).commit.digest;
    const digest = await commit(project);
    const unrelated = await commit(foreign.project_id);
    const editorKey = await mintDirect(actor, project, authoringScopes);
    const editor = mcpClient(editorKey.key, 'runs:repository:trigger,runs:repository');
    const readOnlyUser = mcpClient(reader.session, 'runs:repository:trigger');
    await actor('PUT', `/projects/${project}/guests`, {
      principal: { kind: 'human', principal_id: readerId },
      role: 'viewer',
      expires_at: null,
    });
    const input = { project_id: project, request_id: 'first-run', commit_digest: digest };
    const calls: Array<{
      run_id: string;
      project_id: string;
      runner_run_id: string;
      callback_url: string;
      commit_ref: string;
    }> = [];
    const webhook = createServer(async (req, res) => {
      if (req.url !== '/webhook/evaluate-v1') {
        res.writeHead(404).end();
        return;
      }
      let body = '';
      for await (const chunk of req) body += chunk;
      calls.push(JSON.parse(body));
      res.writeHead(204).end();
    });
    try {
      webhook.listen(Number(new URL(process.env.N8N_WEBHOOK_URL!).port), '127.0.0.1');
      await once(webhook, 'listening');
      await Promise.all([editor.connect(), readOnlyUser.connect()]);
      const rejected = async (
        client: typeof editor,
        args: Record<string, unknown>,
        status: number
      ) => {
        const result = await client.call(trigger, args);
        expect(result.isError).toBe(true);
        expect(JSON.parse(result.content[0]?.text ?? '{}')).toMatchObject({ error: { status } });
      };
      await rejected(readOnlyUser, input, 403);
      await rejected(editor, { ...input, commit_digest: unrelated }, 404);
      await rejected(editor, { ...input, workflow: { type: 'n8n' } }, 400);
      const [one, two] = await Promise.all(
        [1, 2].map(() =>
          invoke<{ run_id: string; configuration_digest: string }>(editor, trigger, input)
        )
      );
      expect(one.run_id).toBe(two.run_id);
      expect(one.configuration_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      await expect.poll(() => calls.length).toBe(1);
      expect(calls[0]).toMatchObject({
        run_id: one.run_id,
        project_id: project,
        commit_ref: digest,
      });
      await rejected(editor, { ...input, commit_digest: unrelated }, 409);
      const callback = calls[0]!;
      const altered = new URL(callback.callback_url);
      altered.searchParams.set('configured_project', foreign.project_id);
      expect(
        (
          await request.post(altered.toString(), {
            data: { run_id: one.run_id, runner_run_id: callback.runner_run_id },
          })
        ).status()
      ).toBe(401);
      const output = { checked_commit: callback.commit_ref, finding_count: 0 };
      const ack = await request.post(callback.callback_url, {
        data: {
          run_id: one.run_id,
          runner_run_id: callback.runner_run_id,
          output,
        },
      });
      expect(ack.ok()).toBe(true);
      const exactRun = { action: 'read', project_id: project, run_id: one.run_id };
      await expect
        .poll(() => invoke(viewer, tool, exactRun), {
          timeout: 20000,
        })
        .toMatchObject({
          run_id: one.run_id,
          runner_run_id: callback.runner_run_id,
          project_id: project,
          commit_ref: digest,
          status: 'completed',
          result: {
            run_report: {
              trace: { run_id: one.run_id, project_id: project, status: 'completed', output },
              eval_result: { passed: true, violations: [] },
            },
            evidence_pack: { n8n_output: output },
          },
        });
      expect(await invoke(editor, trigger, input)).toMatchObject({
        run_id: one.run_id,
        status: 'completed',
      });
      expect(calls).toHaveLength(1);

      const failed = await invoke<{ run_id: string }>(editor, trigger, {
        ...input,
        request_id: 'failed-run',
      });
      expect(failed.run_id).not.toBe(one.run_id);
      await expect.poll(() => calls.length).toBe(2);
      const failedCallback = calls[1]!;
      expect(failedCallback).toMatchObject({
        run_id: failed.run_id,
        project_id: project,
        commit_ref: digest,
      });
      const failedAck = await request.post(failedCallback.callback_url, {
        data: {
          run_id: failed.run_id,
          runner_run_id: failedCallback.runner_run_id,
          error: 'Fixture workflow could not evaluate the Commit.',
        },
      });
      expect(failedAck.ok()).toBe(true);
      await expect
        .poll(() => invoke(viewer, tool, { ...exactRun, run_id: failed.run_id }), {
          timeout: 20000,
        })
        .toMatchObject({
          run_id: failed.run_id,
          commit_ref: digest,
          status: 'failed',
          result: {
            run_report: {
              trace: { status: 'failed', error: { code: 'N8N_ERROR' } },
              eval_result: { passed: false },
            },
          },
        });

      await actor('DELETE', `/runs/${one.run_id}`);
      await rejected(editor, input, 409);
      expect(calls).toHaveLength(2);
    } finally {
      webhook.close();
      await Promise.allSettled([editor.close(), readOnlyUser.close()]);
    }
  } finally {
    await Promise.allSettled([agent.close(), human.close(), viewer.close()]);
  }
});
