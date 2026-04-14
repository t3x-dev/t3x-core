/**
 * useCreateLeaf — persists a new leaf via the L1 leaves adapter.
 *
 * Consumed by CommitOperationsSidebar and CommitTreeIndex which used to
 * import `createLeaf` from the L1 leaves adapter directly.
 */

import { useCallback } from 'react';
import { type CreateLeafInput, createLeaf } from '@/commands/leaves';
import type { Leaf } from '@/types/api';

export function useCreateLeaf(): {
  create: (input: CreateLeafInput) => Promise<Leaf>;
} {
  const create = useCallback((input: CreateLeafInput) => createLeaf(input), []);
  return { create };
}
