import type { LLMPrompt, LLMProvider } from '@t3x-dev/core';
import type { MiddlewareHandler } from 'hono';
import { resolveProviderAndModel } from './provider-resolver';

/**
 * Provider-neutral language-model composition for Core and hosted deployments.
 *
 * The public port describes model capabilities and normalized generation. It
 * deliberately excludes credentials, billing, provider request payloads, and
 * Core's historical LLMProvider shape. Direct OSS providers and a hosted
 * gateway such as OpenRouter are adapters behind the same contract.
 */

export const GENERATION_PROVIDER_RUNTIME_VERSION = 1 as const;
export const GENERATION_MODEL_SPECIFICATION_VERSION = 't3x.language-model/v1' as const;

export type GenerationModelCapability =
  | 'text'
  | 'image_input'
  | 'file_input'
  | 'structured_output'
  | 'tool_use'
  | 'streaming';

export type GenerationModelContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; data: string | Uint8Array }
  | { type: 'file'; mediaType: string; data: string | Uint8Array; filename?: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; id: string; name: string; output: unknown; isError?: boolean };

export interface GenerationModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | readonly GenerationModelContentPart[];
}

export interface GenerationModelTool {
  name: string;
  description?: string;
  inputSchema: Readonly<Record<string, unknown>>;
}

export type GenerationModelOutputFormat =
  | { type: 'text' }
  | { type: 'json'; name?: string; schema: Readonly<Record<string, unknown>> };

export interface GenerationModelRequest {
  messages: readonly GenerationModelMessage[];
  output?: GenerationModelOutputFormat;
  tools?: readonly GenerationModelTool[];
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'tool'; name: string };
  temperature?: number;
  maxOutputTokens?: number;
  stopSequences?: readonly string[];
}

export interface GenerationModelUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export type GenerationModelFinishReason =
  | 'stop'
  | 'length'
  | 'tool_call'
  | 'content_filter'
  | 'cancelled'
  | 'error'
  | 'unknown';

export interface GenerationModelEvidence {
  /** Service receiving the request, for example openai or openrouter. */
  provider: string;
  /** Model actually reported by the service after routing and fallback. */
  model: string;
  /** Upstream provider selected by a routing service, when known. */
  routedProvider?: string;
  providerRequestId?: string;
  usage: GenerationModelUsage;
  providerReportedCost?: { amount: string; currency: string };
  finishReason: GenerationModelFinishReason;
}

export type GenerationModelOutputPart =
  | { type: 'text'; text: string }
  | { type: 'json'; value: unknown }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown };

export interface GenerationModelResult {
  output: readonly GenerationModelOutputPart[];
  evidence: GenerationModelEvidence;
  warnings?: readonly string[];
}

export type GenerationModelStreamPart =
  | { type: 'text_delta'; delta: string }
  | { type: 'reasoning_delta'; delta: string }
  | { type: 'json'; value: unknown }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'finish'; evidence: GenerationModelEvidence; warnings?: readonly string[] };

export interface GenerationModel {
  readonly specificationVersion: typeof GENERATION_MODEL_SPECIFICATION_VERSION;
  /** Adapter/service identity, not a secret-bearing provider instance. */
  readonly provider: string;
  readonly modelId: string;
  readonly capabilities: readonly GenerationModelCapability[];
  generate(request: GenerationModelRequest, signal?: AbortSignal): Promise<GenerationModelResult>;
  stream?(
    request: GenerationModelRequest,
    signal?: AbortSignal
  ): Promise<AsyncIterable<GenerationModelStreamPart>>;
}

export interface GenerationProviderResolutionInput {
  /** Logical alias or qualified model reference. It is a preference, not authority. */
  requestedModel?: string;
  /** Canonical identifiers resolved by authenticated application code. */
  scope?: {
    conversationId?: string;
    projectId?: string;
    userId?: string;
  };
  requiredCapabilities?: readonly GenerationModelCapability[];
  unavailableMessage?: string;
}

export type GenerationProviderResolution =
  | { ok: true; model: GenerationModel }
  | {
      ok: false;
      code: 'provider' | 'model' | 'mismatch' | 'unavailable';
      message: string;
    };

export interface GenerationProviderRuntime {
  readonly contractVersion: typeof GENERATION_PROVIDER_RUNTIME_VERSION;
  resolve(input?: GenerationProviderResolutionInput): Promise<GenerationProviderResolution>;
}

function textPrompt(request: GenerationModelRequest): LLMPrompt | null {
  const messages: LLMPrompt['messages'] = [];
  let system: string | undefined;

  for (const message of request.messages) {
    if (message.role === 'tool') return null;
    const content =
      typeof message.content === 'string'
        ? message.content
        : message.content.every((part) => part.type === 'text')
          ? message.content.map((part) => (part.type === 'text' ? part.text : '')).join('')
          : null;
    if (content === null) return null;
    if (message.role === 'system') {
      system = system ? `${system}\n\n${content}` : content;
      continue;
    }
    messages.push({ role: message.role, content });
  }

  return { ...(system ? { system } : {}), messages };
}

function adaptLegacyProvider(
  providerId: string,
  modelId: string,
  provider: LLMProvider
): GenerationModel {
  return Object.freeze({
    specificationVersion: GENERATION_MODEL_SPECIFICATION_VERSION,
    provider: providerId,
    modelId,
    capabilities: Object.freeze(['text'] as const),
    async generate(request: GenerationModelRequest, signal?: AbortSignal) {
      if (signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');
      if ((request.output?.type ?? 'text') !== 'text' || request.tools?.length) {
        throw new TypeError('The selected OSS provider adapter does not support this capability');
      }
      const prompt = textPrompt(request);
      if (!prompt) {
        throw new TypeError('The selected OSS provider adapter accepts text messages only');
      }

      const options = {
        model: modelId,
        temperature: request.temperature,
        maxTokens: request.maxOutputTokens,
        stopSequences: request.stopSequences ? [...request.stopSequences] : undefined,
      };
      const result = provider.generateFromPrompt
        ? await provider.generateFromPrompt(prompt, options)
        : await provider.generate(
            [prompt.system, ...prompt.messages.map((message) => String(message.content))]
              .filter(Boolean)
              .join('\n\n'),
            options
          );

      return {
        output: [{ type: 'text' as const, text: result.text }],
        evidence: {
          provider: providerId,
          model: modelId,
          usage: result.usage,
          finishReason: 'stop' as const,
        },
      };
    },
  });
}

/** Existing direct providers, isolated behind the provider-neutral OSS adapter. */
export const defaultGenerationProviderRuntime: GenerationProviderRuntime = Object.freeze({
  contractVersion: GENERATION_PROVIDER_RUNTIME_VERSION,
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

    const model = adaptLegacyProvider(resolved.providerId, resolved.model, resolved.provider);
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
