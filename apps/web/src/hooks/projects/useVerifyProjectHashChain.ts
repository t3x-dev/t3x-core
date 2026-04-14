/**
 * useVerifyProjectHashChain — imperative hash-chain verification for the
 * shared verification badge.
 */

import { useCallback } from 'react';
import { verifyProjectHashChain } from '@/infrastructure/projects';

export function useVerifyProjectHashChain() {
  const verify = useCallback(async (projectId: string) => verifyProjectHashChain(projectId), []);
  return { verify };
}
