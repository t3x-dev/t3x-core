import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { isolatedEnv, phases, summarizePhase } from '../mcp-qualification.mjs';

test('the stdio supervisor records an exit without echoing invalid configuration', () => {
  const result = spawnSync(process.execPath, ['tools/mcp-codex-wrapper.mjs'], {
    cwd: new URL('../..', import.meta.url),
    env: { ...isolatedEnv(process.env), T3X_TRANSPORT: 'private-invalid-setting' },
    encoding: 'utf8',
    input: '',
    timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.doesNotMatch(result.stderr, /private-invalid-setting/);
  const exit = result.stderr.split('\n').find((line) => line.startsWith('{'));
  assert.equal(JSON.parse(exit).event, 'process.exited');
  assert.equal(JSON.parse(exit).exit_code, 1);
});

test('qualification selects existing phase scenarios across all business groups', async () => {
  assert.equal(phases.length, new Set(phases.map(({ name }) => name)).size);
  assert.deepEqual([...new Set(phases.flatMap(({ capabilities }) => capabilities))].sort(), [
    'context',
    'delivery',
    'repositories',
    'runs',
    'schemas',
    'sources',
    'state',
    'transitions',
    'workspace',
  ]);
  for (const phase of phases) {
    const source = await readFile(new URL(`../../apps/web/${phase.file}`, import.meta.url), 'utf8');
    assert.ok(source.includes(`'${phase.name}'`));
    if (phase.scenario) assert.ok(source.includes(`test('${phase.scenario}'`));
  }
});

test('qualification excludes inherited service credentials and database configuration', () => {
  const env = isolatedEnv({
    PATH: '/fixture/bin',
    DATABASE_URL: 'postgres://fixture',
    OPENAI_API_KEY: 'fixture',
    T3X_API_KEY: 'fixture',
    T3X_E2E_DATA_DIR: '/existing',
    T3X_API_URL: 'https://external.test',
  });
  assert.deepEqual(env, {
    PATH: '/fixture/bin',
    T3X_E2E_MCP_ISOLATED: '1',
    T3X_API_URL: 'http://127.0.0.1:8100',
    NEXT_PUBLIC_AUTH_DISABLED: 'false',
  });
});

test('a zero exit code cannot qualify skipped, empty or missing reports', () => {
  const phase = phases.find(({ name }) => name === 'api');
  assert.ok(phase?.scenario);
  const report = (...statuses) => ({
    suites: [
      {
        suites: [
          {
            specs: [
              {
                title: phase.scenario,
                tests: [{ results: statuses.map((status) => ({ status })) }],
              },
              { title: 'unselected scenario', tests: [{ results: [{ status: 'skipped' }] }] },
            ],
          },
        ],
      },
    ],
  });
  const summarize = (data, code = 0) => summarizePhase(phase, data, code, {});
  assert.equal(summarize(report('passed')).status, 'passed');
  assert.equal(summarize(report('passed'), 1).status, 'failed');
  assert.equal(summarize(report('failed', 'passed')).cases[0].status, 'failed');
  assert.equal(summarize(report('skipped')).cases[0].status, 'not run');
  assert.equal(summarize(report('skipped')).status, 'failed');
  assert.equal(summarize({ suites: [] }).status, 'failed');
  assert.equal(summarize(undefined).status, 'blocked');
});
