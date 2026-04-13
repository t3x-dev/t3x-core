/**
 * L3 command — create a leaf attached to a commit.
 */

import { type CreateLeafInput, createLeaf as createLeafInfra } from '@/infrastructure/leaves';
import type { Leaf } from '@/types/api';
import { LeafPersistenceError } from './errors';

export async function createLeaf(input: CreateLeafInput): Promise<Leaf> {
  try {
    return await createLeafInfra(input);
  } catch (cause) {
    throw new LeafPersistenceError(
      cause instanceof Error ? cause.message : 'createLeaf failed',
      cause
    );
  }
}

export type { CreateLeafInput };
