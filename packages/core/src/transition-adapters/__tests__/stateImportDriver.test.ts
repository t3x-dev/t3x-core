import {
  definitionOf,
  describeProtocolObject,
  type Effect,
  type EffectDefinition,
  InMemoryObjectResolver,
  type ProposalStatement,
  replay,
  STATE_SCHEMA,
  type State,
  verifyEffect,
} from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import { createCommitV2 } from '../../transition-commits/commit';
import { createDecisionStatement } from '../../transition-decisions/decision';
import {
  createAcceptancePolicyResource,
  parseAcceptancePolicy,
} from '../../transition-decisions/policy';
import { buildReplayVerificationStatement } from '../../transition-statements/builders';
import {
  createStateImportEffect,
  createYamlSourceState,
  createYOpsState,
  STATE_IMPORT_MUTATION_DRIVER_REF,
  stateImportMutationDriver,
  stateImportMutationDrivers,
} from '..';

const RECORDED_AT = '2026-07-30T00:00:00.000Z';
const DECIDED_AT = '2026-07-30T00:00:01.000Z';

function exactSourceState(): State {
  return createYamlSourceState(
    [
      '# This comment is part of State identity.',
      'esphome:',
      '  name: greenhouse-sensor',
      'wifi:',
      '  password: !secret wifi_password',
      '',
    ].join('\n')
  );
}

function definitionFor(imported: State): EffectDefinition {
  return {
    driver: { ...STATE_IMPORT_MUTATION_DRIVER_REF },
    operations: [],
    inputs: [{ role: 'state', object: describeProtocolObject(imported) }],
  };
}

function acceptedPolicy() {
  return parseAcceptancePolicy({
    schema: 't3x.dev/acceptance-policy/v1',
    version: 1,
    authorization: {
      decide: { actors: { mode: 'any' } },
      override: { actors: { mode: 'any' } },
      allowSelfApproval: false,
    },
    claims: {
      intent: {
        allowedModes: ['unspecified'],
        minimumEvidence: 0,
        humanConfirmation: 'not_required',
      },
      rationale: {
        allowedModes: ['unspecified'],
        minimumEvidence: 0,
        humanConfirmation: 'not_required',
      },
    },
    checks: {
      replay: {
        issuers: { mode: 'any' },
        tools: { mode: 'any' },
        environments: { mode: 'any' },
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
      humanConfirmation: { issuers: { mode: 'any' } },
    },
    override: {
      allowClaimFailures: false,
      allowFailedValidation: false,
      allowMissingHumanConfirmation: false,
      allowMissingValidation: true,
    },
  });
}

describe('codec-agnostic State import MutationDriver', () => {
  it('imports an exact-source YAML State without changing codec, source, or identity', async () => {
    const base = createYOpsState({});
    const imported = exactSourceState();
    const importedDescriptor = describeProtocolObject(imported);
    const { effect, result } = createStateImportEffect({ base, imported });

    expect(result).toEqual(imported);
    expect(result.codec).toEqual(imported.codec);
    expect(result.value).toBe(imported.value);
    expect(describeProtocolObject(result)).toEqual(importedDescriptor);
    expect(effect).toMatchObject({
      base: describeProtocolObject(base),
      driver: STATE_IMPORT_MUTATION_DRIVER_REF,
      operations: [],
      inputs: [{ role: 'state', object: importedDescriptor }],
      result: importedDescriptor,
    });

    await expect(
      verifyEffect(effect, {
        resolver: new InMemoryObjectResolver([base, imported]),
        drivers: stateImportMutationDrivers,
      })
    ).resolves.toMatchObject({ result: imported });
  });

  it('imports a materially different State codec without codec-specific branching', () => {
    const base = createYOpsState({});
    const imported: State = {
      schema: STATE_SCHEMA,
      codec: { mediaType: 'text/plain', version: '1' },
      value: 'one exact text value\n',
    };

    const { effect, result } = createStateImportEffect({ base, imported });
    expect(result).toEqual(imported);
    expect(effect.result).toEqual(describeProtocolObject(imported));
  });

  it('requires an explicit empty mapping Base and honors expectedBase', () => {
    const imported = exactSourceState();
    expect(() => createStateImportEffect({ base: createYOpsState([]), imported })).toThrowError(
      expect.objectContaining({ code: 'UNSUPPORTED_SEMANTICS' })
    );
    expect(() =>
      createStateImportEffect({ base: createYOpsState({ existing: true }), imported })
    ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_SEMANTICS' }));
    expect(() =>
      createStateImportEffect({
        base: createYOpsState({}),
        imported,
        expectedBase: describeProtocolObject(createYOpsState({ other: true })),
      })
    ).toThrowError(expect.objectContaining({ code: 'STALE_BASE' }));
  });

  it('rejects operations and any input shape other than one State role', () => {
    const base = createYOpsState({});
    const imported = exactSourceState();

    expect(() =>
      replay(
        base,
        { ...definitionFor(imported), operations: [{ op: 'read_file', path: 'device.yaml' }] },
        new Map([['state', imported]]),
        stateImportMutationDrivers
      )
    ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_SEMANTICS' }));

    const wrongRole: EffectDefinition = {
      ...definitionFor(imported),
      inputs: [{ role: 'source', object: describeProtocolObject(imported) }],
    };
    expect(() =>
      replay(base, wrongRole, new Map([['source', imported]]), stateImportMutationDrivers)
    ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_SEMANTICS' }));

    expect(() =>
      replay(base, definitionFor(imported), new Map(), stateImportMutationDrivers)
    ).toThrowError(expect.objectContaining({ code: 'INTEGRITY_CHAIN_INVALID' }));
    expect(() =>
      replay(
        base,
        definitionFor(imported),
        new Map([
          ['state', imported],
          ['ambient', imported],
        ]),
        stateImportMutationDrivers
      )
    ).toThrowError(expect.objectContaining({ code: 'INTEGRITY_CHAIN_INVALID' }));
  });

  it('rejects mismatched descriptors and non-State inputs', () => {
    const base = createYOpsState({});
    const imported = exactSourceState();
    const other = createYamlSourceState('esphome:\n  name: other-device\n');

    expect(() =>
      replay(base, definitionFor(imported), new Map([['state', other]]), stateImportMutationDrivers)
    ).toThrowError(expect.objectContaining({ code: 'INTEGRITY_CHAIN_INVALID' }));

    const created = createStateImportEffect({ base, imported });
    const nonStateDefinition: EffectDefinition = {
      driver: { ...STATE_IMPORT_MUTATION_DRIVER_REF },
      operations: [],
      inputs: [{ role: 'state', object: describeProtocolObject(created.effect) }],
    };
    expect(() =>
      replay(
        base,
        nonStateDefinition,
        new Map([['state', created.effect]]),
        stateImportMutationDrivers
      )
    ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_SEMANTICS' }));
  });

  it('does not let a claimed Result influence replay or verification', async () => {
    const base = createYOpsState({});
    const imported = exactSourceState();
    const created = createStateImportEffect({ base, imported });
    const falseEffect: Effect = {
      ...created.effect,
      result: describeProtocolObject(createYamlSourceState('different: source\n')),
    };

    expect(
      replay(
        base,
        definitionOf(falseEffect),
        new Map([['state', imported]]),
        stateImportMutationDrivers
      )
    ).toEqual(imported);
    await expect(
      verifyEffect(falseEffect, {
        resolver: new InMemoryObjectResolver([base, imported]),
        drivers: stateImportMutationDrivers,
      })
    ).rejects.toMatchObject({ code: 'EFFECT_CLAIM_FALSE' });
  });

  it('creates the first CommitV2 through an accepted import Decision', async () => {
    const base = createYOpsState({});
    const imported = exactSourceState();
    const { effect, result } = createStateImportEffect({ base, imported });
    const proposal: ProposalStatement = {
      schema: 't3x/statement/v1',
      subjects: [describeProtocolObject(effect)],
      actor: { kind: 'agent', id: 'agent:importer' },
      predicateType: 't3x.proposal/v1',
      predicate: {
        intent: { mode: 'unspecified' },
        rationale: { mode: 'unspecified' },
      },
    };
    const replayStatement = buildReplayVerificationStatement({
      effect,
      actor: { kind: 'service', id: 'verifier:local' },
      predicate: {
        tool: { name: 't3x-replay', version: '1.0.0' },
        run: { id: 'run:state-import:1', recordedAt: RECORDED_AT },
        environment: { mode: 'unspecified' },
        outcome: 'verified',
        result: describeProtocolObject(result),
      },
    });
    const bound = createAcceptancePolicyResource({
      policy: acceptedPolicy(),
      uri: 't3x://project/policies/state-import',
    });
    const decision = createDecisionStatement({
      actorContext: { actor: { kind: 'human', id: 'human:maintainer' } },
      effect,
      observationScope: { completeness: 'complete', sources: ['project-store'] },
      outcome: 'accepted',
      policy: bound.policy,
      policyResource: bound.resource,
      proposal,
      rationale: { mode: 'unspecified' },
      statements: [{ statement: replayStatement, issuerContext: { actor: replayStatement.actor } }],
      decidedAt: DECIDED_AT,
    });
    if (!decision.ok) throw new Error('fixture State import Decision was not permitted');

    const resolver = new InMemoryObjectResolver([
      base,
      imported,
      effect,
      proposal,
      replayStatement,
    ]);
    await expect(
      createCommitV2({ parents: [], decision: decision.decision, resolver })
    ).resolves.toMatchObject({
      parents: [],
      result: describeProtocolObject(imported),
    });
  });

  it('does not let direct driver calls bypass exact input-set checks', () => {
    const base = createYOpsState({});
    const imported = exactSourceState();
    expect(() =>
      stateImportMutationDriver.execute(
        base,
        definitionFor(imported),
        new Map([['ambient', imported]])
      )
    ).toThrowError(expect.objectContaining({ code: 'INTEGRITY_CHAIN_INVALID' }));
  });
});
