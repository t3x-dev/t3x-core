// @vitest-environment node

import type { SourcedYOp } from '@t3x-dev/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callExtractionLLMMock = vi.fn();

vi.mock('@/commands/yops/llmAdapter', () => ({
  callExtractionLLM: (...args: unknown[]) => callExtractionLLMMock(...args),
}));

import { addSpanAsYOps } from '@/commands/yops/addSpanCommand';

function sourcedOp(startInSelection: number, endInSelection: number, quote: string): SourcedYOp {
  return {
    set: { path: 'sights/value', value: quote },
    source: {
      type: 'llm',
      model: 'test-model',
      at: '2026-04-23T00:00:00Z',
      turn_ref: {
        turn_hash: 'sha256:t1',
        quote,
        start_char: startInSelection,
        end_char: endInSelection,
      },
    },
  } as SourcedYOp;
}

describe('addSpanAsYOps', () => {
  beforeEach(() => {
    callExtractionLLMMock.mockReset();
  });

  it('calls the extraction LLM with a single synthetic turn carrying the selected text', async () => {
    callExtractionLLMMock.mockResolvedValue({ ops: [] });

    await addSpanAsYOps({
      conversationId: 'conv_1',
      turnHash: 'sha256:t1',
      text: 'Lingyin Temple',
      start: 23,
      end: 37,
      provider: 'openai',
      model: 'gpt-4o-mini',
    });

    expect(callExtractionLLMMock).toHaveBeenCalledWith({
      conversationId: 'conv_1',
      turns: [{ turn_hash: 'sha256:t1', content: 'Lingyin Temple' }],
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
  });

  it('shifts start_char/end_char by the selection start so offsets align with the full turn', async () => {
    // LLM sees content="Lingyin Temple" (14 chars) and emits a quote at [0, 14) of that substring.
    callExtractionLLMMock.mockResolvedValue({ ops: [sourcedOp(0, 14, 'Lingyin Temple')] });

    const [op] = await addSpanAsYOps({
      conversationId: 'conv_1',
      turnHash: 'sha256:t1',
      text: 'Lingyin Temple',
      start: 23,
      end: 37,
    });

    const ref = (
      op as unknown as { source: { turn_ref: { start_char: number; end_char: number } } }
    ).source.turn_ref;
    expect(ref.start_char).toBe(23);
    expect(ref.end_char).toBe(37);
  });

  it('returns an empty array without calling the LLM when the selected text is blank', async () => {
    callExtractionLLMMock.mockResolvedValue({ ops: [sourcedOp(0, 0, '')] });
    const ops = await addSpanAsYOps({
      conversationId: 'conv_1',
      turnHash: 'sha256:t1',
      text: '   ',
      start: 0,
      end: 3,
    });
    expect(ops).toEqual([]);
    expect(callExtractionLLMMock).not.toHaveBeenCalled();
  });

  it('leaves ops without char offsets untouched', async () => {
    const opNoOffsets = {
      define: { path: 'sights' },
      source: {
        type: 'llm',
        model: 'test-model',
        at: '2026-04-23T00:00:00Z',
        turn_ref: { turn_hash: 'sha256:t1', quote: 'sights' },
      },
    } as SourcedYOp;
    callExtractionLLMMock.mockResolvedValue({ ops: [opNoOffsets] });

    const [op] = await addSpanAsYOps({
      conversationId: 'conv_1',
      turnHash: 'sha256:t1',
      text: 'Key sights',
      start: 10,
      end: 20,
    });
    const ref = (op as unknown as { source: { turn_ref: Record<string, unknown> } }).source
      .turn_ref;
    expect(ref.start_char).toBeUndefined();
    expect(ref.end_char).toBeUndefined();
  });
});
