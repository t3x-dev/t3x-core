/**
 * useLeafById — imperative leaf-by-id loader.
 *
 * Thin wrapper around fetchLeafById for components that load
 * individual leaves on demand (e.g. optimiser LeafSelector
 * pre-filling from a URL param).
 */

import { useCallback } from 'react';
import { fetchLeafById } from '@/queries/leaves';

export function useLeafById() {
  const loadLeaf = useCallback(async (leafId: string) => fetchLeafById(leafId), []);
  return { loadLeaf };
}
