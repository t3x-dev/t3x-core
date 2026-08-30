import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import {
  createInferenceRuntime,
  INFERENCE_CONTRACT_VERSION,
  InferenceAdmissionDeniedError,
  type InferenceAdmissionPolicy,
  type InferenceAttempt,
  InferenceExecutionError,
  type InferenceReceipt,
  type InferenceTerminal,
} from '../lib/inference';

const executionInput = {
  runId: 'run_123',
  feature: 'test.inference',
  requestedModel: 'model-requested',
  scope: {
    actor: { kind: 'user' as const, id: 'user_123' },
    namespaceId: 'namespace_123',
    projectId: 'project_123',
    projectVisibility: 'private' as const,
    policyContext: { payerReference: 'opaque' },
  },
};

function receipt(attempt: InferenceAttempt): InferenceReceipt {
  return {
    contractVersion: INFERENCE_CONTRACT_VERSION,
    generationId: attempt.generationId,
    runId: attempt.runId,
    requestedModel: attempt.requestedModel,
    resolvedModel: 'model-resolved',
    resolvedProvider: 'provider-resolved',
    providerRequestId: 'provider-request-123',
    usage: {
      inputTokens: 20,
      outputTokens: 8,
      reasoningTokens: 3,
      cacheReadTokens: 4,
      cacheWriteTokens: 1,
    },
    providerReportedCost: { amount: '0.00125', currency: 'USD' },
    finishStatus: 'stop',
    startedAt: '2026-08-30T00:00:01.000Z',
    completedAt: '2026-08-30T00:00:02.000Z',
  };
}

function recordingPolicy(events: string[]): InferenceAdmissionPolicy {
  return {
    async authorize(attempt) {
      events.push(`authorize:${attempt.generationId}`);
      return { outcome: 'admitted', admission: { id: `admission:${attempt.generationId}` } };
    },
    async settle({ terminal }) {
      events.push(`settle:${terminal.kind}`);
    },
    async release({ terminal }) {
      events.push(`release:${terminal.reason}`);
    },
  };
}

describe('provider-neutral inference runtime', () => {
  it('allocates one generation identity before authorization and settles a receipt', async () => {
    const events: string[] = [];
    const runtime = createInferenceRuntime({
      admissionPolicy: recordingPolicy(events),
      createGenerationId: () => {
        events.push('identity');
        return 'gen_123';
      },
      now: () => new Date('2026-08-30T00:00:00.000Z'),
      gateway: {
        async execute(input) {
          events.push(`gateway:${input.attempt.generationId}`);
          return input.invoke();
        },
        async stream(input) {
          return input.invoke();
        },
      },
    });

    const result = await runtime.execute(executionInput, async (attempt) => {
      events.push('provider');
      return {
        ok: true,
        value: 'generated',
        terminal: { kind: 'receipt', receipt: receipt(attempt) },
      };
    });

    expect(result.attempt.generationId).toBe('gen_123');
    expect(result.value).toBe('generated');
    expect(result.receipt.providerRequestId).toBe('provider-request-123');
    expect(events).toEqual([
      'identity',
      'authorize:gen_123',
      'gateway:gen_123',
      'provider',
      'settle:receipt',
    ]);
  });

  it('does not reach the gateway after admission denial', async () => {
    const gateway = {
      execute: vi.fn(),
      stream: vi.fn(),
    };
    const runtime = createInferenceRuntime({
      gateway,
      createGenerationId: () => 'gen_denied',
      admissionPolicy: {
        async authorize() {
          return { outcome: 'denied', code: 'quota_exhausted', reason: 'No grant remains' };
        },
        settle: vi.fn(),
        release: vi.fn(),
      },
    });

    await expect(runtime.execute(executionInput, vi.fn())).rejects.toMatchObject({
      name: InferenceAdmissionDeniedError.name,
      code: 'quota_exhausted',
      attempt: { generationId: 'gen_denied' },
    });
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('releases only an explicit proven pre-upstream failure', async () => {
    const events: string[] = [];
    const runtime = createInferenceRuntime({
      admissionPolicy: recordingPolicy(events),
      createGenerationId: () => 'gen_preflight',
    });

    await expect(
      runtime.execute(executionInput, async () => ({
        ok: false,
        error: new Error('provider configuration unavailable'),
        terminal: { kind: 'released', reason: 'pre_upstream_failure' },
      }))
    ).rejects.toMatchObject({
      name: InferenceExecutionError.name,
      terminal: { kind: 'released', reason: 'pre_upstream_failure' },
    });
    expect(events).toEqual(['authorize:gen_preflight', 'release:pre_upstream_failure']);
  });

  it('settles an unexpected gateway or provider throw as uncertain', async () => {
    const events: string[] = [];
    const runtime = createInferenceRuntime({
      admissionPolicy: recordingPolicy(events),
      createGenerationId: () => 'gen_unknown',
    });

    await expect(
      runtime.execute(executionInput, async () => {
        throw new Error('socket disappeared after write');
      })
    ).rejects.toMatchObject({
      name: InferenceExecutionError.name,
      terminal: { kind: 'uncertain', reason: 'gateway_error' },
    });
    expect(events).toEqual(['authorize:gen_unknown', 'settle:uncertain']);
  });

  it('settles an interrupted stream exactly once even when terminal is observed twice', async () => {
    const events: string[] = [];
    const runtime = createInferenceRuntime({
      admissionPolicy: recordingPolicy(events),
      createGenerationId: () => 'gen_stream',
    });
    const interrupted: InferenceTerminal = {
      kind: 'uncertain',
      reason: 'interrupted_stream',
      detail: 'client disconnected',
    };

    const stream = await runtime.stream(executionInput, async () => ({
      chunks: (async function* () {
        yield 'partial';
      })(),
      terminal: Promise.resolve(interrupted),
    }));

    const first = await stream.terminal;
    const second = await stream.terminal;
    expect(first).toEqual(interrupted);
    expect(second).toEqual(interrupted);
    expect(events).toEqual(['authorize:gen_stream', 'settle:uncertain']);
  });

  it('fails closed when a receipt is rebound to another generation', async () => {
    const events: string[] = [];
    const runtime = createInferenceRuntime({
      admissionPolicy: recordingPolicy(events),
      createGenerationId: () => 'gen_expected',
    });

    await expect(
      runtime.execute(executionInput, async (attempt) => {
        const mismatched = { ...receipt(attempt), generationId: 'gen_other' };
        return { ok: true, value: 'untrusted', terminal: { kind: 'receipt', receipt: mismatched } };
      })
    ).rejects.toThrow('Inference receipt identity does not match its attempt');
    expect(events).toEqual(['authorize:gen_expected', 'settle:uncertain']);
  });

  it('surfaces policy finalization failure and never reports execution success', async () => {
    const runtime = createInferenceRuntime({
      createGenerationId: () => 'gen_policy_failure',
      admissionPolicy: {
        async authorize() {
          return { outcome: 'admitted', admission: { id: 'admission_policy_failure' } };
        },
        async settle() {
          throw new Error('durable settlement unavailable');
        },
        async release() {},
      },
    });

    await expect(
      runtime.execute(executionInput, async (attempt) => {
        return {
          ok: true,
          value: 'must not escape',
          terminal: { kind: 'receipt', receipt: receipt(attempt) },
        };
      })
    ).rejects.toThrow('durable settlement unavailable');
  });

  it('composes and returns the configured runtime from the application factory', async () => {
    const authorize = vi.fn(async () => ({
      outcome: 'denied' as const,
      code: 'hosted_pause',
      reason: 'Managed inference is paused',
    }));
    const { inferenceRuntime } = createApp({
      inference: {
        createGenerationId: () => 'gen_injected',
        admissionPolicy: {
          authorize,
          settle: vi.fn(),
          release: vi.fn(),
        },
      },
    });

    await expect(inferenceRuntime.execute(executionInput, vi.fn())).rejects.toBeInstanceOf(
      InferenceAdmissionDeniedError
    );
    expect(authorize).toHaveBeenCalledOnce();
  });
});
