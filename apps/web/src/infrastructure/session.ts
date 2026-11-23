/**
 * Local Auth Session Utilities
 *
 * Non-secret browser session presentation state.
 * The actual Session credential lives only in an HttpOnly cookie owned by the BFF.
 */
const USER_STORAGE_KEY = 't3x-user';
const USER_CHANGE_EVENT = 't3x:session-user-changed';

export function subscribeSessionUser(onStoreChange: () => void): () => void {
  window.addEventListener(USER_CHANGE_EVENT, onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    window.removeEventListener(USER_CHANGE_EVENT, onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

export function getSessionUserId(): string | null {
  return getSessionUser()?.id || null;
}

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
  const previousId = getSessionUserId();
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  if (getSessionUserId() !== previousId) window.dispatchEvent(new Event(USER_CHANGE_EVENT));
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
  window.dispatchEvent(new Event(USER_CHANGE_EVENT));
  window.location.href = '/login';
}
