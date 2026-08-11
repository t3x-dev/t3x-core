import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type AcceptancePolicy,
  authorizeDecisionForRepository,
  buildReplayVerificationStatement,
  type CommitDescriptor,
  type CommitV2,
  compileProposalDraft,
  createAcceptancePolicyResource,
  createCommitV2,
  createHumanProposalDraft,
  createYOpsEffect,
  createYOpsState,
  createYSchemaResourceDescriptor,
  describeCommitV2,
  describeTransitionObject,
  type Effect,
  InMemoryTransitionObjectResolver,
  type ProposalStatement,
  parseAcceptancePolicy,
  type RepositoryDecisionAuthority,
  runYSchemaStatementProvider,
  type State,
  type StatementObservation,
  YSCHEMA_NATIVE_PROFILE,
  type YValue,
  yopsMutationDrivers,
} from '@t3x-dev/core';
import { type ProtocolValue, verifyEffect } from '@t3x-dev/transition';
import { parseYSchema } from '@t3x-dev/yschema';
import yaml from 'js-yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { ensureMainBranch, findBranchByName } from '../queries/branches';
import { insertProject } from '../queries/projects';
import {
  createTransitionCommit,
  listCommitHistory,
  recordRepositoryDecisionAuthorization,
  TransitionHeadConflictError,
} from '../queries/transition-commits';
import { createTestDB, testData } from './setup';

const BASE_PATH = resolve(
  process.cwd(),
  '../core/src/transition-reference/__fixtures__/esphome/base.yaml'
);
const RESULT_PATH = resolve(
  process.cwd(),
  '../core/src/transition-reference/__fixtures__/esphome/result.yaml'
);
const SCHEMA_PATH = resolve(process.cwd(), '../yschema/examples/esphome-device.yschema.yaml');

const DECIDED_AT = '2026-07-29T00:00:00.000Z';
const SCHEMA_URI = 'urn:t3x:reference:esphome-device:yschema:0.1.0';
const PROPOSER = { kind: 'human', id: 'human:operator' } as const;
const DECIDER = { kind: 'human', id: 'human:maintainer' } as const;
const REPLAY_ISSUER = { kind: 'service', id: 'service:replay' } as const;
const VALIDATION_ISSUER = { kind: 'service', id: 'validator:yschema' } as const;
const REPLAY_TOOL = { name: '@t3x-dev/transition', version: '0.1.0' } as const;
const VALIDATION_TOOL = { name: '@t3x-dev/yschema', version: '0.6.0' } as const;
const UNSPECIFIED_RESOURCE = { mode: 'unspecified' } as const;

const baseSource = readFileSync(BASE_PATH, 'utf8');
const resultSource = readFileSync(RESULT_PATH, 'utf8');
const schema = parseYSchema(readFileSync(SCHEMA_PATH, 'utf8'));
const schemaResource = createYSchemaResourceDescriptor(SCHEMA_URI, schema);

const forwardOperations = [
  { assert: { path: 'logger/level', equals: 'DEBUG' } },
  { set: { path: 'logger/level', value: 'INFO' } },
] as const;

const reverseOperations = [
  { assert: { path: 'logger/level', equals: 'INFO' } },
  { set: { path: 'logger/level', value: 'DEBUG' } },
] as const;

function bootstrapOperations(base: State): ProtocolValue[] {
  if (base.value === null || Array.isArray(base.value) || typeof base.value !== 'object') {
    throw new TypeError('ESPHome bootstrap requires a mapping State');
  }
  const value = base.value as Record<string, ProtocolValue>;
  return Object.keys(value)
    .sort()
    .map((path) => ({ set: { path, value: value[path] as ProtocolValue } }));
}

function isProtocolValue(value: unknown): value is ProtocolValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isProtocolValue);
  if (typeof value !== 'object') return false;
  return (
    Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every(isProtocolValue)
  );
}

/** Mirror the deliberately narrow Stage A loader without exporting a domain framework. */
function parseSupportedEspHomeYaml(source: string): Record<string, YValue> {
  const parsed: unknown = yaml.load(source, { schema: yaml.JSON_SCHEMA });
  if (
    !isProtocolValue(parsed) ||
    parsed === null ||
    Array.isArray(parsed) ||
    typeof parsed !== 'object'
  ) {
    throw new TypeError('ESPHome reference YAML must decode to one JSON-compatible mapping');
  }
  return parsed as Record<string, YValue>;
}

interface ReferenceGraph {
  base: State;
  result: State;
  effect: Effect;
  proposal: ProposalStatement;
  statements: StatementObservation[];
}

async function createReferenceGraph(input: {
  base: State;
  operations: readonly ProtocolValue[];
  suffix: string;
  why: string;
}): Promise<ReferenceGraph> {
  const { effect, result } = createYOpsEffect({
    base: input.base,
    operations: input.operations,
  });
  const replayed = await verifyEffect(effect, {
    resolver: new InMemoryTransitionObjectResolver([input.base]),
    drivers: yopsMutationDrivers,
  });
  const replay = buildReplayVerificationStatement({
    effect,
    actor: REPLAY_ISSUER,
    predicate: {
      outcome: 'verified',
      result: replayed.resultDescriptor,
      tool: REPLAY_TOOL,
      run: { id: `run:esphome-stage-b:replay:${input.suffix}`, recordedAt: DECIDED_AT },
      environment: UNSPECIFIED_RESOURCE,
    },
  });
  const compiled = compileProposalDraft({
    draft: createHumanProposalDraft({ why: input.why }),
    effect,
    actor: PROPOSER,
  });
  if (!compiled.ok) {
    throw new Error(`Reference Proposal compilation failed: ${JSON.stringify(compiled.issues)}`);
  }
  const validation = runYSchemaStatementProvider({
    state: result,
    schema,
    schemaResource,
    profile: YSCHEMA_NATIVE_PROFILE,
    context: UNSPECIFIED_RESOURCE,
    environment: UNSPECIFIED_RESOURCE,
    actor: VALIDATION_ISSUER,
    tool: VALIDATION_TOOL,
    run: { id: `run:esphome-stage-b:validation:${input.suffix}`, recordedAt: DECIDED_AT },
  });

  return {
    base: input.base,
    result,
    effect,
    proposal: compiled.proposal,
    statements: [
      { statement: replay, issuerContext: { actor: REPLAY_ISSUER } },
      { statement: validation, issuerContext: { actor: VALIDATION_ISSUER } },
    ],
  };
}

function acceptancePolicy(): AcceptancePolicy {
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
        issuers: { mode: 'one_of', values: [REPLAY_ISSUER] },
        tools: { mode: 'one_of', values: [REPLAY_TOOL] },
        environments: { mode: 'one_of', values: [UNSPECIFIED_RESOURCE] },
      },
      validation: {
        requirement: 'required',
        issuers: { mode: 'one_of', values: [VALIDATION_ISSUER] },
        tools: { mode: 'one_of', values: [VALIDATION_TOOL] },
        environments: { mode: 'one_of', values: [UNSPECIFIED_RESOURCE] },
        profiles: { mode: 'one_of', values: [YSCHEMA_NATIVE_PROFILE] },
        schemas: { mode: 'one_of', values: [schemaResource] },
        contexts: { mode: 'one_of', values: [UNSPECIFIED_RESOURCE] },
      },
      humanConfirmation: { issuers: { mode: 'any' } },
    },
    override: {
      allowClaimFailures: false,
      allowFailedValidation: true,
      allowMissingHumanConfirmation: false,
      allowMissingValidation: false,
    },
  });
}

function authority(graph: ReferenceGraph): RepositoryDecisionAuthority {
  const bound = createAcceptancePolicyResource({
    policy: acceptancePolicy(),
    uri: 't3x://reference/esphome-stage-b/policy',
  });
  return {
    async resolve() {
      return {
        actorContext: { actor: DECIDER },
        observationScope: {
          completeness: 'complete',
          sources: ['reference:esphome-stage-b'],
        },
        policy: bound.policy,
        policyResource: bound.resource,
        statements: graph.statements,
      };
    },
  };
}

async function authorize(input: {
  graph: ReferenceGraph;
  outcome: 'accepted' | 'overridden' | 'rejected';
  projectId: string;
  rationale?: { mode: 'authored'; value: string; evidence: [] };
}) {
  return authorizeDecisionForRepository({
    projectId: input.projectId,
    refName: 'main',
    proposal: input.graph.proposal,
    effect: input.graph.effect,
    outcome: input.outcome,
    rationale: input.rationale ?? { mode: 'unspecified' },
    decidedAt: DECIDED_AT,
    authority: authority(input.graph),
  });
}

async function createAuthorizedCommit(input: {
  db: AnyDB;
  graph: ReferenceGraph;
  projectId: string;
  parents: readonly CommitDescriptor[];
  expectedHead: string | null;
  outcome?: 'accepted' | 'overridden';
  rationale?: { mode: 'authored'; value: string; evidence: [] };
  parentObjects?: readonly CommitV2[];
}) {
  const issued = await authorize({
    graph: input.graph,
    outcome: input.outcome ?? 'accepted',
    projectId: input.projectId,
    rationale: input.rationale,
  });
  if (!issued.ok || issued.authorization === null) {
    throw new Error(`Reference Decision authorization failed: ${JSON.stringify(issued)}`);
  }
  await recordRepositoryDecisionAuthorization(input.db, issued.authorization);
  const objects = [
    input.graph.base,
    input.graph.result,
    ...issued.authorization.objects,
    ...(input.parentObjects ?? []),
  ];
  const commit = await createCommitV2({
    parents: input.parents,
    decision: issued.decision,
    resolver: new InMemoryTransitionObjectResolver(objects),
  });
  const created = await createTransitionCommit(input.db, {
    projectId: input.projectId,
    refName: 'main',
    expectedHead: input.expectedHead,
    commit,
    objects,
  });
  return { commit, created, issued, objects };
}

async function bootstrapProject(input: { db: AnyDB; projectId: string; suffix: string }) {
  const base = createYOpsState(parseSupportedEspHomeYaml(baseSource));
  const graph = await createReferenceGraph({
    base: createYOpsState({}),
    operations: bootstrapOperations(base),
    suffix: `genesis:${input.suffix}`,
    why: 'Track this ESPHome configuration as the initial reviewed version.',
  });
  expect(describeTransitionObject(graph.result)).toEqual(describeTransitionObject(base));
  const committed = await createAuthorizedCommit({
    db: input.db,
    graph,
    projectId: input.projectId,
    parents: [],
    expectedHead: null,
  });
  return { base, ...committed };
}

let db: AnyDB;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const setup = await createTestDB();
  db = setup.db;
  cleanup = setup.cleanup;
});

afterAll(async () => cleanup());

describe('ESPHome Stage B accepted transition', () => {
  it('accepts, advances, and reverts the same artifact without a Runner Statement', async () => {
    const project = await insertProject(db, testData.project({ name: 'ESPHome Revert Project' }));
    await ensureMainBranch(db, project.projectId);
    const genesis = await bootstrapProject({
      db,
      projectId: project.projectId,
      suffix: 'revert-project',
    });
    const base = genesis.base;
    const expectedResult = createYOpsState(parseSupportedEspHomeYaml(resultSource));
    const forward = await createReferenceGraph({
      base,
      operations: forwardOperations,
      suffix: 'forward',
      why: 'Reduce production log volume while retaining useful diagnostics.',
    });
    expect(forward.result).toEqual(expectedResult);
    expect(forward.proposal.predicate).toEqual({
      intent: { mode: 'unspecified' },
      rationale: {
        mode: 'authored',
        value: 'Reduce production log volume while retaining useful diagnostics.',
        evidence: [],
      },
    });

    const first = await createAuthorizedCommit({
      db,
      graph: forward,
      projectId: project.projectId,
      parents: [describeCommitV2(genesis.commit)],
      expectedHead: genesis.created.digest,
      parentObjects: [genesis.commit],
    });
    expect(first.issued.evaluation.considered).toHaveLength(2);
    expect(first.issued.evaluation.considered.map((item) => item.digest).sort()).toEqual(
      forward.statements.map((item) => describeTransitionObject(item.statement).digest).sort()
    );

    const reverse = await createReferenceGraph({
      base: forward.result,
      operations: reverseOperations,
      suffix: 'revert',
      why: 'Restore debug logging for a focused diagnosis.',
    });
    expect(describeTransitionObject(reverse.result)).toEqual(describeTransitionObject(base));
    const firstDescriptor = describeCommitV2(first.commit);
    const reverted = await createAuthorizedCommit({
      db,
      graph: reverse,
      projectId: project.projectId,
      parents: [firstDescriptor],
      expectedHead: first.created.digest,
      parentObjects: [first.commit],
    });

    const branch = await findBranchByName(db, project.projectId, 'main');
    const history = await listCommitHistory(db, project.projectId);
    expect(branch?.headCommitHash).toBe(reverted.created.digest);
    expect(reverted.commit.result).toEqual(describeTransitionObject(base));
    expect(history.filter((entry) => entry.format === 'transition_v2')).toHaveLength(3);

    await expect(
      createTransitionCommit(db, {
        projectId: project.projectId,
        refName: 'main',
        expectedHead: first.created.digest,
        commit: reverted.commit,
        objects: reverted.objects,
      })
    ).rejects.toBeInstanceOf(TransitionHeadConflictError);
    expect((await findBranchByName(db, project.projectId, 'main'))?.headCommitHash).toBe(
      reverted.created.digest
    );
    expect(
      (await listCommitHistory(db, project.projectId)).filter(
        (entry) => entry.format === 'transition_v2'
      )
    ).toHaveLength(3);
  });

  it('requires an explicit authorized override for a failed validation', async () => {
    const project = await insertProject(db, testData.project({ name: 'ESPHome Override Project' }));
    await ensureMainBranch(db, project.projectId);
    const genesis = await bootstrapProject({
      db,
      projectId: project.projectId,
      suffix: 'override-project',
    });
    const base = genesis.base;
    const graph = await createReferenceGraph({
      base,
      operations: [
        ...forwardOperations,
        { set: { path: 'esphome/name', value: 'Greenhouse Sensor' } },
      ],
      suffix: 'invalid-name',
      why: 'Keep a human-readable lab name during the migration window.',
    });
    expect(graph.statements[1]?.statement.predicate).toMatchObject({ outcome: 'failed' });

    const accepted = await authorize({
      graph,
      outcome: 'accepted',
      projectId: project.projectId,
    });
    expect(accepted).toMatchObject({
      ok: false,
      failures: [expect.objectContaining({ code: 'VALIDATION_FAILED', overrideable: true })],
    });

    const overridden = await createAuthorizedCommit({
      db,
      graph,
      projectId: project.projectId,
      parents: [describeCommitV2(genesis.commit)],
      expectedHead: genesis.created.digest,
      outcome: 'overridden',
      rationale: {
        mode: 'authored',
        value: 'Approved for one lab-only device while the naming migration is active.',
        evidence: [],
      },
      parentObjects: [genesis.commit],
    });
    expect(overridden.issued.decision.predicate).toMatchObject({
      outcome: 'overridden',
      rationale: {
        mode: 'authored',
        value: 'Approved for one lab-only device while the naming migration is active.',
      },
    });
    expect(overridden.commit.decision).toEqual(
      describeTransitionObject(overridden.issued.decision)
    );
    expect((await findBranchByName(db, project.projectId, 'main'))?.headCommitHash).toBe(
      overridden.created.digest
    );
  });

  it('content-addresses rejection without authorizing or advancing a CommitV2', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'ESPHome Rejection Project' })
    );
    await ensureMainBranch(db, project.projectId);
    const genesis = await bootstrapProject({
      db,
      projectId: project.projectId,
      suffix: 'rejection-project',
    });
    const graph = await createReferenceGraph({
      base: genesis.base,
      operations: forwardOperations,
      suffix: 'rejected',
      why: 'Reduce production log volume while retaining useful diagnostics.',
    });
    const rejected = await authorize({
      graph,
      outcome: 'rejected',
      projectId: project.projectId,
    });
    expect(rejected).toMatchObject({
      ok: true,
      decision: { predicate: { outcome: 'rejected' } },
      authorization: null,
    });
    if (!rejected.ok) throw new Error('Reference rejection was not permitted');
    expect(describeTransitionObject(rejected.decision).digest).toMatch(/^sha256:[0-9a-f]{64}$/);

    await expect(
      createCommitV2({
        parents: [describeCommitV2(genesis.commit)],
        decision: rejected.decision,
        resolver: new InMemoryTransitionObjectResolver([
          graph.base,
          graph.result,
          graph.effect,
          graph.proposal,
          ...graph.statements.map((item) => item.statement),
          genesis.commit,
        ]),
      })
    ).rejects.toMatchObject({ code: 'INTEGRITY_CHAIN_INVALID' });
    expect((await findBranchByName(db, project.projectId, 'main'))?.headCommitHash).toBe(
      genesis.created.digest
    );
    expect(
      (await listCommitHistory(db, project.projectId)).filter(
        (entry) => entry.format === 'transition_v2'
      )
    ).toHaveLength(1);
  });
});
