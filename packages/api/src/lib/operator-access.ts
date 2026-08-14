import type { ApiKey } from '@t3x-dev/core';
import type { Context } from 'hono';

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

  const apiKey = c.get('apiKey') as ApiKey | undefined;
  if (!apiKey || apiKey.principal_kind !== 'human') return false;

  const operatorUsers = configuredIds(env[OPERATOR_USER_IDS_ENV]);
  if (apiKey.user_id && operatorUsers.has(apiKey.user_id)) return true;

  return configuredIds(env[OPERATOR_KEY_IDS_ENV]).has(apiKey.id);
}
