import type { OpsPipelineContext } from '@t3x-dev/core';
import type { Context as HonoContext } from 'hono';
import { getDB } from '../lib/db';
import {
  createInferenceRuntime,
  getInferenceRuntime,
  type InferenceRuntime,
  type InferenceScope,
  resolveInferenceActor,
  resolveInferenceRunId,
} from '../lib/inference';
import { getProviderRegistry } from '../lib/provider-registry';

/**
 * Narrowed OpsPipelineContext with concrete types for the API layer.
 */
export interface ApiPipelineContext extends OpsPipelineContext {
  db: Awaited<ReturnType<typeof getDB>>;
  providerRegistry: Awaited<ReturnType<typeof getProviderRegistry>>;
  inference: { runtime: InferenceRuntime; runId: string; scope: InferenceScope };
}

const defaultInferenceRuntime = createInferenceRuntime();

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
    inference: {
      runtime: getInferenceRuntime(c) ?? defaultInferenceRuntime,
      runId: resolveInferenceRunId(c),
      scope: {
        actor: resolveInferenceActor(c),
        projectId,
        projectVisibility: 'unknown',
      },
    },
    abortSignal: c.req.raw.signal,
  };
}
