/**
 * useAuthMe — imperative current-user loader.
 */

import { useCallback } from 'react';
import { getAuthMe, type UpdateAuthMeInput, updateAuthMe } from '@/infrastructure/auth';

export function useAuthMe() {
  const loadAuthMe = useCallback(async () => getAuthMe(), []);
  const updateCurrentUser = useCallback(
    async (input: UpdateAuthMeInput) => updateAuthMe(input),
    []
  );
  return { loadAuthMe, updateAuthMe: updateCurrentUser };
}
