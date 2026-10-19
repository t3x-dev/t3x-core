import type { ResolvedConfig } from '@t3x-dev/core';
import { getProviderCredentialBundle } from '@t3x-dev/storage';
import { getDB } from './db';

/** Storage failures must not silently switch the active credential to an environment key. */
export async function loadResolvedProviderConfig(): Promise<ResolvedConfig> {
  const db = await getDB();
  const bundle = await getProviderCredentialBundle(db);
  return bundle.secrets;
}
