/**
 * Local Auth Session Utilities
 *
 * Non-secret browser session presentation state.
 * The actual Session credential lives only in an HttpOnly cookie owned by the BFF.
 */
const USER_STORAGE_KEY = 't3x-user';

// ============================================================
// Session User (localStorage)
// ============================================================

export interface SessionUser {
  id: string;
  name: string | null;
  username: string | null;
  avatar_url?: string | null;
}

/**
 * Store user profile in localStorage after login/register.
 */
export function setSessionUser(user: SessionUser): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
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
 * Clear non-secret presentation state after the BFF has cleared its HttpOnly cookie.
 */
export function clearSession(): void {
  localStorage.removeItem(USER_STORAGE_KEY);
  window.location.href = '/login';
}
