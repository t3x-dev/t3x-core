export function isAuthenticationDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.AUTH_DISABLED?.toLowerCase() !== 'true') return false;
  if (env.NODE_ENV !== 'production') return true;
  return env.T3X_ALLOW_AUTH_DISABLED_IN_PRODUCTION?.toLowerCase() === 'true';
}
