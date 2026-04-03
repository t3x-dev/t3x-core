import type { OpsPipelineContext } from '@t3x-dev/core';
import type { Context as HonoContext } from 'hono';
import { getDB } from '../lib/db';
import { getProviderRegistry } from '../lib/provider-registry';

/**
 * Narrowed OpsPipelineContext with concrete types for the API layer.
 */
export interface ApiPipelineContext extends OpsPipelineContext {
  db: Awaited<ReturnType<typeof getDB>>;
  providerRegistry: Awaited<ReturnType<typeof getProviderRegistry>>;
}

/**
 * Build a PipelineContext from a Hono request context.
 * Called by route handlers before runOperation().
 */
export async function buildPipelineContext(
  c: HonoContext,
  projectId: string
): Promise<ApiPipelineContext> {
  const db = await getDB();
  const providerRegistry = await getProviderRegistry();
  const userId = c.get('userId') as string | undefined;

  return {
    db,
    projectId,
    userId,
    providerRegistry,
    abortSignal: c.req.raw.signal,
  };
}
