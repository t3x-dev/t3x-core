/**
 * useCreateEngineRun — imperative trigger for an Engine run
 * (Runner -> n8n flow). Used by E2ETestCard.
 */

import { useCallback } from 'react';
import { type CreateEngineRunInput, createEngineRun } from '@/infrastructure/runner';

export function useCreateEngineRun() {
  const create = useCallback(async (input: CreateEngineRunInput) => createEngineRun(input), []);
  return { create };
}
