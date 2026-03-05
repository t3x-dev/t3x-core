/**
 * Local Auth Session Utilities
 *
 * Cookie-based session management for self-hosted deployments.
 * Stores the API key in a `t3x-session` cookie for authenticated requests.
 */

const COOKIE_NAME = 't3x-session';
const COOKIE_MAX_AGE_DAYS = 30;

/**
 * Store API key in session cookie.
 * Called after successful login/register.
 */
export function setSessionKey(apiKey: string): void {
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(apiKey)}; path=/; max-age=${maxAge}; samesite=lax`;
}

/**
 * Read API key from session cookie (browser-side only).
 * Returns null if not found or running on server.
 */
export function getSessionKey(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Clear session cookie and redirect to login page.
 */
export function clearSession(): void {
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
  window.location.href = '/login';
}
