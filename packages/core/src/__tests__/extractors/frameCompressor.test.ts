import { describe, expect, it, vi } from 'vitest';
import type { FrameWithSignals } from '../../extractors/compressPrompt';
import { FrameCompressor } from '../../extractors/frameCompressor';
import type { LLMProvider } from '../../llm/types';

function makeMockProvider(jsonResponse: string): LLMProvider {
  return {
    id: 'mock',
    generate: vi.fn().mockResolvedValue({
      text: jsonResponse,
      usage: { inputTokens: 100, outputTokens: 50 },
    }),
  } as unknown as LLMProvider;
}

const baseFrames: FrameWithSignals[] = [
  {
    id: 'f_001',
    type: 'accommodation',
    slots: { type: 'hotel', area: 'central' },
    confidence: 0.45,
    has_manual_edit: false,
    last_touched: 5,
    mention_count: 1,
  },
  {
    id: 'f_002',
    type: 'accommodation',
    slots: { type: 'ryokan', area: 'Higashiyama' },
    confidence: 0.65,
    has_manual_edit: false,
    last_touched: 3,
    mention_count: 2,
  },
  {
    id: 'f_003',
    type: 'dietary',
    slots: { diet: 'vegetarian' },
    confidence: 0.9,
    has_manual_edit: true,
    last_touched: 1,
    mention_count: 3,
  },
];

describe('FrameCompressor', () => {
  it('parses a valid compress delta from LLM output', async () => {
    const llmOutput = JSON.stringify({
      changes: [
        { action: 'remove', target: 'f_001', reason: 'Merged into f_002' },
        {
          action: 'update',
          target: 'f_002',
          slots: { type: 'ryokan + hotel', area: 'Higashiyama, central' },
        },
      ],
      remove_relations: [],
      summary: 'Merged 2 accommodation frames',
      stats: { before: 3, after: 2, merged: 1, removed: 0 },
    });

    const provider = makeMockProvider(llmOutput);
    const compressor = new FrameCompressor(provider);
    const result = await compressor.compress({ frames: baseFrames, relations: [] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delta.changes).toHaveLength(2);
      expect(result.delta.changes[0].action).toBe('remove');
      expect(result.delta.changes[1].action).toBe('update');
      expect(result.metadata.compress_summary).toBe('Merged 2 accommodation frames');
      expect(result.metadata.frames_before).toBe(3);
      expect(result.metadata.frames_after).toBe(2);
    }
  });

  it('returns ok with empty changes when nothing to compress', async () => {
    const llmOutput = JSON.stringify({
      changes: [],
      remove_relations: [],
      summary: 'Nothing to compress',
      stats: { before: 3, after: 3, merged: 0, removed: 0 },
    });

    const provider = makeMockProvider(llmOutput);
    const compressor = new FrameCompressor(provider);
    const result = await compressor.compress({ frames: baseFrames, relations: [] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delta.changes).toHaveLength(0);
    }
  });

  it('rejects delta with add actions', async () => {
    const llmOutput = JSON.stringify({
      changes: [{ action: 'add', frame: { id: 'f_new', type: 'x', slots: {} } }],
      remove_relations: [],
      summary: 'Bad output',
      stats: { before: 3, after: 4, merged: 0, removed: 0 },
    });

    const provider = makeMockProvider(llmOutput);
    const compressor = new FrameCompressor(provider);
    const result = await compressor.compress({ frames: baseFrames, relations: [] });

    expect(result.ok).toBe(false);
  });

  it('returns error on invalid JSON', async () => {
    const provider = makeMockProvider('not json at all');
    const compressor = new FrameCompressor(provider);
    const result = await compressor.compress({ frames: baseFrames, relations: [] });

    expect(result.ok).toBe(false);
  });
});
