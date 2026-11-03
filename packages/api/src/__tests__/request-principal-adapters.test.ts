import type { ApiKey } from '@t3x-dev/core';
import type { WebSession } from '@t3x-dev/storage';
import { describe, expect, it } from 'vitest';
import {
  localDevelopmentRequestPrincipal,
  requestPrincipalFromApiKey,
  requestPrincipalFromSession,
  runnerRequestPrincipal,
} from '../lib/request-principal';

function apiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 'ak_human',
    key_prefix: 't3xk_test',
    key_hash: 'hash',
    name: 'test',
    project_id: 'proj_a',
    namespace_id: null,
    user_id: 'user_a',
    principal_kind: 'human',
    credential_kind: 'api_key',
    delegator_user_id: null,
    transition_scopes: ['transition:inspect'],
    created_at: '2026-11-02T00:00:00.000Z',
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
    revocation_reason: null,
    ...overrides,
  };
}

describe('RequestPrincipal API adapters', () => {
  it('derives the same human identity from a browser session', () => {
    const session: WebSession = {
      id: 'sess_browser',
      token_hash: 'hash',
      user_id: 'user_a',
      auth_method: 'local_password',
      user_agent: 'Test Browser',
      created_at: '2026-11-02T00:00:00.000Z',
      last_seen_at: '2026-11-02T00:00:00.000Z',
      expires_at: '2026-12-02T00:00:00.000Z',
      revoked_at: null,
    };

    expect(requestPrincipalFromSession(session, 'http')).toEqual({
      subject: { kind: 'human', principal_id: 'user_a' },
      actor: { kind: 'human', id: 'user:user_a' },
      delegator: null,
      workspaceOwner: { kind: 'human', principal_id: 'user_a' },
      userId: 'user_a',
      accountId: null,
      sessionId: 'sess_browser',
      credential: { kind: 'session', id: 'sess_browser', projectId: null, namespaceId: null },
      scopes: [
        'transition:inspect',
        'transition:propose',
        'transition:verify',
        'transition:decide:accept',
        'transition:decide:reject',
        'transition:commit:create',
        'transition:ref:advance',
      ],
      ingress: 'http',
    });
  });

  it('derives a direct human identity from a user-bound human key', () => {
    expect(requestPrincipalFromApiKey(apiKey(), 'http')).toEqual({
      subject: { kind: 'human', principal_id: 'user_a' },
      actor: { kind: 'human', id: 'user:user_a' },
      delegator: null,
      workspaceOwner: { kind: 'human', principal_id: 'user_a' },
      userId: 'user_a',
      accountId: null,
      sessionId: null,
      credential: { kind: 'api_key', id: 'ak_human', projectId: 'proj_a', namespaceId: null },
      scopes: ['transition:inspect'],
      ingress: 'http',
    });
  });

  it('keeps delegated service authority separate from its human owner', () => {
    const principal = requestPrincipalFromApiKey(
      apiKey({
        id: 'ak_service',
        principal_kind: 'service',
        credential_kind: 'mcp',
        delegator_user_id: 'user_delegator',
      }),
      'http'
    );

    expect(principal).toMatchObject({
      subject: { kind: 'service', principal_id: 'ak_service' },
      actor: { kind: 'service', id: 'service:api-key:ak_service' },
      delegator: { kind: 'human', id: 'user:user_delegator' },
      workspaceOwner: { kind: 'human', principal_id: 'user_a' },
      userId: 'user_a',
      credential: { kind: 'mcp', id: 'ak_service', projectId: 'proj_a', namespaceId: null },
    });
  });

  it('uses an unbound machine credential as its own subject and owner', () => {
    expect(
      requestPrincipalFromApiKey(
        apiKey({
          id: 'ak_agent',
          user_id: null,
          principal_kind: 'agent',
          credential_kind: 'agent',
        }),
        'http'
      )
    ).toMatchObject({
      subject: { kind: 'agent', principal_id: 'ak_agent' },
      actor: { kind: 'agent', id: 'agent:api-key:ak_agent' },
      delegator: null,
      workspaceOwner: { kind: 'agent', principal_id: 'ak_agent' },
      userId: null,
    });
  });

  it('changes only ingress between HTTP and WebSocket for one credential', () => {
    const key = apiKey({ id: 'ak_service', principal_kind: 'service' });
    const http = requestPrincipalFromApiKey(key, 'http');
    const websocket = requestPrincipalFromApiKey(key, 'websocket');

    expect({ ...http, ingress: undefined }).toEqual({ ...websocket, ingress: undefined });
    expect(http.ingress).toBe('http');
    expect(websocket.ingress).toBe('websocket');
  });

  it('copies and freezes trusted credential scopes', () => {
    const key = apiKey();
    const principal = requestPrincipalFromApiKey(key, 'http');
    key.transition_scopes.push('transition:verify');

    expect(principal.scopes).toEqual(['transition:inspect']);
    expect(Object.isFrozen(principal)).toBe(true);
    expect(Object.isFrozen(principal.scopes)).toBe(true);
  });

  it('provides stable Runner and local-development identities', () => {
    expect(runnerRequestPrincipal()).toMatchObject({
      subject: { kind: 'service', principal_id: 'service:runner' },
      actor: { kind: 'service', id: 'service:runner' },
      workspaceOwner: null,
      credential: { kind: 'runner_service', id: null, projectId: null, namespaceId: null },
      ingress: 'runner',
    });
    expect(localDevelopmentRequestPrincipal()).toMatchObject({
      subject: { kind: 'human', principal_id: 'local-user' },
      actor: { kind: 'human', id: 'human:local-user' },
      workspaceOwner: null,
      credential: { kind: 'local_dev', id: null, projectId: null, namespaceId: null },
      ingress: 'local',
    });
  });
});
