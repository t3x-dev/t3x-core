import type { TransitionScope } from '@t3x-dev/core';
import { describe, expect, it, vi } from 'vitest';
import {
  assertCloudIdentityCompatibility,
  CLOUD_IDENTITY_COMPATIBILITY,
  type CloudSessionPort,
  resolveCloudSessionPrincipal,
} from '../identity/cloud-identity-adapter';

const coreScopes: TransitionScope[] = [
  'transition:inspect',
  'transition:propose',
  'transition:commit:create',
];

function sessionPort(session: Awaited<ReturnType<CloudSessionPort['resolve']>>): CloudSessionPort {
  return {
    resolve: vi.fn().mockResolvedValue(session),
  };
}

describe('Cloud identity adapter', () => {
  it('maps one active Cloud session to the canonical Core principal', async () => {
    const port = sessionPort({
      id: 'cloud_session_1',
      userId: 'user_stable',
      accountId: 'acct_cloud',
      expiresAt: '2026-12-01T00:00:00.000Z',
      revokedAt: null,
      allowedScopes: ['transition:inspect', 'transition:propose'],
    });

    const principal = await resolveCloudSessionPrincipal(port, {
      sessionId: 'cloud_session_1',
      coreScopes,
      ingress: 'http',
      evaluatedAt: '2026-11-02T00:00:00.000Z',
    });

    expect(principal).toMatchObject({
      subject: { kind: 'human', principal_id: 'user_stable' },
      actor: { kind: 'human', id: 'user:user_stable' },
      userId: 'user_stable',
      accountId: 'acct_cloud',
      sessionId: 'cloud_session_1',
      credential: { kind: 'deployment', id: 'cloud_session_1' },
      scopes: ['transition:inspect', 'transition:propose'],
    });
  });

  it('lets Cloud narrow Core scopes but never grant a new scope', async () => {
    const port = sessionPort({
      id: 'cloud_session_2',
      userId: 'user_stable',
      accountId: 'acct_cloud',
      expiresAt: '2026-12-01T00:00:00.000Z',
      revokedAt: null,
      allowedScopes: ['transition:inspect', 'transition:verify'],
    });

    const principal = await resolveCloudSessionPrincipal(port, {
      sessionId: 'cloud_session_2',
      coreScopes,
      ingress: 'websocket',
      evaluatedAt: '2026-11-02T00:00:00.000Z',
    });

    expect(principal?.scopes).toEqual(['transition:inspect']);
  });

  it.each([
    { revokedAt: '2026-11-01T00:00:00.000Z', expiresAt: '2026-12-01T00:00:00.000Z' },
    { revokedAt: null, expiresAt: '2026-11-01T00:00:00.000Z' },
  ])('rejects a revoked or expired Cloud session on every request', async (state) => {
    const principal = await resolveCloudSessionPrincipal(
      sessionPort({
        id: 'cloud_session_inactive',
        userId: 'user_stable',
        accountId: 'acct_cloud',
        allowedScopes: coreScopes,
        ...state,
      }),
      {
        sessionId: 'cloud_session_inactive',
        coreScopes,
        ingress: 'http',
        evaluatedAt: '2026-11-02T00:00:00.000Z',
      }
    );

    expect(principal).toBeNull();
  });

  it('rejects a Session port response for a different session id', async () => {
    const principal = await resolveCloudSessionPrincipal(
      sessionPort({
        id: 'cloud_session_other',
        userId: 'user_stable',
        accountId: 'acct_cloud',
        expiresAt: '2026-12-01T00:00:00.000Z',
        revokedAt: null,
        allowedScopes: coreScopes,
      }),
      {
        sessionId: 'cloud_session_requested',
        coreScopes,
        ingress: 'http',
        evaluatedAt: '2026-11-02T00:00:00.000Z',
      }
    );

    expect(principal).toBeNull();
  });

  it('fails closed when the Cloud adapter compatibility version drifts', () => {
    expect(() =>
      assertCloudIdentityCompatibility({
        coreIdentityVersion: CLOUD_IDENTITY_COMPATIBILITY.coreIdentityVersion + 1,
        sessionPortVersion: CLOUD_IDENTITY_COMPATIBILITY.sessionPortVersion,
      })
    ).toThrow(/incompatible/i);
  });
});
