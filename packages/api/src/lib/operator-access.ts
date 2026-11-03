import type { Context } from 'hono';
import { getRequestPrincipal } from './request-principal';

export const OPERATOR_USER_IDS_ENV = 'T3X_OPERATOR_USER_IDS';
export const OPERATOR_KEY_IDS_ENV = 'T3X_OPERATOR_KEY_IDS';

function configuredIds(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

function isAuthenticationDisabled(env: NodeJS.ProcessEnv): boolean {
  if (env.AUTH_DISABLED?.toLowerCase() !== 'true') return false;
  if (env.NODE_ENV !== 'production') return true;
  return env.T3X_ALLOW_AUTH_DISABLED_IN_PRODUCTION?.toLowerCase() === 'true';
}

/**
 * Global administration is deliberately separate from ordinary human access.
 * Self-hosted deployments bootstrap operators with explicit user or API-key
 * identifiers; machine principals can never satisfy this boundary.
 */
export function hasOperatorAccess(c: Context, env: NodeJS.ProcessEnv = process.env): boolean {
  if (isAuthenticationDisabled(env)) return true;

  const principal = getRequestPrincipal(c);
  if (!principal || principal.subject.kind !== 'human') return false;

  const operatorUsers = configuredIds(env[OPERATOR_USER_IDS_ENV]);
  if (principal.userId && operatorUsers.has(principal.userId)) return true;

  return (
    principal.credential.id !== null &&
    configuredIds(env[OPERATOR_KEY_IDS_ENV]).has(principal.credential.id)
  );
}
