import type { LLMProvider } from '@t3x-dev/core';
import { normalizeYSchemaObject } from '@t3x-dev/yschema';
import { describe, expect, it, vi } from 'vitest';
import { createInferenceRuntime } from '../lib/inference';
import {
  GENERATION_MODEL_SPECIFICATION_VERSION,
  type GenerationModel,
  GenerationModelError,
} from '../lib/model-runtime-contract';
import {
  type AssistantEvent,
  runAssistantProvider,
} from '../lib/workspace-assistant/adapters/provider-tools';

const usage = { inputTokens: 4, outputTokens: 2 };
function invalidSchemaDefinition(): Error {
  try {
    normalizeYSchemaObject({ yschema: '0.1', name: 'Test', nodes: { scratchpad: { nodes: {} } } });
  } catch (failure) {
    if (failure instanceof Error) return failure;
    throw failure;
  }
  throw new Error('Expected native definition validation to reject nested nodes');
}
function fixture() {
  const runtime = createInferenceRuntime();
  const metered = vi.spyOn(runtime, 'execute');
  const events: AssistantEvent[] = [];
  return {
    metered,
    events,
    input: {
      model: 'test-model',
      reasoningEffort: 'high' as const,
      prompt: {
        system: 'test',
        messages: [{ role: 'user' as const, content: 'Explain current Draft' }],
      },
      inference: {
        runtime,
        runId: 'inference-parent',
        scope: { actor: { kind: 'user' as const, id: 'u' }, projectId: 'p' },
      },
      operationNamespace: 'business-operation-1',
      assertCurrent: vi.fn(async () => {}),
      emit: async (event: AssistantEvent) => {
        events.push(event);
      },
    },
  };
}
describe('metered Assistant loop', () => {
  it('returns a mixed read/card batch to AI for one bounded correction without executing either call', async () => {
    const { input, events } = fixture();
    const read = vi.fn();
    const card = vi.fn().mockResolvedValue({ status: 'awaiting_confirmation' });
    const generateWithTools = vi
      .fn()
      .mockResolvedValueOnce({
        tool_calls: [
          { id: 'read', name: 'readSchema', input: {} },
          { id: 'card', name: 'showSchemaChangeCard', input: {} },
        ],
        usage,
      })
      .mockResolvedValueOnce({
        tool_calls: [{ id: 'single-card', name: 'showSchemaChangeCard', input: {} }],
        usage,
      });
    await runAssistantProvider({
      ...input,
      provider: {
        id: 'test',
        generateWithTools,
        generateFromPrompt: vi.fn().mockResolvedValue({ text: '请在时间轴逐张确认。', usage }),
      } as unknown as LLMProvider,
      capabilities: {
        readSchema: {
          definition: { name: 'readSchema', description: '', input_schema: {} },
          execute: read,
        },
        showSchemaChangeCard: {
          definition: { name: 'showSchemaChangeCard', description: '', input_schema: {} },
          execute: card,
        },
      },
    });
    expect(read).not.toHaveBeenCalled();
    expect(card).toHaveBeenCalledOnce();
    expect(JSON.stringify(generateWithTools.mock.calls[1]![0])).toContain('invalid_tool_batch');
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'awaiting_confirmation' });
  });
  it.each([
    ['invalid definition', 2],
    ['permission failure', 1],
  ] as const)('bounds Schema card correction for %s', async (kind, attempts) => {
    const { input } = fixture();
    let step = 0;
    const failure =
      kind === 'invalid definition' ? invalidSchemaDefinition() : new Error('Permission failure');
    const execute = vi.fn().mockRejectedValue(failure);
    const generateWithTools = vi.fn(async () => ({
      tool_calls: [{ id: `card-${++step}`, name: 'showSchemaChangeCard', input: {} }],
      usage,
    }));
    await expect(
      runAssistantProvider({
        ...input,
        provider: { id: 'test', generateWithTools } as unknown as LLMProvider,
        capabilities: {
          showSchemaChangeCard: {
            definition: { name: 'showSchemaChangeCard', description: 'settings', input_schema: {} },
            execute,
          },
        },
      })
    ).rejects.toBe(failure);
    expect(execute).toHaveBeenCalledTimes(attempts);
    expect(generateWithTools).toHaveBeenCalledTimes(attempts);
  });
  it('returns one invalid Schema card definition to AI for correction instead of stopping the conversation', async () => {
    const { input, events } = fixture();
    const execute = vi
      .fn()
      .mockRejectedValueOnce(invalidSchemaDefinition())
      .mockResolvedValueOnce({
        status: 'awaiting_confirmation',
        settings: { settingsId: 'corrected' },
      });
    const generateWithTools = vi
      .fn()
      .mockResolvedValueOnce({
        tool_calls: [{ id: 'bad', name: 'showSchemaChangeCard', input: {} }],
        usage,
      })
      .mockResolvedValueOnce({
        tool_calls: [{ id: 'corrected', name: 'showSchemaChangeCard', input: {} }],
        usage,
      });
    const generateFromPrompt = vi.fn(async () => ({ text: '请确认修正后的结构。', usage }));
    await runAssistantProvider({
      ...input,
      provider: { id: 'test', generateWithTools, generateFromPrompt } as unknown as LLMProvider,
      capabilities: {
        showSchemaChangeCard: {
          definition: { name: 'showSchemaChangeCard', description: 'settings', input_schema: {} },
          execute,
        },
      },
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(generateWithTools.mock.calls[1][0])).toContain('invalid_definition');
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'awaiting_confirmation' });
  });
  it('returns the settings tool result to a text-only AI continuation before awaiting confirmation', async () => {
    const { input, events } = fixture();
    const execute = vi.fn(async () => ({
      status: 'awaiting_confirmation',
      settings: { settingsId: 's' },
    }));
    const generateWithTools = vi.fn(async () => ({
      tool_calls: [{ id: 'settings', name: 'showSchemaChangeCard', input: {} }],
      stop_reason: 'tool_use',
      usage,
    }));
    const generateFromPrompt = vi.fn(async () => ({ text: '请确认上方的字段设置。', usage }));
    await runAssistantProvider({
      ...input,
      provider: { id: 'test', generateWithTools, generateFromPrompt } as unknown as LLMProvider,
      capabilities: {
        showSchemaChangeCard: {
          definition: {
            name: 'showSchemaChangeCard',
            description: 'settings',
            input_schema: { type: 'object' },
          },
          execute,
        },
      },
    });
    expect(generateWithTools).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(generateFromPrompt).toHaveBeenCalledOnce();
    expect(JSON.stringify(generateFromPrompt.mock.calls[0][0])).toContain('tool_result');
    expect(JSON.stringify(generateFromPrompt.mock.calls[0][0])).toContain('awaiting_confirmation');
    expect(generateFromPrompt.mock.calls[0][0].system).toContain('one brief reply');
    expect(generateFromPrompt.mock.calls[0][0].system).toContain('parent Node');
    expect(events).toContainEqual({ type: 'text', content: '请确认上方的字段设置。' });
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'awaiting_confirmation' });
  });
  it('rejects a batch combining settings with a write before executing either tool', async () => {
    const { input } = fixture();
    const execute = vi.fn();
    const generateWithTools = vi.fn(async () => ({
      tool_calls: [
        { id: 'write', name: 'requestProposal', input: {} },
        { id: 'settings', name: 'showSchemaChangeCard', input: {} },
      ],
      stop_reason: 'tool_use',
      usage,
    }));
    await expect(
      runAssistantProvider({
        ...input,
        provider: { id: 'test', generateWithTools } as unknown as LLMProvider,
        capabilities: {
          showSchemaChangeCard: {
            definition: { name: 'showSchemaChangeCard', description: 'settings', input_schema: {} },
            execute,
          },
          requestProposal: {
            definition: { name: 'requestProposal', description: 'proposal', input_schema: {} },
            execute,
          },
        },
      })
    ).rejects.toThrow('separate tool step');
    expect(execute).not.toHaveBeenCalled();
  });
  it.each([
    true,
    false,
  ])('preserves managed image input or rejects an unsupported capability: %s', async (supportsImages) => {
    const { input, events } = fixture();
    const generate = vi.fn<GenerationModel['generate']>(async () => ({
      output: [{ type: 'text', text: 'Image understood.' }],
      evidence: { provider: 'gateway', model: 'image-model', usage, finishReason: 'stop' },
    }));
    const run = runAssistantProvider({
      ...input,
      generationModel: {
        specificationVersion: GENERATION_MODEL_SPECIFICATION_VERSION,
        provider: 'gateway',
        modelId: 'balanced',
        capabilities: supportsImages ? ['text', 'image_input'] : ['text'],
        generate,
      },
      prompt: {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: 'image-bytes' },
              },
            ],
          },
        ],
      },
      capabilities: {},
    });
    if (supportsImages) {
      await run;
      expect(generate.mock.calls[0][0].request.messages[0].content).toEqual([
        { type: 'image', mediaType: 'image/png', data: 'image-bytes' },
      ]);
      expect(events).toContainEqual({ type: 'text', content: 'Image understood.' });
    } else {
      await expect(run).rejects.toThrow('generation_content_unsupported');
      expect(generate).not.toHaveBeenCalled();
    }
  });

  it('does not mark an interrupted managed stream as a completed response', async () => {
    const { input, events } = fixture();
    await expect(
      runAssistantProvider({
        ...input,
        generationModel: {
          specificationVersion: GENERATION_MODEL_SPECIFICATION_VERSION,
          provider: 'gateway',
          modelId: 'balanced',
          capabilities: ['text', 'streaming'],
          generate: vi.fn(),
          stream: async () => ({
            chunks: (async function* () {
              yield { type: 'text_delta' as const, delta: 'Partial' };
            })(),
            terminal: Promise.resolve({
              kind: 'failed',
              error: new GenerationModelError('upstream_interrupted', 'unknown'),
            }),
          }),
        },
        capabilities: {},
      })
    ).rejects.toThrow('upstream_interrupted');
    expect(events).toContainEqual({ type: 'text', content: 'Partial' });
    expect(events.some((event) => event.type === 'done')).toBe(false);
  });
  it('meters every continuation and binds operation identity independently from model call IDs', async () => {
    const { input, metered, events } = fixture();
    const execute = vi.fn(async () => ({ value: 25 }));
    const generateWithTools = vi
      .fn()
      .mockResolvedValueOnce({
        tool_calls: [
          { id: 'model-invented', name: 'readStructure', input: { path: 'allocation' } },
        ],
        stop_reason: 'tool_use',
        usage,
      })
      .mockResolvedValueOnce({
        tool_calls: [],
        stop_reason: 'end_turn',
        usage,
        _rawAssistantContent: [{ type: 'text', text: 'Current value is 25' }],
      });
    await runAssistantProvider({
      ...input,
      provider: { id: 'test', generateWithTools } as unknown as LLMProvider,
      capabilities: {
        readStructure: {
          definition: {
            name: 'readStructure',
            description: 'read',
            input_schema: { type: 'object' },
          },
          execute,
        },
      },
    });
    expect(generateWithTools.mock.calls[0]?.[2]).toMatchObject({ reasoningEffort: 'high' });
    expect(metered).toHaveBeenCalledTimes(2);
    expect(input.assertCurrent).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0]?.[1]).toMatch(/^assistant:[a-f0-9]{64}$/);
    expect(events).toContainEqual({ type: 'text', content: 'Current value is 25' });
  });
  it('falls back to ordinary chat when the actual provider lacks tools', async () => {
    const { input, metered, events } = fixture();
    const tool = vi.fn();
    const generate = vi.fn(async () => ({ text: 'Use Generate to request a proposal.', usage }));
    await runAssistantProvider({
      ...input,
      provider: { id: 'test', generate } as unknown as LLMProvider,
      capabilities: {
        requestProposal: {
          definition: { name: 'requestProposal', description: 'proposal', input_schema: {} },
          execute: tool,
        },
      },
    });
    expect(tool).not.toHaveBeenCalled();
    expect(metered).toHaveBeenCalledTimes(1);
    expect(events[0]).toEqual({ type: 'capabilities', tools: false, proposal: false });
  });
  it('forwards provider text deltas instead of buffering the complete reply', async () => {
    const { input, metered, events } = fixture();
    const streamFromPrompt = vi.fn(async function* () {
      yield { type: 'text' as const, text: 'Current ' };
      yield { type: 'text' as const, text: 'value is 25' };
      yield { type: 'done' as const, usage };
    });
    await runAssistantProvider({
      ...input,
      provider: { id: 'test', streamFromPrompt } as unknown as LLMProvider,
      capabilities: {},
    });
    expect(metered).toHaveBeenCalledOnce();
    expect(events).toContainEqual({ type: 'text', content: 'Current ' });
    expect(events).toContainEqual({ type: 'text', content: 'value is 25' });
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'completed' });
  });
  it('runs requestProposal only when the model chooses it', async () => {
    const { input, events } = fixture();
    const execute = vi.fn(async () => ({ status: 'candidate', transitionId: 'transition:1' }));
    const streamFromPrompt = vi.fn();
    const generateWithTools = vi
      .fn()
      .mockResolvedValueOnce({
        tool_calls: [
          {
            id: 'call_1',
            name: 'requestProposal',
            input: { instruction: 'change replicas from 4 to 10' },
          },
        ],
        stop_reason: 'tool_use',
        usage,
      })
      .mockResolvedValueOnce({
        tool_calls: [],
        stop_reason: 'end_turn',
        usage,
        _rawAssistantContent: [{ type: 'text', text: 'Candidate generated.' }],
      });
    await runAssistantProvider({
      ...input,
      prompt: {
        system: 'test',
        messages: [{ role: 'user', content: 'change replicas from 4 to 10' }],
      },
      provider: { id: 'test', generateWithTools, streamFromPrompt } as unknown as LLMProvider,
      capabilities: {
        requestProposal: {
          definition: { name: 'requestProposal', description: 'proposal', input_schema: {} },
          execute,
        },
      },
    });
    expect(streamFromPrompt).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(
      { instruction: 'change replicas from 4 to 10' },
      expect.stringMatching(/^assistant:[a-f0-9]{64}$/)
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'operation',
        name: 'requestProposal',
        status: 'completed',
        result: { status: 'candidate', transitionId: 'transition:1' },
      })
    );
    expect(generateWithTools).toHaveBeenCalledTimes(2);
  });
  it('does not run requestProposal when the model answers without a tool call', async () => {
    const { input, events } = fixture();
    const execute = vi.fn();
    const generateWithTools = vi.fn(async () => ({
      tool_calls: [],
      stop_reason: 'end_turn' as const,
      usage,
      _rawAssistantContent: [{ type: 'text' as const, text: 'Which card should change?' }],
    }));
    await runAssistantProvider({
      ...input,
      prompt: { system: 'test', messages: [{ role: 'user', content: '生成一张新卡片' }] },
      provider: { id: 'test', generateWithTools } as unknown as LLMProvider,
      capabilities: {
        requestProposal: {
          definition: { name: 'requestProposal', description: 'proposal', input_schema: {} },
          execute,
        },
      },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'completed' });
  });
  it('rejects arbitrary code tools and stops before a stale continuation', async () => {
    const { input } = fixture();
    const provider = {
      id: 'test',
      generateWithTools: vi.fn(async () => ({
        tool_calls: [{ id: 'x', name: 'shell', input: { command: 'touch file' } }],
        stop_reason: 'tool_use' as const,
        usage,
      })),
    } as unknown as LLMProvider;
    const capabilities = {
      readStructure: {
        definition: { name: 'readStructure', description: 'read', input_schema: {} },
        execute: vi.fn(),
      },
    };
    await expect(runAssistantProvider({ ...input, provider, capabilities })).rejects.toThrow(
      'not available'
    );
    input.assertCurrent.mockRejectedValueOnce(new Error('Revision changed'));
    const called = vi.mocked(provider.generateWithTools!).mock.calls.length;
    await expect(runAssistantProvider({ ...input, provider, capabilities })).rejects.toThrow(
      'Revision changed'
    );
    expect(vi.mocked(provider.generateWithTools!).mock.calls).toHaveLength(called);
  });
});
