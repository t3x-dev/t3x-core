'use client';

/**
 * useSession — view-facing wrapper around local-session helpers
 * (localStorage-backed user presentation only). Keeps components off
 * @/infrastructure directly.
 */

import { useCallback } from 'react';
import { postLogout } from '@/infrastructure/auth';
import {
  clearSession as clearSessionInfra,
  getSessionUser as getSessionUserInfra,
  type SessionUser,
  setSessionUser as setSessionUserInfra,
} from '@/infrastructure/session';

export type { SessionUser };

export function useSession() {
  const getUser = useCallback(() => getSessionUserInfra(), []);
  const setUser = useCallback((user: SessionUser) => setSessionUserInfra(user), []);
  const clear = useCallback(async () => {
    try {
      await postLogout();
      clearSessionInfra();
    } catch (error) {
      console.error('Failed to log out server session', error);
    }
  }, []);
  return { getUser, setUser, clear };
}
