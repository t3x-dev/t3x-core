import { type ResolvedConfig } from '@t3x-dev/core';
import { getProviderCredentialBundle } from '@t3x-dev/storage';
import { getDB } from './db';

/**
 * Load runtime provider config overrides from storage.
 * Returns an empty config when storage is unavailable so env fallback still works.
 */
export async function loadResolvedProviderConfig(): Promise<ResolvedConfig> {
  try {
    const db = await getDB();
    const bundle = await getProviderCredentialBundle(db);
    return bundle.secrets;
  } catch {
    return {};
  }
}
