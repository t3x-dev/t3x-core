/**
 * Dependency-free language-model contracts shared by OSS and hosted adapters.
 *
 * Provider credentials, native request payloads, billing policy, persistence,
 * and HTTP framework types must remain outside this module.
 */

export const GENERATION_PROVIDER_RUNTIME_VERSION = 1 as const;
export const GENERATION_MODEL_SPECIFICATION_VERSION = 't3x.language-model/v1' as const;
export const GENERATION_MODEL_CATALOG_SCHEMA = 't3x.language-model-catalog/v1' as const;

export type GenerationModelCapability =
  | 'text'
  | 'image_input'
  | 'file_input'
  | 'structured_output'
  | 'tool_use'
  | 'streaming';

export interface GenerationModelDescriptor {
  /** Stable logical selection ID. It need not be a provider-native model ID. */
  id: string;
  label: string;
  capabilities: readonly GenerationModelCapability[];
  /** Deployment availability only. User eligibility remains an admission concern. */
  availability: 'available' | 'unavailable';
  /** Client-safe hints. The server must still enforce its own authoritative limits. */
  limits?: {
    maxOutputTokens?: number;
  };
}

export interface GenerationModelCatalogSnapshot {
  schema: typeof GENERATION_MODEL_CATALOG_SCHEMA;
  /** Opaque deployment revision. It changes when the published projection changes. */
  revision: string;
  defaultModelId: string | null;
  models: readonly GenerationModelDescriptor[];
}

export interface GenerationModelCatalog {
  snapshot(): Promise<GenerationModelCatalogSnapshot>;
}

const GENERATION_MODEL_CAPABILITIES = new Set<GenerationModelCapability>([
  'text',
  'image_input',
  'file_input',
  'structured_output',
  'tool_use',
  'streaming',
]);

function assertCatalogText(value: string, field: string, maxLength: number): void {
  if (value.length === 0 || value.length > maxLength) {
    throw new TypeError(`${field} is invalid`);
  }
}

/** Validate and deeply freeze a public projection before it crosses an API boundary. */
export function createGenerationModelCatalogSnapshot(input: {
  revision: string;
  defaultModelId?: string | null;
  models: readonly GenerationModelDescriptor[];
}): GenerationModelCatalogSnapshot {
  assertCatalogText(input.revision, 'revision', 128);
  const ids = new Set<string>();
  const models = input.models.map((model, index) => {
    assertCatalogText(model.id, `models[${index}].id`, 256);
    assertCatalogText(model.label, `models[${index}].label`, 128);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(model.id)) {
      throw new TypeError(`models[${index}].id is invalid`);
    }
    if (ids.has(model.id)) throw new TypeError(`Duplicate model ID: ${model.id}`);
    ids.add(model.id);

    const capabilities = [...new Set(model.capabilities)];
    if (
      capabilities.length === 0 ||
      capabilities.some((capability) => !GENERATION_MODEL_CAPABILITIES.has(capability))
    ) {
      throw new TypeError(`models[${index}].capabilities is invalid`);
    }
    if (model.availability !== 'available' && model.availability !== 'unavailable') {
      throw new TypeError(`models[${index}].availability is invalid`);
    }
    const maxOutputTokens = model.limits?.maxOutputTokens;
    if (
      maxOutputTokens !== undefined &&
      (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0)
    ) {
      throw new TypeError(`models[${index}].limits.maxOutputTokens is invalid`);
    }

    return Object.freeze({
      id: model.id,
      label: model.label,
      capabilities: Object.freeze(capabilities),
      availability: model.availability,
      ...(maxOutputTokens === undefined ? {} : { limits: Object.freeze({ maxOutputTokens }) }),
    });
  });

  const defaultModelId = input.defaultModelId ?? null;
  if (defaultModelId !== null) {
    const defaultModel = models.find((model) => model.id === defaultModelId);
    if (!defaultModel || defaultModel.availability !== 'available') {
      throw new TypeError('defaultModelId must reference an available model');
    }
  }

  return Object.freeze({
    schema: GENERATION_MODEL_CATALOG_SCHEMA,
    revision: input.revision,
    defaultModelId,
    models: Object.freeze(models),
  });
}

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

/** Correlation identity allocated before any provider I/O or admission side effect. */
export interface GenerationModelInvocation {
  generationId: string;
  runId: string;
  /** Zero-based order within the logical run. One invocation is one upstream attempt. */
  attemptIndex: number;
  /** Stable product call-site name, for example generation.chat. */
  feature: string;
  request: GenerationModelRequest;
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
  | { type: 'tool_call'; id: string; name: string; input: unknown };

export type GenerationModelFailureOutcome =
  | 'not_started'
  | 'rejected_without_execution'
  | 'unknown';

/** Sanitized adapter failure. Raw provider bodies and credentials must not escape it. */
export class GenerationModelError extends Error {
  constructor(
    readonly code: string,
    readonly outcome: GenerationModelFailureOutcome,
    readonly providerRequestId: string | null = null
  ) {
    super(code);
    this.name = 'GenerationModelError';
  }
}

export type GenerationModelStreamTerminal =
  | { kind: 'completed'; evidence: GenerationModelEvidence; warnings?: readonly string[] }
  | {
      kind: 'failed';
      error: GenerationModelError;
      partialEvidence?: GenerationModelEvidence;
    }
  | {
      kind: 'cancelled';
      outcome: GenerationModelFailureOutcome;
      partialEvidence?: GenerationModelEvidence;
    };

export interface GenerationModelStream {
  chunks: AsyncIterable<GenerationModelStreamPart>;
  /** Resolves exactly once even when the stream is cancelled or interrupted. */
  terminal: Promise<GenerationModelStreamTerminal>;
}

export interface GenerationModel {
  readonly specificationVersion: typeof GENERATION_MODEL_SPECIFICATION_VERSION;
  /** Adapter/service identity, not a secret-bearing provider instance. */
  readonly provider: string;
  readonly modelId: string;
  readonly capabilities: readonly GenerationModelCapability[];
  generate(
    invocation: GenerationModelInvocation,
    signal?: AbortSignal
  ): Promise<GenerationModelResult>;
  stream?(
    invocation: GenerationModelInvocation,
    signal?: AbortSignal
  ): Promise<GenerationModelStream>;
}

/** Trusted application identity carried to a provider runtime for resolution. */
export type GenerationModelActor =
  | { kind: 'user' | 'agent' | 'service'; id: string }
  | { kind: 'anonymous'; id: null };

export type GenerationModelProjectVisibility = 'public' | 'private' | 'unlisted' | 'unknown';

/**
 * Provider-neutral authority coordinates resolved by authenticated application code.
 *
 * The actor is optional only while historical callers migrate from `userId`. Hosted
 * runtimes may require it and fail closed. Deployment-owned payer or policy objects
 * deliberately do not cross this boundary.
 */
export interface GenerationModelScope {
  actor?: GenerationModelActor;
  namespaceId?: string;
  projectId?: string;
  projectVisibility?: GenerationModelProjectVisibility;
  conversationId?: string;
  /** @deprecated Use the canonical actor. Retained for v1 source compatibility. */
  userId?: string;
}

export interface GenerationProviderResolutionInput {
  /** Logical alias or qualified model reference. It is a preference, not authority. */
  requestedModel?: string;
  /** Canonical identifiers resolved by authenticated application code. */
  scope?: GenerationModelScope;
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
  /** Optional in v1 so existing third-party runtimes remain source-compatible. */
  readonly catalog?: GenerationModelCatalog;
  resolve(input?: GenerationProviderResolutionInput): Promise<GenerationProviderResolution>;
}
