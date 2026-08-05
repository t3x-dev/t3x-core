/**
 * useCreateLeaf — persists a new leaf via the L1 leaves adapter.
 *
 * Keeps leaf-creation surfaces on the command boundary instead of importing
 * the L1 leaves adapter directly.
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
