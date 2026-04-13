/**
 * L3 command — create a leaf in a project.
 */

import { type CreateLeafInput, createLeaf as createLeafInfra } from '@/infrastructure/leaves';
import type { Leaf } from '@/types/api';

export async function createLeaf(input: CreateLeafInput): Promise<Leaf> {
  return createLeafInfra(input);
}

export type { CreateLeafInput };
