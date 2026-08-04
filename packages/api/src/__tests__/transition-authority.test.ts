import type { ApiKey } from '@t3x-dev/core';
import { type AnyDB, insertProject } from '@t3x-dev/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  deriveTrustedTransitionPrincipal,
  requireTransitionAuthority,
  resolveTransitionControlPlane,
  TransitionPolicyBindingRequiredError,
  TransitionProjectScopeDeniedError,
  TransitionScopeDeniedError,
} from '../lib/transition-authority';
import { setupTestDB, testData } from './setup';

function key(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 'ak_agent',
    key_prefix: 't3xk_age',
    key_hash: 'hash',
    name: 'Agent',
    project_id: 'project_one',
    user_id: null,
    principal_kind: 'agent',
    transition_scopes: ['transition:propose'],
    created_at: '2026-07-31T00:00:00.000Z',
    last_used_at: null,
    revoked_at: null,
    ...overrides,
  };
}

describe('Transition API authority', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
    projectId = (await insertProject(db, testData.project({ name: 'Authority project' })))
      .projectId;
  });

  afterAll(async () => cleanup());

  it('derives actor identity from the authenticated credential', () => {
    expect(deriveTrustedTransitionPrincipal(key()).actor).toEqual({
      kind: 'agent',
      id: 'agent:api-key:ak_agent',
    });
    expect(
      deriveTrustedTransitionPrincipal(
        key({ id: 'ak_human', principal_kind: 'human', user_id: 'user_one' })
      ).actor
    ).toEqual({ kind: 'human', id: 'user:user_one' });
  });

  it('requires each capability independently', () => {
    expect(() =>
      requireTransitionAuthority({
        apiKey: key(),
        projectId: 'project_one',
        scope: 'transition:inspect',
      })
    ).toThrow(TransitionScopeDeniedError);
  });

  it('rejects cross-project use even when the credential has the requested scope', () => {
    expect(() =>
      requireTransitionAuthority({
        apiKey: key(),
        projectId: 'project_two',
        scope: 'transition:propose',
      })
    ).toThrow(TransitionProjectScopeDeniedError);
  });

  it('preserves the existing trusted local mode without fabricating credential scopes', () => {
    expect(
      requireTransitionAuthority({
        apiKey: undefined,
        projectId: 'local-project',
        scope: 'transition:ref:advance',
      })
    ).toEqual({
      actor: { kind: 'human', id: 'human:local-user' },
      keyId: null,
      projectId: null,
      scopes: [],
    });
  });

  it('denies agent Decision authority when the ref has no server-selected policy', async () => {
    await expect(
      resolveTransitionControlPlane({
        db,
        apiKey: key({
          project_id: projectId,
          transition_scopes: ['transition:decide:accept'],
        }),
        projectId,
        refName: 'main',
        scope: 'transition:decide:accept',
      })
    ).rejects.toBeInstanceOf(TransitionPolicyBindingRequiredError);
  });
});
