import type { RequestPrincipal } from '@t3x-dev/application';
import type { ApiKey, TransitionScope } from '@t3x-dev/core';
import type { WebSession } from '@t3x-dev/storage';
import type { Context } from 'hono';
import type { AppEnv } from '../types';

type ApiIngress = Extract<RequestPrincipal['ingress'], 'http' | 'websocket'>;

export const WEB_SESSION_TOKEN_PREFIX = 't3xs_';
export const WEB_SESSION_SCOPES = [
  'transition:inspect',
  'transition:propose',
  'transition:verify',
  'transition:decide:accept',
  'transition:decide:reject',
  'transition:commit:create',
  'transition:ref:advance',
] satisfies TransitionScope[];

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
      apiKey.principal_kind !== 'human' && apiKey.delegator_user_id
        ? { kind: 'human', id: `user:${apiKey.delegator_user_id}` }
        : null,
    workspaceOwner:
      humanUserId !== null ? { kind: 'human', principal_id: humanUserId } : { ...subject },
    userId: humanUserId,
    accountId: null,
    sessionId: null,
    credential: {
      kind: apiKey.credential_kind ?? 'api_key',
      id: apiKey.id,
      projectId: apiKey.project_id,
      namespaceId: apiKey.namespace_id ?? null,
    },
    scopes: apiKey.transition_scopes,
    ingress,
  });
}

export function requestPrincipalFromSession(
  session: WebSession,
  ingress: ApiIngress
): RequestPrincipal {
  return freezePrincipal({
    subject: { kind: 'human', principal_id: session.user_id },
    actor: { kind: 'human', id: `user:${session.user_id}` },
    delegator: null,
    workspaceOwner: { kind: 'human', principal_id: session.user_id },
    userId: session.user_id,
    accountId: null,
    sessionId: session.id,
    credential: { kind: 'session', id: session.id, projectId: null, namespaceId: null },
    scopes: WEB_SESSION_SCOPES,
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
    credential: { kind: 'runner_service', id: null, projectId: null, namespaceId: null },
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
    credential: { kind: 'local_dev', id: null, projectId: null, namespaceId: null },
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
          namespace_id: apiKey.namespace_id ?? null,
          principal_kind: apiKey.principal_kind ?? 'human',
          credential_kind: apiKey.credential_kind ?? 'api_key',
          delegator_user_id: apiKey.delegator_user_id ?? null,
          transition_scopes: apiKey.transition_scopes ?? [],
          expires_at: apiKey.expires_at ?? null,
          revocation_reason: apiKey.revocation_reason ?? null,
        },
        'http'
      )
    : undefined;
}

export function setRequestPrincipal(c: Context<AppEnv>, principal: RequestPrincipal): void {
  c.set('requestPrincipal', principal);
}
