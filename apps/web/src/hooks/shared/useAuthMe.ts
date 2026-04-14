/**
 * useAuthMe — imperative current-user loader.
 */

import { useCallback } from 'react';
import { getAuthMe } from '@/infrastructure/auth';

export function useAuthMe() {
  const loadAuthMe = useCallback(async () => getAuthMe(), []);
  return { loadAuthMe };
}
