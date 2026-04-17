/**
 * L3 read wrapper for local provider credential status.
 */

import { getLocalProviderStatus } from '@/infrastructure/misc';
import type { LocalProviderClientId } from '@/infrastructure/types';

export function fetchLocalProviderStatus(providerId: LocalProviderClientId | string) {
  return getLocalProviderStatus(providerId);
}
