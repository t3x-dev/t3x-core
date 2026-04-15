'use client';

/**
 * useSession — view-facing wrapper around local-session helpers
 * (localStorage-backed user + API key). Keeps components off
 * @/infrastructure directly.
 */

import { useCallback } from 'react';
import {
  clearSession as clearSessionInfra,
  getSessionKey as getSessionKeyInfra,
  getSessionUser as getSessionUserInfra,
  type SessionUser,
  setSessionKey as setSessionKeyInfra,
  setSessionUser as setSessionUserInfra,
} from '@/infrastructure/session';

export type { SessionUser };

export function useSession() {
  const getUser = useCallback(() => getSessionUserInfra(), []);
  const setUser = useCallback((user: SessionUser) => setSessionUserInfra(user), []);
  const getKey = useCallback(() => getSessionKeyInfra(), []);
  const setKey = useCallback((key: string) => setSessionKeyInfra(key), []);
  const clear = useCallback(() => clearSessionInfra(), []);
  return { getUser, setUser, getKey, setKey, clear };
}
