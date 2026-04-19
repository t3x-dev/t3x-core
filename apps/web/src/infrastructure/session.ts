/**
 * Local Auth Session Utilities
 *
 * Cookie-based session management for self-hosted deployments.
 * Stores the API key in a `t3x-session` cookie for authenticated requests.
 */

const COOKIE_NAME = 't3x-session';
const COOKIE_MAX_AGE_DAYS = 30;
const USER_STORAGE_KEY = 't3x-user';
export const SESSION_USER_CHANGED_EVENT = 't3x-session-user-changed';

// ============================================================
// Session User (localStorage)
// ============================================================

export interface SessionUser {
  id: string;
  name: string | null;
  username: string | null;
  avatar_url?: string | null;
}

function notifySessionUserChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SESSION_USER_CHANGED_EVENT));
}

/**
 * Store user profile in localStorage after login/register.
 */
export function setSessionUser(user: SessionUser): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  notifySessionUserChanged();
}

/**
 * Read user profile from localStorage.
 */
export function getSessionUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

/**
 * Subscribe to local session user changes in the current tab and across tabs.
 */
export function subscribeSessionUser(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === USER_STORAGE_KEY) {
      onChange();
    }
  };

  window.addEventListener(SESSION_USER_CHANGED_EVENT, onChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(SESSION_USER_CHANGED_EVENT, onChange);
    window.removeEventListener('storage', handleStorage);
  };
}

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
  localStorage.removeItem(USER_STORAGE_KEY);
  notifySessionUserChanged();
  window.location.href = '/login';
}
