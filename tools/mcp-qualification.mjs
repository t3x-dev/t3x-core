import { execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const apiCore = ['context', 'repositories', 'state', 'workspace', 'schemas', 'transitions'];
const directCore = 'isolated API credentials and real stdio';
const webCore = 'Web-issued Agent credential and trusted Web confirmation';

export const phases = [
  [
    'write-recovery',
    'write-recovery',
    ['context', 'sources'],
    null,
    'loopback response-loss proxy',
  ],
  ['api', 'core-loop', [...apiCore, 'delivery'], directCore],
  ['web', 'core-loop', apiCore, webCore],
  ['restore', 'core-loop', ['state', 'workspace', 'transitions'], directCore],
  ['presentation', 'core-loop', ['state', 'workspace'], directCore],
  ['repositories', 'repository-creation', ['repositories', 'schemas']],
  ['workspace-candidate', 'candidate-publication', ['workspace', 'sources', 'transitions']],
  ['workspace-reconciliation', 'workspace-reconciliation', ['workspace', 'transitions']],
  ['transition-authority', 'transition-authority', ['transitions']],
  [
    'transition-statement',
    'transition-authority',
    ['transitions'],
    null,
    'local API predicate allowlist',
  ],
  ['schema-authoring', 'schema-authoring', ['schemas', 'workspace', 'transitions']],
  ['source-context', 'source-context', ['sources']],
  ['source-ingestion', 'source-ingestion', ['sources']],
  [
    'proposal-generation',
    'proposal-generation',
    ['sources', 'workspace', 'transitions'],
    null,
    'loopback model',
  ],
  [
    'journey',
    'journey',
    [
      'context',
      'repositories',
      'sources',
      'workspace',
      'schemas',
      'transitions',
      'state',
      'delivery',
    ],
    'Web-authorized MCP Source to Commit and preview rollback',
    'loopback model',
  ],
  ['source-artifact', 'source-artifact', ['sources', 'state', 'transitions']],
  ['commit-validation', 'commit-validation', ['runs', 'schemas']],
  [
    'workspace-validation',
    'workspace-validation',
    ['runs', 'workspace'],
    null,
    'missing OCI runtime fixture',
  ],
  [
    'workspace-validation-oci',
    'workspace-validation',
    ['runs', 'workspace'],
    'pin an authoring Draft validation and restrict its evidence to the Workspace owner',
    'real OCI runtime and pinned ESPHome image',
  ],
  ['repository-runs', 'repository-runs', ['runs'], null, 'loopback workflow webhook'],
].map(([name, spec, capabilities, scenario, dependency]) => ({
  name,
  file: `e2e/security/mcp-${spec}.spec.ts`,
  capabilities,
  ...(scenario ? { scenario } : {}),
  credentials:
    name === 'web' || name === 'journey'
      ? 'Web-issued Agent fixture and signed-in Web user'
      : ['schema-authoring', 'workspace-candidate'].includes(name)
        ? 'fixture API credentials and signed-in Web user'
        : 'fixture API credentials',
  dependencies: dependency ?? 'isolated local stack and test data',
}));

export function isolatedEnv(source) {
  const inherited = [
    'PATH',
    'HOME',
    'USERPROFILE',
    'TMPDIR',
    'TMP',
    'TEMP',
    'SystemRoot',
    'LOCALAPPDATA',
    'LANG',
    'LC_ALL',
    'TERM',
    'CI',
    'PNPM_HOME',
    'PLAYWRIGHT_BROWSERS_PATH',
  ];
  return {
    ...Object.fromEntries(
      inherited.filter((key) => source[key] !== undefined).map((key) => [key, source[key]])
    ),
    T3X_E2E_MCP_ISOLATED: '1',
    T3X_API_URL: 'http://127.0.0.1:8100',
    NEXT_PUBLIC_AUTH_DISABLED: 'false',
  };
}

export function summarizePhase(phase, report, exitCode, evidence) {
  const cases = [];
  function visit(suite) {
    for (const spec of suite.specs ?? []) {
      if (phase.scenario && spec.title !== phase.scenario) continue;
      for (const test of spec.tests) {
        const attempts = test.results.map(({ status }) => status);
        const executed = attempts.filter((status) => status !== 'skipped');
        cases.push({
          scenario: spec.title,
          status: !executed.length
            ? 'not run'
            : executed.every((status) => status === 'passed')
              ? 'passed'
              : 'failed',
          attempts,
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  if (report) visit(report);
  return {
    ...phase,
    status: !report
      ? 'blocked'
      : exitCode === 0 && cases.length > 0 && cases.every(({ status }) => status === 'passed')
        ? 'passed'
        : 'failed',
    exitCode,
    cases,
    ...(!report
      ? { reason: 'No Playwright result report.' }
      : cases.length === 0
        ? { reason: 'No expected scenario was recorded.' }
        : {}),
    evidence,
  };
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code: code ?? 1, signal }));
  });
}

async function readReport(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return undefined;
  }
}

async function qualify(selected) {
  const outputRoot = path.join(root, 'test-results');
  await mkdir(outputRoot, { recursive: true });
  const output = await mkdtemp(path.join(outputRoot, 'mcp-qualification-'));
  const env = isolatedEnv(process.env);
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const dirty = Boolean(
    execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()
  );
  const results = phases.map((phase) => ({ ...phase, status: 'not run' }));
  const reportPath = path.join(output, 'qualification.json');
  const save = () =>
    writeFile(
      reportPath,
      JSON.stringify(
        {
          revision,
          dirty,
          selectedPhases: selected.map(({ name }) => name),
          phases: results,
        },
        null,
        2
      ) + '\n'
    );
  await save();
  console.log(`[mcp-qualification] Evidence: ${reportPath}`);

  const build = await run(
    'pnpm',
    [
      'exec',
      'turbo',
      'run',
      'build',
      '--filter=@t3x-dev/mcp',
      '--filter=t3x-api-server',
      '--filter=t3x-webui',
    ],
    env
  ).catch(() => ({ code: 1 }));
  if (build.code !== 0) {
    for (const result of results) {
      if (selected.some(({ name }) => name === result.name))
        Object.assign(result, { status: 'blocked', reason: 'Build failed.' });
    }
    await save();
    return 1;
  }

  for (const phase of selected) {
    const index = phases.indexOf(phase);
    const artifactDir = path.join(output, phase.name);
    const phaseEnv = { ...env, T3X_E2E_MCP_PHASE: phase.name, T3X_E2E_ARTIFACT_DIR: artifactDir };
    if (phase.dependencies === 'loopback model') {
      Object.assign(phaseEnv, {
        T3X_E2E_F3_MODEL_PORT: '8373',
        T3X_E2E_ALLOW_EXTERNAL: '1',
        OPENAI_BASE_URL: 'http://127.0.0.1:8373/v1',
        OPENAI_API_KEY: 't3x-local-fixture-only',
      });
    }
    let fixtureBin;
    let execution;
    try {
      if (phase.name === 'workspace-validation') {
        fixtureBin = await mkdtemp(path.join(os.tmpdir(), 't3x-no-oci-'));
        for (const name of ['docker', 'podman']) {
          await writeFile(path.join(fixtureBin, name), '#!/bin/sh\nexit 127\n', { mode: 0o700 });
        }
        phaseEnv.PATH = [fixtureBin, env.PATH].filter(Boolean).join(path.delimiter);
      }
      const filter = phase.scenario ? ['--grep', phase.scenario] : [];
      execution = await run(
        process.execPath,
        ['tools/full-e2e.mjs', '--auth-enabled', '--skip-build', '--', phase.file, ...filter],
        phaseEnv
      );
    } catch {
      results[index] = {
        ...phase,
        status: 'blocked',
        reason: 'Could not launch the qualification phase.',
      };
      await save();
      continue;
    } finally {
      if (fixtureBin) await rm(fixtureBin, { recursive: true, force: true });
    }
    results[index] = summarizePhase(
      phase,
      await readReport(path.join(artifactDir, 'results.json')),
      execution.code,
      {
        summary: path.join(phase.name, 'run-summary.json'),
        playwright: path.join(phase.name, 'results.json'),
      }
    );
    await save();
    console.log(`[mcp-qualification] ${phase.name} ${results[index].status}`);
    if (execution.signal || [130, 143].includes(execution.code)) break;
  }
  const selectedResults = results.filter((result) =>
    selected.some(({ name }) => name === result.name)
  );
  return selectedResults.every(({ status }) => status === 'passed') ? 0 : 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [command = '--plan', ...names] = process.argv.slice(2);
  if (
    !['--plan', '--run'].includes(command) ||
    names.some((name) => !phases.some((phase) => phase.name === name))
  ) {
    console.error('Usage: node tools/mcp-qualification.mjs [--plan|--run] [phase ...]');
    process.exitCode = 1;
  } else {
    const selected = names.length ? phases.filter(({ name }) => names.includes(name)) : phases;
    if (command === '--plan') console.log(JSON.stringify(selected, null, 2));
    else process.exitCode = await qualify(selected);
  }
}
