/**
 * Dependency-free language-model contracts shared by OSS and hosted adapters.
 *
 * Provider credentials, native request payloads, billing policy, persistence,
 * and HTTP framework types must remain outside this module.
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

/** Correlation identity allocated before any provider I/O or admission side effect. */
export interface GenerationModelInvocation {
  generationId: string;
  runId: string;
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
