import type { ApiKey } from '@t3x-dev/core';
import {
  type AnyDB,
  bindTransitionPolicy,
  ensureMainBranch,
  insertProject,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  deriveTrustedTransitionPrincipal,
  requireTransitionAuthority,
  resolveCompatibilityTransitionWriteAuthority,
  resolveTransitionControlPlane,
  TransitionPolicyBindingRequiredError,
  TransitionProjectScopeDeniedError,
  TransitionScopeDeniedError,
  toTrustedTransitionAuthor,
} from '../lib/transition-authority';
import { resolveWorkspaceTransitionAuthority } from '../lib/workspace-transition-authority';
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
    const service = deriveTrustedTransitionPrincipal(
      key({ id: 'ak_service', principal_kind: 'service' })
    );
    expect(service.actor).toEqual({ kind: 'service', id: 'service:api-key:ak_service' });
    expect(
      toTrustedTransitionAuthor(service, { type: 'human', id: 'spoofed', name: 'Spoofed' })
    ).toEqual({
      type: 'system',
      id: 'service:api-key:ak_service',
      name: 'service:api-key:ak_service',
    });
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

  it('preserves project-authorized human-key compatibility without legacy scopes', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'Legacy human authority project' })
    );

    const resolved = await resolveCompatibilityTransitionWriteAuthority({
      db,
      apiKey: key({
        id: 'ak_human_legacy',
        project_id: project.projectId,
        principal_kind: 'human',
        user_id: 'legacy_user',
        transition_scopes: [],
      }),
      projectId: project.projectId,
      refName: 'main',
    });

    expect(resolved).toEqual({
      principal: {
        actor: { kind: 'human', id: 'user:legacy_user' },
        keyId: 'ak_human_legacy',
        projectId: project.projectId,
        scopes: [],
      },
      policyBinding: null,
    });
  });

  it('requires every compatibility write scope for service principals', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'Service authority project' })
    );

    await expect(
      resolveCompatibilityTransitionWriteAuthority({
        db,
        apiKey: key({
          id: 'ak_service',
          project_id: project.projectId,
          principal_kind: 'service',
          transition_scopes: [
            'transition:decide:accept',
            'transition:commit:create',
            'transition:ref:advance',
          ],
        }),
        projectId: project.projectId,
        refName: 'main',
      })
    ).rejects.toMatchObject({
      code: 'TRANSITION_SCOPE_DENIED',
      scope: 'transition:propose',
    });

    await expect(
      resolveCompatibilityTransitionWriteAuthority({
        db,
        apiKey: key({
          id: 'ak_service',
          project_id: project.projectId,
          principal_kind: 'service',
          transition_scopes: [
            'transition:propose',
            'transition:commit:create',
            'transition:ref:advance',
          ],
        }),
        projectId: project.projectId,
        refName: 'main',
      })
    ).rejects.toMatchObject({
      code: 'TRANSITION_SCOPE_DENIED',
      scope: 'transition:decide:accept',
    });

    await expect(
      resolveCompatibilityTransitionWriteAuthority({
        db,
        apiKey: key({
          id: 'ak_service',
          project_id: project.projectId,
          principal_kind: 'service',
          transition_scopes: ['transition:propose', 'transition:decide:accept'],
        }),
        projectId: project.projectId,
        refName: 'main',
      })
    ).rejects.toMatchObject({
      code: 'TRANSITION_SCOPE_DENIED',
      scope: 'transition:commit:create',
    });

    await expect(
      resolveCompatibilityTransitionWriteAuthority({
        db,
        apiKey: key({
          id: 'ak_service',
          project_id: project.projectId,
          principal_kind: 'service',
          transition_scopes: [
            'transition:propose',
            'transition:decide:accept',
            'transition:commit:create',
          ],
        }),
        projectId: project.projectId,
        refName: 'main',
      })
    ).rejects.toMatchObject({
      code: 'TRANSITION_SCOPE_DENIED',
      scope: 'transition:ref:advance',
    });
  });

  it('fails closed when a fully scoped machine ref has no server policy', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'Unbound machine authority project' })
    );

    await expect(
      resolveCompatibilityTransitionWriteAuthority({
        db,
        apiKey: key({
          project_id: project.projectId,
          transition_scopes: [
            'transition:propose',
            'transition:decide:accept',
            'transition:commit:create',
            'transition:ref:advance',
          ],
        }),
        projectId: project.projectId,
        refName: 'main',
      })
    ).rejects.toBeInstanceOf(TransitionPolicyBindingRequiredError);
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

  it('preserves the authenticated agent and server-selected ref policy on compatibility paths', async () => {
    await ensureMainBranch(db, projectId);
    await upsertWorkspaceDraft(db, {
      project_id: projectId,
      workspace_id: 'workspace_authority',
      title: 'Authority workspace',
      target_branch: 'main',
      workspace_state: { id: 'workspace_authority', targetBranch: 'main' },
    });
    const binding = await bindTransitionPolicy(db, {
      projectId,
      refName: 'main',
      uri: 't3x://policies/workspace-authority-test',
      policy: {
        schema: 't3x.dev/acceptance-policy/v1',
        version: 1,
        authorization: {
          decide: { actors: { mode: 'any' } },
          override: { actors: { mode: 'any' } },
          allowSelfApproval: true,
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
      },
      actor: { kind: 'human', id: 'user:policy-admin' },
    });

    const resolved = await resolveWorkspaceTransitionAuthority({
      db,
      apiKey: key({
        project_id: projectId,
        transition_scopes: [
          'transition:propose',
          'transition:decide:accept',
          'transition:commit:create',
          'transition:ref:advance',
        ],
      }),
      projectId,
      workspaceId: 'workspace_authority',
      operation: { kind: 'decide', outcome: 'accepted' },
    });

    expect(resolved.principal.actor).toEqual({
      kind: 'agent',
      id: 'agent:api-key:ak_agent',
    });
    expect(resolved.policyBinding?.resource.digest).toBe(binding.resource.digest);

    await expect(
      resolveWorkspaceTransitionAuthority({
        db,
        apiKey: key({
          project_id: projectId,
          transition_scopes: ['transition:propose', 'transition:decide:accept'],
        }),
        projectId,
        workspaceId: 'workspace_authority',
        operation: { kind: 'decide', outcome: 'accepted' },
      })
    ).rejects.toMatchObject({
      code: 'TRANSITION_SCOPE_DENIED',
      scope: 'transition:commit:create',
    });
  });
});
