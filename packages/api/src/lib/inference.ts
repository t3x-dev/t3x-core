import { randomUUID } from 'node:crypto';

/**
 * Provider-neutral inference execution contracts.
 *
 * These contracts belong to the API application layer. They deliberately do
 * not know about provider credentials, commercial plans, balances, or a
 * deployment's persistence schema.
 */

export const INFERENCE_CONTRACT_VERSION = 1 as const;

export type InferenceActor =
  | { kind: 'user' | 'agent' | 'service'; id: string }
  | { kind: 'anonymous'; id: null };

export type InferenceProjectVisibility = 'public' | 'private' | 'internal' | 'unknown';

export interface InferenceScope {
  /** Server-derived actor. Never populate this from an unverified request body. */
  actor: InferenceActor;
  /** Canonical namespace ID when the operation is namespace-owned. */
  namespaceId?: string;
  /** Canonical project ID when the operation is project-owned. */
  projectId?: string;
  /** Server-derived visibility used by a deployment policy. */
  projectVisibility?: InferenceProjectVisibility;
  /** Opaque deployment-owned payer/account context. Shared code never evaluates it. */
  policyContext?: unknown;
}

export interface InferenceExecutionInput {
  /** Logical parent run. Retry and fallback attempts share this value. */
  runId: string;
  /** Stable product call-site name, for example `generation.chat`. */
  feature: string;
  /** Model requested before provider routing or fallback. */
  requestedModel: string;
  scope: InferenceScope;
}

export interface InferenceAttempt extends InferenceExecutionInput {
  contractVersion: typeof INFERENCE_CONTRACT_VERSION;
  /** Unique per upstream attempt, allocated before admission and provider I/O. */
  generationId: string;
  createdAt: string;
}

export interface InferenceUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface InferenceProviderCost {
  /** Provider-reported decimal amount. Strings avoid binary floating-point drift. */
  amount: string;
  currency: string;
}

export type InferenceFinishStatus =
  | 'stop'
  | 'length'
  | 'tool_call'
  | 'content_filter'
  | 'cancelled'
  | 'error'
  | 'unknown';

export interface InferenceReceipt {
  contractVersion: typeof INFERENCE_CONTRACT_VERSION;
  generationId: string;
  runId: string;
  requestedModel: string;
  resolvedModel: string;
  resolvedProvider: string;
  providerRequestId?: string;
  usage: InferenceUsage;
  providerReportedCost?: InferenceProviderCost;
  finishStatus: InferenceFinishStatus;
  startedAt: string;
  completedAt: string;
}

export type InferenceTerminal =
  | { kind: 'receipt'; receipt: InferenceReceipt }
  | {
      kind: 'released';
      reason: 'pre_upstream_failure' | 'cancelled_before_upstream';
      detail?: string;
    }
  | {
      kind: 'uncertain';
      reason: 'provider_error' | 'interrupted_stream' | 'gateway_error' | 'unknown';
      detail?: string;
      partialReceipt?: InferenceReceipt;
    };

export interface InferenceAdmission {
  /** Policy-owned durable reservation or attempt identity. */
  id: string;
  /** Opaque policy state that a deployment gateway may consume. */
  context?: unknown;
}

export type InferenceAdmissionDecision =
  | { outcome: 'admitted'; admission: InferenceAdmission }
  | { outcome: 'denied'; code: string; reason: string };

export interface InferenceAdmissionPolicy {
  authorize(attempt: InferenceAttempt): Promise<InferenceAdmissionDecision>;
  settle(input: {
    attempt: InferenceAttempt;
    admission: InferenceAdmission;
    terminal: Extract<InferenceTerminal, { kind: 'receipt' | 'uncertain' }>;
  }): Promise<void>;
  release(input: {
    attempt: InferenceAttempt;
    admission: InferenceAdmission;
    terminal: Extract<InferenceTerminal, { kind: 'released' }>;
  }): Promise<void>;
}

export type InferenceExecutionResult<T> =
  | {
      ok: true;
      value: T;
      terminal: Extract<InferenceTerminal, { kind: 'receipt' }>;
    }
  | { ok: false; error: unknown; terminal: InferenceTerminal };

export interface InferenceGatewayStream<T> {
  chunks: AsyncIterable<T>;
  /** Must resolve exactly once, including on cancellation or provider ambiguity. */
  terminal: Promise<InferenceTerminal>;
}

export interface InferenceGateway {
  execute<T>(input: {
    attempt: InferenceAttempt;
    admission: InferenceAdmission;
    /** Direct-provider operation used by the default self-hosted gateway. */
    invoke: () => Promise<InferenceExecutionResult<T>>;
  }): Promise<InferenceExecutionResult<T>>;
  stream<T>(input: {
    attempt: InferenceAttempt;
    admission: InferenceAdmission;
    /** Direct-provider stream used by the default self-hosted gateway. */
    invoke: () => Promise<InferenceGatewayStream<T>>;
  }): Promise<InferenceGatewayStream<T>>;
}

export interface InferenceRuntimeOptions {
  gateway?: InferenceGateway;
  admissionPolicy?: InferenceAdmissionPolicy;
  createGenerationId?: () => string;
  now?: () => Date;
}

export interface InferenceExecution<T> {
  attempt: InferenceAttempt;
  value: T;
  receipt: InferenceReceipt;
}

export interface InferenceStream<T> {
  attempt: InferenceAttempt;
  chunks: AsyncIterable<T>;
  terminal: Promise<InferenceTerminal>;
}

export interface InferenceRuntime {
  execute<T>(
    input: InferenceExecutionInput,
    invoke: (attempt: InferenceAttempt) => Promise<InferenceExecutionResult<T>>
  ): Promise<InferenceExecution<T>>;
  stream<T>(
    input: InferenceExecutionInput,
    invoke: (attempt: InferenceAttempt) => Promise<InferenceGatewayStream<T>>
  ): Promise<InferenceStream<T>>;
}

export class InferenceAdmissionDeniedError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly attempt: InferenceAttempt
  ) {
    super(message);
    this.name = 'InferenceAdmissionDeniedError';
  }
}

export class InferenceExecutionError extends Error {
  constructor(
    public readonly cause: unknown,
    public readonly attempt: InferenceAttempt,
    public readonly terminal: InferenceTerminal
  ) {
    super(cause instanceof Error ? cause.message : 'Inference execution failed');
    this.name = 'InferenceExecutionError';
  }
}

export const allowAllInferenceAdmissionPolicy: InferenceAdmissionPolicy = {
  async authorize(attempt) {
    return { outcome: 'admitted', admission: { id: `allow-all:${attempt.generationId}` } };
  },
  async settle() {},
  async release() {},
};

export const directInferenceGateway: InferenceGateway = {
  execute: async (input) => input.invoke(),
  stream: async (input) => input.invoke(),
};

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${field} must be non-empty`);
  }
}

function assertTokenCount(value: number | undefined, field: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new TypeError(`${field} must be a non-negative safe integer`);
  }
}

function assertReceipt(attempt: InferenceAttempt, receipt: InferenceReceipt): void {
  if (receipt.contractVersion !== INFERENCE_CONTRACT_VERSION) {
    throw new TypeError('Inference receipt contract version does not match');
  }
  if (receipt.generationId !== attempt.generationId || receipt.runId !== attempt.runId) {
    throw new TypeError('Inference receipt identity does not match its attempt');
  }
  if (receipt.requestedModel !== attempt.requestedModel) {
    throw new TypeError('Inference receipt requested model does not match its attempt');
  }
  assertNonEmpty(receipt.resolvedModel, 'receipt.resolvedModel');
  assertNonEmpty(receipt.resolvedProvider, 'receipt.resolvedProvider');
  assertTokenCount(receipt.usage.inputTokens, 'receipt.usage.inputTokens');
  assertTokenCount(receipt.usage.outputTokens, 'receipt.usage.outputTokens');
  assertTokenCount(receipt.usage.reasoningTokens, 'receipt.usage.reasoningTokens');
  assertTokenCount(receipt.usage.cacheReadTokens, 'receipt.usage.cacheReadTokens');
  assertTokenCount(receipt.usage.cacheWriteTokens, 'receipt.usage.cacheWriteTokens');
  if (receipt.providerReportedCost) {
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(receipt.providerReportedCost.amount)) {
      throw new TypeError('receipt.providerReportedCost.amount must be a non-negative decimal');
    }
    assertNonEmpty(receipt.providerReportedCost.currency, 'receipt.providerReportedCost.currency');
  }
  const startedAt = Date.parse(receipt.startedAt);
  const completedAt = Date.parse(receipt.completedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt) {
    throw new TypeError('Inference receipt timestamps are invalid or out of order');
  }
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createAttempt(
  input: InferenceExecutionInput,
  createGenerationId: () => string,
  now: () => Date
): InferenceAttempt {
  assertNonEmpty(input.runId, 'runId');
  assertNonEmpty(input.feature, 'feature');
  assertNonEmpty(input.requestedModel, 'requestedModel');
  if (input.scope.actor.kind !== 'anonymous') {
    assertNonEmpty(input.scope.actor.id, 'scope.actor.id');
  }

  const generationId = createGenerationId();
  assertNonEmpty(generationId, 'generationId');
  return {
    ...input,
    contractVersion: INFERENCE_CONTRACT_VERSION,
    generationId,
    createdAt: now().toISOString(),
  };
}

function createFinalizer(
  attempt: InferenceAttempt,
  admission: InferenceAdmission,
  policy: InferenceAdmissionPolicy
): (terminal: InferenceTerminal) => Promise<InferenceTerminal> {
  let finalized: Promise<InferenceTerminal> | undefined;

  return (terminal) => {
    if (finalized) return finalized;
    finalized = (async () => {
      if (terminal.kind === 'receipt') {
        try {
          assertReceipt(attempt, terminal.receipt);
        } catch (error) {
          await policy.settle({
            attempt,
            admission,
            terminal: {
              kind: 'uncertain',
              reason: 'gateway_error',
              detail: errorDetail(error),
            },
          });
          throw error;
        }
        await policy.settle({ attempt, admission, terminal });
      } else if (terminal.kind === 'uncertain') {
        if (terminal.partialReceipt) {
          try {
            assertReceipt(attempt, terminal.partialReceipt);
          } catch (error) {
            terminal = {
              kind: 'uncertain',
              reason: 'gateway_error',
              detail: errorDetail(error),
            };
          }
        }
        await policy.settle({ attempt, admission, terminal });
      } else {
        await policy.release({ attempt, admission, terminal });
      }
      return terminal;
    })();
    return finalized;
  };
}

async function authorize(
  attempt: InferenceAttempt,
  policy: InferenceAdmissionPolicy
): Promise<InferenceAdmission> {
  const decision = await policy.authorize(attempt);
  if (decision.outcome === 'denied') {
    throw new InferenceAdmissionDeniedError(decision.code, decision.reason, attempt);
  }
  assertNonEmpty(decision.admission.id, 'admission.id');
  return decision.admission;
}

export function createInferenceRuntime(options: InferenceRuntimeOptions = {}): InferenceRuntime {
  const gateway = options.gateway ?? directInferenceGateway;
  const policy = options.admissionPolicy ?? allowAllInferenceAdmissionPolicy;
  const createGenerationId = options.createGenerationId ?? (() => `gen_${randomUUID()}`);
  const now = options.now ?? (() => new Date());

  return {
    async execute(input, invoke) {
      const attempt = createAttempt(input, createGenerationId, now);
      const admission = await authorize(attempt, policy);
      const finalize = createFinalizer(attempt, admission, policy);

      const result = await gateway
        .execute({ attempt, admission, invoke: () => invoke(attempt) })
        .catch(async (error) => {
          const terminal = await finalize({
            kind: 'uncertain',
            reason: 'gateway_error',
            detail: errorDetail(error),
          });
          throw new InferenceExecutionError(error, attempt, terminal);
        });

      const terminal = await finalize(result.terminal);
      if (!result.ok) {
        throw new InferenceExecutionError(result.error, attempt, terminal);
      }

      return { attempt, value: result.value, receipt: result.terminal.receipt };
    },

    async stream(input, invoke) {
      const attempt = createAttempt(input, createGenerationId, now);
      const admission = await authorize(attempt, policy);
      const finalize = createFinalizer(attempt, admission, policy);

      const gatewayStream = await gateway
        .stream({ attempt, admission, invoke: () => invoke(attempt) })
        .catch(async (error) => {
          const terminal = await finalize({
            kind: 'uncertain',
            reason: 'gateway_error',
            detail: errorDetail(error),
          });
          throw new InferenceExecutionError(error, attempt, terminal);
        });

      const terminal = gatewayStream.terminal.then(
        (value) => finalize(value),
        (error) =>
          finalize({
            kind: 'uncertain',
            reason: 'gateway_error',
            detail: errorDetail(error),
          })
      );

      return {
        attempt,
        chunks: gatewayStream.chunks,
        terminal,
      };
    },
  };
}
