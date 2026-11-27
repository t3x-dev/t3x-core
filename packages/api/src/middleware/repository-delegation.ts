import type { Context, Next } from 'hono';
import { getDB } from '../lib/db';
import { createError } from '../lib/errors';
import { allowsRepositoryDelegationRequest } from '../lib/repository-delegation-surface';
import { getRequestPrincipal } from '../lib/request-principal';
import type { AppEnv } from '../types';

/** Both hosted and built-in authentication supply the trusted principal before this gate. */
export async function repositoryDelegationMiddleware(c: Context<AppEnv>, next: Next) {
  const principal = getRequestPrincipal(c);
  if (
    principal?.subject.kind !== 'agent' ||
    !['api_key', 'agent', 'mcp'].includes(principal.credential.kind)
  )
    return next();
  const id = principal.credential.id;
  if (!id || !(await allowsRepositoryDelegationRequest(c, await getDB(), id)))
    return c.json(createError('FORBIDDEN', 'This delegation does not grant this operation'), 403);
  return next();
}
