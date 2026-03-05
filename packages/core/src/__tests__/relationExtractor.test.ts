import { describe, expect, it, vi } from 'vitest';
import { RelationExtractor } from '../extractors/relationExtractor';
import type { LLMProvider } from '../llm/types';

function createMockProvider(response: string): LLMProvider {
  return {
    id: 'mock',
    generate: vi.fn().mockResolvedValue(response),
    resolveConflict: vi.fn(),
  };
}

describe('RelationExtractor', () => {
  const sentences = [
    { id: 's_aaa', text: 'The user prefers TypeScript for all projects.' },
    { id: 's_bbb', text: 'Because TypeScript catches type errors at compile time.' },
    { id: 's_ccc', text: 'However, JavaScript is simpler for small scripts.' },
  ];

  it('extracts relations from sentences', async () => {
    const mockResponse = JSON.stringify([
      {
        source_id: 's_aaa',
        target_id: 's_bbb',
        type: 'supports',
        confidence: 0.9,
        reasoning: 'S_bbb explains why S_aaa',
      },
      {
        source_id: 's_aaa',
        target_id: 's_ccc',
        type: 'contrasts',
        confidence: 0.85,
        reasoning: 'S_ccc qualifies S_aaa',
      },
    ]);
    const provider = createMockProvider(mockResponse);
    const extractor = new RelationExtractor(provider);
    const result = await extractor.extract(sentences);
    expect(result.relations).toHaveLength(2);
    expect(result.relations[0].type).toBe('supports');
    expect(result.relations[1].type).toBe('contrasts');
    expect(result.stats.total_sentences).toBe(3);
    expect(result.stats.relations_found).toBe(2);
    expect(result.stats.avg_confidence).toBeCloseTo(0.875);
    expect(result.stats.extraction_time_ms).toBeGreaterThanOrEqual(0);
  });

  it('returns empty result for fewer than 2 sentences', async () => {
    const provider = createMockProvider('[]');
    const extractor = new RelationExtractor(provider);
    const result = await extractor.extract([{ id: 's_aaa', text: 'Only one.' }]);
    expect(result.relations).toHaveLength(0);
    expect(result.stats.total_sentences).toBe(1);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('calls provider.generate with combined prompt', async () => {
    const provider = createMockProvider('[]');
    const extractor = new RelationExtractor(provider);
    await extractor.extract(sentences);
    expect(provider.generate).toHaveBeenCalledOnce();
    const call = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain('discourse relation analyzer');
    expect(call[0]).toContain('[s_aaa]');
    expect(call[1]).toEqual({ temperature: 0.1, maxTokens: 4096 });
  });

  it('filters out relations with non-existent sentence IDs', async () => {
    const mockResponse = JSON.stringify([
      {
        source_id: 's_aaa',
        target_id: 's_bbb',
        type: 'supports',
        confidence: 0.9,
        reasoning: 'ok',
      },
      {
        source_id: 's_aaa',
        target_id: 's_zzz',
        type: 'causes',
        confidence: 0.9,
        reasoning: 'bad id',
      },
    ]);
    const provider = createMockProvider(mockResponse);
    const extractor = new RelationExtractor(provider);
    const result = await extractor.extract(sentences);
    expect(result.relations).toHaveLength(1);
  });

  it('generates rel_ prefixed IDs', async () => {
    const mockResponse = JSON.stringify([
      {
        source_id: 's_aaa',
        target_id: 's_bbb',
        type: 'supports',
        confidence: 0.9,
        reasoning: 'test',
      },
    ]);
    const provider = createMockProvider(mockResponse);
    const extractor = new RelationExtractor(provider);
    const result = await extractor.extract(sentences);
    expect(result.relations[0].id).toMatch(/^rel_/);
  });

  it('uses custom temperature when provided', async () => {
    const provider = createMockProvider('[]');
    const extractor = new RelationExtractor(provider);
    await extractor.extract(sentences, { temperature: 0.5 });
    const call = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].temperature).toBe(0.5);
  });
});
