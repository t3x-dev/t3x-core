import { canonicalizeAcceptancePolicy, createAcceptancePolicyResource } from '@t3x-dev/core';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { insertProject } from '../queries/projects';
import {
  bindTransitionPolicy,
  getTransitionPolicyBinding,
  TransitionPolicyBindingIntegrityError,
  unbindTransitionPolicy,
} from '../queries/transition-policy-bindings';
import { transitionPolicyResources } from '../schema-transition-commits';
import { createTestDB, testData } from './setup';

function policy(allowSelfApproval: boolean) {
  return {
    schema: 't3x.dev/acceptance-policy/v1',
    version: 1,
    authorization: {
      decide: { actors: { mode: 'any' } },
      override: { actors: { mode: 'any' } },
      allowSelfApproval,
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
      allowMissingValidation: false,
    },
  };
}

describe('Transition AcceptancePolicy bindings', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => cleanup());

  it('stores immutable policy bytes and updates only the project/ref pointer', async () => {
    const project = await insertProject(db, testData.project({ name: 'Policy binding' }));
    const first = await bindTransitionPolicy(db, {
      projectId: project.projectId,
      refName: 'feature/device',
      uri: 't3x://policies/device-review/v1',
      policy: policy(false),
      actor: { kind: 'human', id: 'user:maintainer' },
    });
    const expected = createAcceptancePolicyResource({
      uri: 't3x://policies/device-review/v1',
      policy: policy(false),
    });
    expect(first.resource).toEqual(expected.resource);
    expect(first.updatedBy).toEqual({ kind: 'human', id: 'user:maintainer' });

    const second = await bindTransitionPolicy(db, {
      projectId: project.projectId,
      refName: 'feature/device',
      uri: 't3x://policies/device-review/v2',
      policy: policy(true),
      actor: { kind: 'human', id: 'user:maintainer' },
    });
    expect(second.resource.digest).not.toBe(first.resource.digest);
    await expect(
      getTransitionPolicyBinding(db, project.projectId, 'feature/device')
    ).resolves.toMatchObject({ resource: second.resource });

    const resources = await db.select().from(transitionPolicyResources);
    expect(resources.map((row) => row.digest).sort()).toEqual(
      [first.resource.digest, second.resource.digest].sort()
    );
  });

  it('fails closed when persisted policy bytes do not match the bound digest', async () => {
    const project = await insertProject(db, testData.project({ name: 'Tampered policy' }));
    const bound = await bindTransitionPolicy(db, {
      projectId: project.projectId,
      refName: 'main',
      uri: 't3x://policies/tamper-test/v1',
      policy: policy(false),
      actor: { kind: 'human', id: 'user:auditor' },
    });
    await db
      .update(transitionPolicyResources)
      .set({ canonicalJson: JSON.stringify(policy(true)) })
      .where(eq(transitionPolicyResources.digest, bound.resource.digest));

    await expect(getTransitionPolicyBinding(db, project.projectId, 'main')).rejects.toBeInstanceOf(
      TransitionPolicyBindingIntegrityError
    );
    await db
      .update(transitionPolicyResources)
      .set({ canonicalJson: canonicalizeAcceptancePolicy(bound.policy) })
      .where(eq(transitionPolicyResources.digest, bound.resource.digest));
  });

  it('keeps bindings project-local and makes absence explicit', async () => {
    const first = await insertProject(db, testData.project({ name: 'First policy project' }));
    const second = await insertProject(db, testData.project({ name: 'Second policy project' }));
    await bindTransitionPolicy(db, {
      projectId: first.projectId,
      refName: 'main',
      uri: 't3x://policies/project-local/v1',
      policy: policy(false),
      actor: { kind: 'human', id: 'user:maintainer' },
    });

    await expect(getTransitionPolicyBinding(db, second.projectId, 'main')).resolves.toBeNull();
    await expect(unbindTransitionPolicy(db, first.projectId, 'main')).resolves.toBe(true);
    await expect(getTransitionPolicyBinding(db, first.projectId, 'main')).resolves.toBeNull();
  });
});
