import type { MiddlewareHandler } from 'hono';
import { createLegacyGenerationModel } from './legacy-generation-model-adapter';
import {
  GENERATION_PROVIDER_RUNTIME_VERSION,
  type GenerationProviderResolutionInput,
  type GenerationProviderRuntime,
} from './model-runtime-contract';
import { getOssGenerationModelCatalogSnapshot } from './oss-generation-model-catalog';
import { resolveProviderAndModel } from './provider-resolver';

export * from './model-runtime-contract';

/** Existing direct providers, isolated behind the provider-neutral OSS adapter. */
export const defaultGenerationProviderRuntime: GenerationProviderRuntime = Object.freeze({
  contractVersion: GENERATION_PROVIDER_RUNTIME_VERSION,
  catalog: Object.freeze({ snapshot: getOssGenerationModelCatalogSnapshot }),
  async resolve(input: GenerationProviderResolutionInput = {}) {
    const resolved = await resolveProviderAndModel({
      requestedModel: input.requestedModel,
      conversationId: input.scope?.conversationId,
      projectId: input.scope?.projectId,
      userId: input.scope?.userId,
      unavailableMessage: input.unavailableMessage,
    });
    if (!resolved.ok) return resolved;
    if (!('generate' in resolved.provider)) {
      return {
        ok: false as const,
        code: 'unavailable' as const,
        message: input.unavailableMessage ?? 'Resolved provider cannot perform generation',
      };
    }

    const model = createLegacyGenerationModel(
      resolved.providerId,
      resolved.model,
      resolved.provider
    );
    const missingCapability = input.requiredCapabilities?.find(
      (capability) => !model.capabilities.includes(capability)
    );
    if (missingCapability) {
      return {
        ok: false as const,
        code: 'unavailable' as const,
        message:
          input.unavailableMessage ??
          `Resolved model does not support required capability: ${missingCapability}`,
      };
    }
    return { ok: true as const, model };
  },
});

type ProviderRuntimeContext = {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
};

function asProviderRuntimeContext(context: unknown): ProviderRuntimeContext {
  return context as ProviderRuntimeContext;
}

function isGenerationProviderRuntime(value: unknown): value is GenerationProviderRuntime {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as GenerationProviderRuntime).contractVersion === GENERATION_PROVIDER_RUNTIME_VERSION &&
    typeof (value as GenerationProviderRuntime).resolve === 'function'
  );
}

/** Bind one model runtime to an application/request context without globals. */
export function createGenerationProviderRuntimeMiddleware(
  runtime: GenerationProviderRuntime
): MiddlewareHandler {
  if (!isGenerationProviderRuntime(runtime)) {
    throw new TypeError('Generation provider runtime is invalid or unsupported');
  }
  return async (context, next) => {
    asProviderRuntimeContext(context).set('generationProviderRuntime', runtime);
    await next();
  };
}

/** Read the application runtime, falling back to the direct OSS adapter. */
export function getGenerationProviderRuntime(context: unknown): GenerationProviderRuntime {
  const runtime = asProviderRuntimeContext(context).get('generationProviderRuntime');
  return isGenerationProviderRuntime(runtime) ? runtime : defaultGenerationProviderRuntime;
}
