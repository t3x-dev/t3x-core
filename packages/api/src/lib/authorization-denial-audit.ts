import type { NamespaceAction, ProjectAction, RequestPrincipal } from '@t3x-dev/application';
import { pinoLogger } from '../middleware/logger';

type AuthorizationResource = {
  kind: 'namespace' | 'project' | 'branch' | 'workspace' | 'project_resource';
  id: string;
  namespace_id?: string;
  project_id?: string;
};

function effectiveEntrypoint(principal: RequestPrincipal | null | undefined): string {
  if (!principal) return 'unknown';
  if (principal.credential.kind === 'mcp') return 'mcp';
  return principal.ingress;
}

/** Emit one secret-free, structured record for every application authorization denial. */
export function logAuthorizationDenial(input: {
  principal: RequestPrincipal | null | undefined;
  action: NamespaceAction | ProjectAction;
  resource: AuthorizationResource;
  reason: string;
}): void {
  const principal = input.principal;
  pinoLogger.warn(
    {
      event: 'authorization.denied',
      entrypoint: effectiveEntrypoint(principal),
      principal: principal
        ? {
            subject: principal.subject,
            actor: principal.actor,
            delegator: principal.delegator,
            credential: { kind: principal.credential.kind, id: principal.credential.id },
          }
        : null,
      action: input.action,
      resource: input.resource,
      reason: input.reason,
    },
    'authorization denied'
  );
}
