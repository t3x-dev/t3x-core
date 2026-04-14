/**
 * L3 command — create a leaf attached to a commit.
 *
 * Source policy (v2 §2.4 MEDIUM): every call must carry a LeafSource
 * discriminator. assertLeafSource throws LeafSourceValidationError
 * before any HTTP write on shape defects; LeafPersistenceError wraps
 * infrastructure failures.
 */

import { type CreateLeafInput, createLeaf as createLeafInfra } from '@/infrastructure/leaves';
import type { Leaf } from '@/types/api';
import { LeafPersistenceError } from './errors';
import { assertLeafSource } from './leafSource';

export async function createLeaf(input: CreateLeafInput): Promise<Leaf> {
  assertLeafSource(input.source);
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
export type { LeafSource } from './leafSource';
