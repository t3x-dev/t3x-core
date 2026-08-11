import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  bindEspHomeSourceInputs,
  buildReplayVerificationStatement,
  type CommitV2,
  compileProposalDraft,
  createAcceptancePolicyResource,
  createCommitV2,
  createDecisionStatement,
  createHumanProposalDraft,
  createYamlSourceEffect,
  createYamlSourceResourceDescriptor,
  createYamlSourceState,
  describeCommitV2,
  describeTransitionObject,
  InMemoryTransitionObjectResolver,
  parseAcceptancePolicy,
  type ReadyEspHomeSourceInputs,
  type RunnerValidationStatement,
} from '@t3x-dev/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runEsphomeRunnerStatement } from '../lib/workspace-validation/esphome-runner-statement';
import type {
  LocalOciCommandExecutor,
  LocalOciCommandResult,
} from '../lib/workspace-validation/local-oci-provider';

const RECORDED_AT = '2026-07-30T00:00:00.000Z';
const RUNNER_ACTOR = { kind: 'service', id: 'runner:esphome-local-oci' } as const;
const REPLAY_ACTOR = { kind: 'service', id: 'service:replay' } as const;
const PROPOSER = { kind: 'agent', id: 'agent:workspace' } as const;
const DECIDER = { kind: 'human', id: 'human:maintainer' } as const;
const REPLAY_TOOL = { name: '@t3x-dev/transition', version: '0.1.0' } as const;
const UNSPECIFIED_RESOURCE = { mode: 'unspecified' } as const;
const SECRET_VALUES = {
  api_encryption_key: 'transient-api-key',
  wifi_password: 'transient-wifi-password',
  wifi_ssid: 'transient-wifi-ssid',
} as const;

const BASE_SOURCE = [
  'esphome:',
  '  name: greenhouse-sensor',
  'esp32:',
  '  board: esp32dev',
  '  framework:',
  '    type: arduino',
  'logger:',
  '  level: DEBUG # Preserve this comment.',
  'packages:',
  '  common: !include packages/common.yaml',
  'wifi:',
  '  ssid: !secret wifi_ssid',
  '  password: !secret wifi_password',
  '',
].join('\n');

const COMMON_SOURCE = ['api:', '  encryption:', '    key: !secret api_encryption_key', ''].join(
  '\n'
);

function readyInputs(state = createYamlSourceState(BASE_SOURCE)): ReadyEspHomeSourceInputs {
  const bound = bindEspHomeSourceInputs({
    root: state,
    rootPath: 'device.yaml',
    resources: [
      {
        path: 'packages/common.yaml',
        source: COMMON_SOURCE,
        descriptor: createYamlSourceResourceDescriptor(
          'urn:t3x:test:esphome:packages/common.yaml',
          COMMON_SOURCE
        ),
      },
    ],
    availableSecretNames: Object.keys(SECRET_VALUES),
    manifestUri: 'urn:t3x:test:esphome:source-inputs',
  });
  if (bound.outcome !== 'ready') {
    throw new Error(`Expected ready source inputs, received ${bound.outcome}`);
  }
  return bound;
}

function commandResult(input: Partial<LocalOciCommandResult>): LocalOciCommandResult {
  return {
    exit_code: Object.hasOwn(input, 'exit_code') ? (input.exit_code ?? null) : 0,
    stdout: input.stdout ?? '',
    stderr: input.stderr ?? '',
    timed_out: input.timed_out,
    output_truncated: input.output_truncated,
    error: input.error,
  };
}

function dockerExecutor(
  runResult:
    | LocalOciCommandResult
    | ((args: string[]) => LocalOciCommandResult | Promise<LocalOciCommandResult>)
): LocalOciCommandExecutor {
  return async (command, args) => {
    if (command === 'docker' && args[0] === 'info') return commandResult({ exit_code: 0 });
    if (command === 'docker' && args[0] === 'run') {
      return typeof runResult === 'function' ? runResult(args) : runResult;
    }
    return commandResult({ exit_code: null, error: { code: 'ENOENT', message: 'not found' } });
  };
}

function missingRuntimeExecutor(): LocalOciCommandExecutor {
  return async () =>
    commandResult({ exit_code: null, error: { code: 'ENOENT', message: 'not found' } });
}

function acceptancePolicy(runner: RunnerValidationStatement) {
  return parseAcceptancePolicy({
    schema: 't3x.dev/acceptance-policy/v1',
    version: 1,
    authorization: {
      decide: { actors: { mode: 'one_of', values: [DECIDER] } },
      override: { actors: { mode: 'one_of', values: [DECIDER] } },
      allowSelfApproval: false,
    },
    claims: {
      intent: {
        allowedModes: ['unspecified'],
        minimumEvidence: 0,
        humanConfirmation: 'not_required',
      },
      rationale: {
        allowedModes: ['authored'],
        minimumEvidence: 0,
        humanConfirmation: 'not_required',
      },
    },
    checks: {
      replay: {
        issuers: { mode: 'one_of', values: [REPLAY_ACTOR] },
        tools: { mode: 'one_of', values: [REPLAY_TOOL] },
        environments: { mode: 'one_of', values: [UNSPECIFIED_RESOURCE] },
      },
      validation: {
        requirement: 'optional',
        issuers: { mode: 'any' },
        tools: { mode: 'any' },
        environments: { mode: 'any' },
        profiles: { mode: 'any' },
        schemas: { mode: 'any' },
        contexts: { mode: 'any' },
      },
      runner: {
        requirement: 'required',
        issuers: { mode: 'one_of', values: [RUNNER_ACTOR] },
        tools: { mode: 'one_of', values: [runner.predicate.tool] },
        workflows: { mode: 'one_of', values: [runner.predicate.workflow] },
        environments: { mode: 'one_of', values: [runner.predicate.environment] },
      },
      humanConfirmation: { issuers: { mode: 'any' } },
    },
    override: {
      allowClaimFailures: false,
      allowFailedValidation: false,
      allowMissingHumanConfirmation: false,
      allowMissingValidation: false,
      allowFailedRunner: true,
      allowMissingRunner: false,
    },
  });
}

async function transitionGraph(tempRoot: string, runResult: LocalOciCommandResult) {
  const base = createYamlSourceState(BASE_SOURCE);
  const { effect, result } = createYamlSourceEffect({
    base,
    operations: [
      {
        op: 'replace_scalar',
        path: ['logger', 'level'],
        expect: 'DEBUG',
        value: 'INFO',
      },
    ],
  });
  const compiled = compileProposalDraft({
    draft: createHumanProposalDraft({
      why: 'Reduce production log volume while preserving the exact source file.',
    }),
    effect,
    actor: PROPOSER,
  });
  if (!compiled.ok) throw new Error(`Proposal failed: ${JSON.stringify(compiled.issues)}`);

  const replay = buildReplayVerificationStatement({
    effect,
    actor: REPLAY_ACTOR,
    predicate: {
      tool: REPLAY_TOOL,
      run: { id: 'run:esphome:replay', recordedAt: RECORDED_AT },
      environment: UNSPECIFIED_RESOURCE,
      outcome: 'verified',
      result: effect.result,
    },
  });
  const executed = await runEsphomeRunnerStatement({
    state: result,
    sourceInputs: readyInputs(result),
    actor: RUNNER_ACTOR,
    run: { id: 'run:esphome:external', recordedAt: RECORDED_AT },
    secretValues: SECRET_VALUES,
    executor: dockerExecutor(runResult),
    tempRoot,
  });
  if (executed.outcome !== 'statement') throw new Error('Expected a conclusive Runner Statement');

  return {
    base,
    result,
    effect,
    proposal: compiled.proposal,
    replay,
    runner: executed.statement,
    resources: executed.resources,
  };
}

describe('ESPHome external Runner Statement', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), 't3x-runner-test-'));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('binds a conclusive external run to the exact Result State and commits it through policy', async () => {
    const graph = await transitionGraph(
      tempRoot,
      commandResult({ exit_code: 0, stdout: 'INFO Configuration is valid!\n' })
    );
    expect(graph.result.value).toBe(BASE_SOURCE.replace('level: DEBUG', 'level: INFO'));
    expect(graph.runner.subjects).toEqual([describeTransitionObject(graph.result)]);
    expect(graph.runner.predicate).toMatchObject({
      outcome: 'passed',
      inputManifest: readyInputs(graph.result).manifestResource,
      inputArtifacts: [
        createYamlSourceResourceDescriptor(
          'urn:t3x:test:esphome:packages/common.yaml',
          COMMON_SOURCE
        ),
      ],
    });
    expect(graph.resources.logs[0]?.value).toBe('INFO Configuration is valid!');

    const policy = acceptancePolicy(graph.runner);
    const boundPolicy = createAcceptancePolicyResource({
      policy,
      uri: 't3x://test/policies/esphome-runner',
    });
    const observations = [
      { statement: graph.replay, issuerContext: { actor: REPLAY_ACTOR } },
      { statement: graph.runner, issuerContext: { actor: RUNNER_ACTOR } },
    ];
    const decided = createDecisionStatement({
      actorContext: { actor: DECIDER },
      effect: graph.effect,
      observationScope: { completeness: 'complete', sources: ['test:runner'] },
      outcome: 'accepted',
      policy,
      policyResource: boundPolicy.resource,
      proposal: graph.proposal,
      rationale: { mode: 'unspecified' },
      statements: observations,
      decidedAt: RECORDED_AT,
    });
    expect(decided.ok).toBe(true);
    if (!decided.ok) throw new Error(`Decision failed: ${JSON.stringify(decided.failures)}`);
    expect(decided.decision.predicate.considered).toContainEqual(
      describeTransitionObject(graph.runner)
    );

    const parent: CommitV2 = {
      schema: 't3x/commit/v2',
      parents: [],
      decision: describeTransitionObject(decided.decision),
      result: describeTransitionObject(graph.base),
    };
    const commit = await createCommitV2({
      parents: [describeCommitV2(parent)],
      decision: decided.decision,
      resolver: new InMemoryTransitionObjectResolver([
        parent,
        graph.base,
        graph.result,
        graph.effect,
        graph.proposal,
        graph.replay,
        graph.runner,
      ]),
    });
    expect(commit.result).toEqual(describeTransitionObject(graph.result));
    expect(commit.decision).toEqual(describeTransitionObject(decided.decision));
  });

  it('blocks acceptance on a failed run, preserves redacted evidence, and permits explicit override', async () => {
    const graph = await transitionGraph(
      tempRoot,
      commandResult({
        exit_code: 1,
        stderr: `Invalid config: credential ${SECRET_VALUES.wifi_password} must not escape`,
      })
    );
    expect(graph.runner.predicate.outcome).toBe('failed');
    expect(JSON.stringify(graph.runner)).not.toContain(SECRET_VALUES.wifi_password);
    expect(graph.resources.logs[0]?.value).toContain('[REDACTED]');

    const policy = acceptancePolicy(graph.runner);
    const boundPolicy = createAcceptancePolicyResource({
      policy,
      uri: 't3x://test/policies/esphome-runner-failure',
    });
    const input = {
      actorContext: { actor: DECIDER },
      effect: graph.effect,
      observationScope: { completeness: 'complete', sources: ['test:runner'] } as const,
      policy,
      policyResource: boundPolicy.resource,
      proposal: graph.proposal,
      statements: [
        { statement: graph.replay, issuerContext: { actor: REPLAY_ACTOR } },
        { statement: graph.runner, issuerContext: { actor: RUNNER_ACTOR } },
      ],
      decidedAt: RECORDED_AT,
    };

    const accepted = createDecisionStatement({
      ...input,
      outcome: 'accepted',
      rationale: { mode: 'unspecified' },
    });
    expect(accepted).toMatchObject({
      ok: false,
      failures: [{ code: 'RUNNER_FAILED', overrideable: true }],
    });

    const overridden = createDecisionStatement({
      ...input,
      outcome: 'overridden',
      rationale: {
        mode: 'authored',
        value: 'The known validation failure is accepted for this isolated test device.',
        evidence: [],
      },
    });
    expect(overridden.ok).toBe(true);
    if (!overridden.ok) throw new Error(`Override failed: ${JSON.stringify(overridden.failures)}`);
    expect(overridden.decision.predicate).toMatchObject({
      outcome: 'overridden',
      rationale: { mode: 'authored' },
    });
  });

  it('does not issue a validity Statement for missing environments or timeouts', async () => {
    const state = createYamlSourceState(BASE_SOURCE);
    const common = {
      state,
      sourceInputs: readyInputs(state),
      actor: RUNNER_ACTOR,
      secretValues: SECRET_VALUES,
      tempRoot,
    } as const;

    const unavailable = await runEsphomeRunnerStatement({
      ...common,
      run: { id: 'run:missing-runtime', recordedAt: RECORDED_AT },
      executor: missingRuntimeExecutor(),
    });
    expect(unavailable).toMatchObject({
      outcome: 'no_statement',
      reason: 'environment_required',
      operationalResult: { status: 'environment_required' },
    });
    expect('statement' in unavailable).toBe(false);

    const timedOut = await runEsphomeRunnerStatement({
      ...common,
      run: { id: 'run:timeout', recordedAt: RECORDED_AT },
      executor: dockerExecutor(
        commandResult({ exit_code: null, stderr: 'timed out', timed_out: true })
      ),
    });
    expect(timedOut).toMatchObject({
      outcome: 'no_statement',
      reason: 'timed_out',
      operationalResult: { status: 'timed_out' },
    });
    expect('statement' in timedOut).toBe(false);

    const imageFailure = await runEsphomeRunnerStatement({
      ...common,
      run: { id: 'run:image-failure', recordedAt: RECORDED_AT },
      executor: dockerExecutor(
        commandResult({
          exit_code: 125,
          stderr: 'docker: Error response from daemon: manifest unknown',
        })
      ),
    });
    expect(imageFailure).toMatchObject({
      outcome: 'no_statement',
      reason: 'environment_required',
      operationalResult: { status: 'environment_required' },
    });
    expect('statement' in imageFailure).toBe(false);
  });

  it('rejects source-manifest and transient-secret mismatches before execution', async () => {
    const state = createYamlSourceState(BASE_SOURCE);
    const sourceInputs = readyInputs(state);
    let calls = 0;
    const executor: LocalOciCommandExecutor = async () => {
      calls += 1;
      return commandResult({ exit_code: 0 });
    };

    await expect(
      runEsphomeRunnerStatement({
        state,
        sourceInputs: {
          ...sourceInputs,
          manifestResource: {
            ...sourceInputs.manifestResource,
            digest: `sha256:${'f'.repeat(64)}`,
          },
        },
        actor: RUNNER_ACTOR,
        run: { id: 'run:tampered-manifest', recordedAt: RECORDED_AT },
        secretValues: SECRET_VALUES,
        executor,
        tempRoot,
      })
    ).rejects.toThrow('does not bind the supplied exact inputs');

    await expect(
      runEsphomeRunnerStatement({
        state,
        sourceInputs,
        actor: RUNNER_ACTOR,
        run: { id: 'run:missing-secret', recordedAt: RECORDED_AT },
        secretValues: { wifi_password: SECRET_VALUES.wifi_password },
        executor,
        tempRoot,
      })
    ).rejects.toThrow('must exactly match');

    await expect(
      runEsphomeRunnerStatement({
        state,
        sourceInputs: { outcome: 'incomplete', issues: [] } as never,
        actor: RUNNER_ACTOR,
        run: { id: 'run:incomplete-inputs', recordedAt: RECORDED_AT },
        secretValues: SECRET_VALUES,
        executor,
        tempRoot,
      })
    ).rejects.toThrow('requires ready source inputs');
    expect(calls).toBe(0);
  });
});

it.skipIf(process.env.T3X_RUN_ESPHOME_OCI !== '1')(
  'runs the immutable ESPHome image through a real isolated OCI runtime',
  async () => {
    const source = [
      'esphome:',
      '  name: t3x-runner-proof',
      'esp32:',
      '  board: esp32dev',
      '  framework:',
      '    type: arduino',
      'logger:',
      '  level: INFO',
      '',
    ].join('\n');
    const state = createYamlSourceState(source);
    const bound = bindEspHomeSourceInputs({
      root: state,
      rootPath: 'device.yaml',
      resources: [],
      availableSecretNames: [],
      manifestUri: 'urn:t3x:test:esphome:real-oci-inputs',
    });
    if (bound.outcome !== 'ready') throw new Error(`Expected ready inputs: ${bound.outcome}`);

    const result = await runEsphomeRunnerStatement({
      state,
      sourceInputs: bound,
      actor: RUNNER_ACTOR,
      run: { id: 'run:esphome:real-oci', recordedAt: RECORDED_AT },
      secretValues: {},
    });
    expect(result).toMatchObject({
      outcome: 'statement',
      operationalResult: { status: 'passed' },
      statement: { predicate: { outcome: 'passed' } },
    });
  },
  180_000
);
