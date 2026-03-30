import { describe, expect, it, vi } from 'vitest';
import type { NodeWithSignals } from '../../extractors/compressPrompt';
import { Compressor } from '../../extractors/compressor';
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

const baseFrames: NodeWithSignals[] = [
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

describe('Compressor', () => {
  it('parses a valid compress output and produces YOps', async () => {
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
    const compressor = new Compressor(provider);
    const result = await compressor.compress({ frames: baseFrames, relations: [] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // 1 drop + 2 set ops (type and area)
      expect(result.yops.length).toBeGreaterThan(0);
      expect(result.yops.some((op) => 'drop' in op)).toBe(true);
      expect(result.yops.some((op) => 'set' in op)).toBe(true);
      expect(result.metadata.compress_summary).toBe('Merged 2 accommodation frames');
      expect(result.metadata.nodes_before).toBe(3);
      expect(result.metadata.nodes_after).toBe(2);
    }
  });

  it('returns ok with empty yops when nothing to compress', async () => {
    const llmOutput = JSON.stringify({
      changes: [],
      remove_relations: [],
      summary: 'Nothing to compress',
      stats: { before: 3, after: 3, merged: 0, removed: 0 },
    });

    const provider = makeMockProvider(llmOutput);
    const compressor = new Compressor(provider);
    const result = await compressor.compress({ frames: baseFrames, relations: [] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yops).toHaveLength(0);
    }
  });

  it('rejects output with add actions', async () => {
    const llmOutput = JSON.stringify({
      changes: [{ action: 'add', frame: { id: 'f_new', type: 'x', slots: {} } }],
      remove_relations: [],
      summary: 'Bad output',
      stats: { before: 3, after: 4, merged: 0, removed: 0 },
    });

    const provider = makeMockProvider(llmOutput);
    const compressor = new Compressor(provider);
    const result = await compressor.compress({ frames: baseFrames, relations: [] });

    expect(result.ok).toBe(false);
  });

  it('returns error on invalid JSON', async () => {
    const provider = makeMockProvider('not json at all');
    const compressor = new Compressor(provider);
    const result = await compressor.compress({ frames: baseFrames, relations: [] });

    expect(result.ok).toBe(false);
  });
});
