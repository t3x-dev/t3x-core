import type { LLMProvider } from '@t3x-dev/core';
import { describe, expect, it, vi } from 'vitest';
import { createInferenceRuntime } from '../lib/inference';
import {
  type AssistantEvent,
  runAssistantProvider,
} from '../lib/workspace-assistant/adapters/provider-tools';

const usage = { inputTokens: 4, outputTokens: 2 };
function fixture() {
  const runtime = createInferenceRuntime();
  const metered = vi.spyOn(runtime, 'execute');
  const events: AssistantEvent[] = [];
  return {
    metered,
    events,
    input: {
      model: 'test-model',
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
  it('executes an explicitly requested proposal before the assistant response', async () => {
    const { input, events } = fixture();
    const execute = vi.fn(async () => ({ status: 'candidate', transitionId: 'transition:1' }));
    const generateWithTools = vi.fn(async () => ({
      tool_calls: [],
      stop_reason: 'end_turn' as const,
      usage,
      _rawAssistantContent: [{ type: 'text' as const, text: 'Candidate generated.' }],
    }));
    await runAssistantProvider({
      ...input,
      provider: { id: 'test', generateWithTools } as unknown as LLMProvider,
      capabilities: {
        requestProposal: {
          definition: { name: 'requestProposal', description: 'proposal', input_schema: {} },
          execute,
        },
      },
      initialToolCall: {
        name: 'requestProposal',
        input: { instruction: 'change replicas from 4 to 10' },
      },
    });
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
    expect(generateWithTools).toHaveBeenCalledOnce();
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
    await expect(runAssistantProvider({ ...input, provider, capabilities: {} })).rejects.toThrow(
      'not available'
    );
    input.assertCurrent.mockRejectedValueOnce(new Error('Revision changed'));
    const called = vi.mocked(provider.generateWithTools!).mock.calls.length;
    await expect(runAssistantProvider({ ...input, provider, capabilities: {} })).rejects.toThrow(
      'Revision changed'
    );
    expect(vi.mocked(provider.generateWithTools!).mock.calls).toHaveLength(called);
  });
});
