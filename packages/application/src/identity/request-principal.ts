import type { TransitionScope } from '@t3x-dev/core';
import type { CanonicalPrincipalDto, PrincipalKind } from './namespace-authorization';

export const REQUEST_PRINCIPAL_CREDENTIAL_KINDS = [
  'api_key',
  'session',
  'runner_service',
  'deployment',
  'local_dev',
] as const;

export const REQUEST_PRINCIPAL_INGRESSES = [
  'http',
  'websocket',
  'runner',
  'local',
] as const;

export interface RequestPrincipal {
  readonly subject: CanonicalPrincipalDto;
  readonly actor: Readonly<{ kind: PrincipalKind; id: string }>;
  readonly delegator: Readonly<{ kind: 'human'; id: string }> | null;
  readonly workspaceOwner: CanonicalPrincipalDto | null;
  readonly userId: string | null;
  readonly accountId: string | null;
  readonly sessionId: string | null;
  readonly credential: Readonly<{
    kind: (typeof REQUEST_PRINCIPAL_CREDENTIAL_KINDS)[number];
    id: string | null;
    projectId: string | null;
  }>;
  readonly scopes: readonly TransitionScope[];
  readonly ingress: (typeof REQUEST_PRINCIPAL_INGRESSES)[number];
}
