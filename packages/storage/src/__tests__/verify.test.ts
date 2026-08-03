/**
 * CommitV2 graph verification tests.
 */

import {
  authorizeDecisionForRepository,
  buildReplayVerificationStatement,
  type CommitDescriptor,
  createAcceptancePolicyResource,
  createCommitV2,
  describeCommitV2,
  describeTransitionObject,
  type Effect,
  InMemoryTransitionObjectResolver,
  type ProposalStatement,
  parseAcceptancePolicy,
  type RepositoryDecisionAuthority,
  type State,
} from '@t3x-dev/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { verifyCommitHash, verifyHashChain } from '../backup/verify';
import { ensureMainBranch } from '../queries/branches';
import { insertProject } from '../queries/projects';
import {
  createTransitionCommit,
  getTransitionCommit,
  recordRepositoryDecisionAuthorization,
} from '../queries/transition-commits';
import { createTestDB, testData } from './setup';

const DECIDED_AT = '2026-07-28T00:00:00.000Z';

function state(value: Record<string, unknown>): State {
  return {
    schema: 't3x/state/v1',
    codec: { mediaType: 'application/yaml', version: '1' },
    value,
  } as State;
}

function graph(base: State, result: State, suffix: string) {
  const effect: Effect = {
    schema: 't3x/effect/v1',
    base: describeTransitionObject(base),
    driver: {
      protocol: 't3x.dev/test',
      protocolVersion: '1',
      specDigest: `sha256:${'a'.repeat(64)}`,
    },
    operations: [{ op: 'set', path: '/value', value: suffix }],
    inputs: [],
    result: describeTransitionObject(result),
  };
  const proposal: ProposalStatement = {
    schema: 't3x/statement/v1',
    subjects: [describeTransitionObject(effect)],
    actor: { kind: 'agent', id: `agent:planner:${suffix}` },
    predicateType: 't3x.proposal/v1',
    predicate: {
      intent: { mode: 'inferred', value: `Apply ${suffix}`, evidence: [] },
      rationale: { mode: 'authored', value: `Prepare ${suffix}`, evidence: [] },
    },
  };
  const replay = buildReplayVerificationStatement({
    effect,
    actor: { kind: 'service', id: 'service:replay' },
    predicate: {
      outcome: 'verified',
      result: effect.result,
      tool: { name: 'test-replay', version: '1' },
      run: { id: `run:${suffix}`, recordedAt: DECIDED_AT },
      environment: { mode: 'unspecified' },
    },
  });
  return { base, result, effect, proposal, replay };
}

function authority(subject: ReturnType<typeof graph>): RepositoryDecisionAuthority {
  const bound = createAcceptancePolicyResource({
    policy: parseAcceptancePolicy({
      schema: 't3x.dev/acceptance-policy/v1',
      version: 1,
      authorization: {
        decide: { actors: { mode: 'any' } },
        override: { actors: { mode: 'any' } },
        allowSelfApproval: false,
      },
      claims: {
        intent: {
          allowedModes: ['inferred'],
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
        allowFailedValidation: true,
        allowMissingHumanConfirmation: false,
        allowMissingValidation: true,
      },
    }),
    uri: 't3x://project/policies/default',
  });
  return {
    async resolve() {
      return {
        actorContext: { actor: { kind: 'human', id: 'human:maintainer' } },
        observationScope: { completeness: 'complete', sources: ['project-store'] },
        policy: bound.policy,
        policyResource: bound.resource,
        statements: [{ statement: subject.replay, issuerContext: { actor: subject.replay.actor } }],
      };
    },
  };
}

async function commitState(
  db: AnyDB,
  input: {
    projectId: string;
    suffix: string;
    base: State;
    result: State;
    expectedHead: string | null;
    parents?: readonly CommitDescriptor[];
  }
) {
  const subject = graph(input.base, input.result, input.suffix);
  const issued = await authorizeDecisionForRepository({
    projectId: input.projectId,
    refName: 'main',
    proposal: subject.proposal,
    effect: subject.effect,
    outcome: 'accepted',
    rationale: { mode: 'unspecified' },
    decidedAt: DECIDED_AT,
    authority: authority(subject),
  });
  if (!issued.ok || issued.authorization === null) {
    throw new Error('Fixture Decision authorization failed');
  }

  const objects = [subject.base, subject.result, ...issued.authorization.objects];
  const resolver = new InMemoryTransitionObjectResolver(objects);
  for (const parent of input.parents ?? []) {
    const stored = await getTransitionCommit(db, input.projectId, parent.digest);
    if (stored !== null) resolver.put(stored.commit);
  }
  const commit = await createCommitV2({
    parents: input.parents ?? [],
    decision: issued.decision,
    resolver,
  });

  await recordRepositoryDecisionAuthorization(db, issued.authorization);
  return createTransitionCommit(db, {
    projectId: input.projectId,
    refName: 'main',
    expectedHead: input.expectedHead,
    commit,
    objects,
  });
}

describe('CommitV2 graph verification', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('verifyHashChain', () => {
    it('passes for empty project', async () => {
      const project = await insertProject(db, testData.project({ name: 'Empty Verify Project' }));
      const result = await verifyHashChain(db, project.projectId);

      expect(result.valid).toBe(true);
      expect(result.total).toBe(0);
      expect(result.verified_depth).toBe(0);
      expect(result.entry_points).toBe(0);
      expect(result.verified_at).toBeTruthy();
    });

    it('passes for valid single commit', async () => {
      const project = await insertProject(db, testData.project({ name: 'Single Verify Project' }));
      await ensureMainBranch(db, project.projectId);

      await commitState(db, {
        projectId: project.projectId,
        suffix: 'single',
        base: state({}),
        result: state({ note: 'Budget is $3000' }),
        expectedHead: null,
      });

      const result = await verifyHashChain(db, project.projectId);

      expect(result.valid).toBe(true);
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.errors.hash_mismatch).toHaveLength(0);
      expect(result.errors.parent_not_found).toHaveLength(0);
    });

    it('passes for valid chain and reports leaf depth', async () => {
      const project = await insertProject(db, testData.project({ name: 'Chain Verify Project' }));
      await ensureMainBranch(db, project.projectId);

      const root = await commitState(db, {
        projectId: project.projectId,
        suffix: 'root',
        base: state({}),
        result: state({ note: 'Root sentence' }),
        expectedHead: null,
      });
      const parent = describeCommitV2(root.commit);

      await commitState(db, {
        projectId: project.projectId,
        suffix: 'child',
        base: state({ note: 'Root sentence' }),
        result: state({ note: 'Child sentence' }),
        expectedHead: root.digest,
        parents: [parent],
      });

      const result = await verifyHashChain(db, project.projectId);

      expect(result.valid).toBe(true);
      expect(result.verified_depth).toBeGreaterThanOrEqual(1);
      expect(result.entry_points).toBeGreaterThanOrEqual(1);
    });
  });

  describe('verifyCommitHash', () => {
    it('passes for valid CommitV2 object', async () => {
      const project = await insertProject(
        db,
        testData.project({ name: 'Descriptor Verify Project' })
      );
      await ensureMainBranch(db, project.projectId);

      const created = await commitState(db, {
        projectId: project.projectId,
        suffix: 'single-check',
        base: state({}),
        result: state({ note: 'Valid commit' }),
        expectedHead: null,
      });

      const result = verifyCommitHash(created.commit);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('fails for malformed CommitV2 object', () => {
      const result = verifyCommitHash({ schema: 't3x/commit/v2' } as never);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Hash verification failed');
    });
  });
});
