import type { RequestPrincipal } from '@t3x-dev/application';
import type { ApiKey } from '@t3x-dev/core';
import type { Context } from 'hono';
import type { AppEnv } from '../types';

type ApiIngress = Extract<RequestPrincipal['ingress'], 'http' | 'websocket'>;

function freezePrincipal(principal: RequestPrincipal): RequestPrincipal {
  return Object.freeze({
    ...principal,
    subject: Object.freeze({ ...principal.subject }),
    actor: Object.freeze({ ...principal.actor }),
    delegator: principal.delegator ? Object.freeze({ ...principal.delegator }) : null,
    workspaceOwner: principal.workspaceOwner
      ? Object.freeze({ ...principal.workspaceOwner })
      : null,
    credential: Object.freeze({ ...principal.credential }),
    scopes: Object.freeze([...principal.scopes]),
  });
}

export function requestPrincipalFromApiKey(apiKey: ApiKey, ingress: ApiIngress): RequestPrincipal {
  const humanUserId = apiKey.user_id;
  const directHuman = apiKey.principal_kind === 'human' && humanUserId !== null;
  const subject = directHuman
    ? { kind: 'human' as const, principal_id: humanUserId }
    : { kind: apiKey.principal_kind, principal_id: apiKey.id };

  return freezePrincipal({
    subject,
    actor: {
      kind: apiKey.principal_kind,
      id: directHuman ? `user:${humanUserId}` : `${apiKey.principal_kind}:api-key:${apiKey.id}`,
    },
    delegator:
      apiKey.principal_kind !== 'human' && humanUserId !== null
        ? { kind: 'human', id: `user:${humanUserId}` }
        : null,
    workspaceOwner:
      humanUserId !== null ? { kind: 'human', principal_id: humanUserId } : { ...subject },
    userId: humanUserId,
    accountId: null,
    sessionId: null,
    credential: {
      kind: 'api_key',
      id: apiKey.id,
      projectId: apiKey.project_id,
    },
    scopes: apiKey.transition_scopes,
    ingress,
  });
}

export function runnerRequestPrincipal(): RequestPrincipal {
  return freezePrincipal({
    subject: { kind: 'service', principal_id: 'service:runner' },
    actor: { kind: 'service', id: 'service:runner' },
    delegator: null,
    workspaceOwner: null,
    userId: null,
    accountId: null,
    sessionId: null,
    credential: { kind: 'runner_service', id: null, projectId: null },
    scopes: [],
    ingress: 'runner',
  });
}

export function localDevelopmentRequestPrincipal(): RequestPrincipal {
  return freezePrincipal({
    subject: { kind: 'human', principal_id: 'local-user' },
    actor: { kind: 'human', id: 'human:local-user' },
    delegator: null,
    workspaceOwner: null,
    userId: null,
    accountId: null,
    sessionId: null,
    credential: { kind: 'local_dev', id: null, projectId: null },
    scopes: [],
    ingress: 'local',
  });
}

export function getRequestPrincipal(c: Context): RequestPrincipal | undefined {
  const principal = c.get('requestPrincipal') as RequestPrincipal | undefined;
  if (principal) return principal;

  // Compatibility for trusted deployment middleware during the task-15 rollout.
  const apiKey = c.get('apiKey') as ApiKey | undefined;
  return apiKey
    ? requestPrincipalFromApiKey(
        {
          ...apiKey,
          user_id: apiKey.user_id ?? null,
          project_id: apiKey.project_id ?? null,
          principal_kind: apiKey.principal_kind ?? 'human',
          transition_scopes: apiKey.transition_scopes ?? [],
        },
        'http'
      )
    : undefined;
}

export function setRequestPrincipal(c: Context<AppEnv>, principal: RequestPrincipal): void {
  c.set('requestPrincipal', principal);
}
