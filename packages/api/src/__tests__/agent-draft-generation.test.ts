import { describe, expect, it, vi } from 'vitest';
import { generateAgentDraftText } from '../lib/agent-draft-generation';
import {
  createInferenceRuntime,
  InferenceAdmissionDeniedError,
  type InferenceAdmissionPolicy,
} from '../lib/inference';

const scope = {
  actor: { kind: 'user' as const, id: 'user_1' },
  namespaceId: 'ns_1',
  projectId: 'proj_1',
  projectVisibility: 'unknown' as const,
};

describe('agent draft inference generation', () => {
  it.each([
    'agent-draft.create',
    'agent-draft.patch',
  ] as const)('settles a normalized receipt for %s', async (feature) => {
    const settle = vi.fn<InferenceAdmissionPolicy['settle']>();
    const generate = vi.fn(async () => ({
      text: 'Generated draft',
      usage: { inputTokens: 21, outputTokens: 8 },
    }));
    const runtime = createInferenceRuntime({
      createGenerationId: () => `gen_${feature}`,
      admissionPolicy: {
        async authorize() {
          return { outcome: 'admitted', admission: { id: `admission_${feature}` } };
        },
        settle,
        release: vi.fn(),
      },
    });

    const execution = await generateAgentDraftText({
      runtime,
      runId: 'request:req_1',
      feature,
      scope,
      provider: { id: 'anthropic', generate },
      model: 'claude-resolved',
      prompt: 'Draft this',
      temperature: 0.2,
      maxTokens: 2048,
    });

    expect(execution.value.text).toBe('Generated draft');
    expect(generate).toHaveBeenCalledOnce();
    expect(settle).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: expect.objectContaining({ feature, scope }),
        terminal: expect.objectContaining({
          kind: 'receipt',
          receipt: expect.objectContaining({
            resolvedProvider: 'anthropic',
            resolvedModel: 'claude-resolved',
            usage: { inputTokens: 21, outputTokens: 8 },
          }),
        }),
      })
    );
  });

  it('does not call the provider when admission denies the request', async () => {
    const generate = vi.fn();
    const runtime = createInferenceRuntime({
      admissionPolicy: {
        async authorize() {
          return { outcome: 'denied', code: 'spend_paused', reason: 'Managed spend is paused' };
        },
        settle: vi.fn(),
        release: vi.fn(),
      },
    });

    await expect(
      generateAgentDraftText({
        runtime,
        runId: 'request:req_denied',
        feature: 'agent-draft.create',
        scope,
        provider: { id: 'anthropic', generate },
        model: 'claude-resolved',
        prompt: 'Draft this',
        temperature: 0.2,
        maxTokens: 2048,
      })
    ).rejects.toBeInstanceOf(InferenceAdmissionDeniedError);
    expect(generate).not.toHaveBeenCalled();
  });
});
