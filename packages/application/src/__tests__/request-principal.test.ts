import { describe, expect, it } from 'vitest';
import {
  REQUEST_PRINCIPAL_CREDENTIAL_KINDS,
  REQUEST_PRINCIPAL_INGRESSES,
  type RequestPrincipal,
} from '../identity/request-principal';

describe('RequestPrincipal contract', () => {
  it('pins the closed credential and ingress values', () => {
    expect(REQUEST_PRINCIPAL_CREDENTIAL_KINDS).toEqual([
      'api_key',
      'pat',
      'mcp',
      'agent',
      'service',
      'session',
      'runner_service',
      'deployment',
      'local_dev',
    ]);
    expect(REQUEST_PRINCIPAL_INGRESSES).toEqual(['http', 'websocket', 'runner', 'local']);
  });

  it('keeps authorization, audit, ownership and credential identity separate', () => {
    const principal: RequestPrincipal = {
      subject: { kind: 'service', principal_id: 'ak_service' },
      actor: { kind: 'service', id: 'service:api-key:ak_service' },
      delegator: { kind: 'human', id: 'user:user_a' },
      workspaceOwner: { kind: 'human', principal_id: 'user_a' },
      userId: 'user_a',
      accountId: null,
      sessionId: null,
      credential: { kind: 'api_key', id: 'ak_service', projectId: 'proj_a', namespaceId: null },
      scopes: ['transition:inspect'],
      ingress: 'http',
    };

    expect(principal.subject.principal_id).toBe('ak_service');
    expect(principal.actor.id).toBe('service:api-key:ak_service');
    expect(principal.workspaceOwner?.principal_id).toBe('user_a');
  });
});
