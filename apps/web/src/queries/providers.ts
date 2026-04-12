/**
 * L3 — imperative provider-list fetcher. Pass-through over the L1
 * `listProviders` adapter.
 */

import { listProviders } from '@/lib/api/misc';
import type { ProviderInfo } from '@/types/api';

export function fetchProviders(): Promise<ProviderInfo[]> {
  return listProviders();
}
