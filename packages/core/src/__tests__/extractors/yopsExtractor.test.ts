import { describe, expect, it, vi } from 'vitest';
import { Extractor } from '../../extractors/extractor';
import type { SemanticContent, TreeNode } from '../../semantic/types';

const t = (
  key: string,
  slots: Record<string, unknown> = {},
  children: TreeNode[] = []
): TreeNode => ({
  key,
  slots,
  children,
});

const mockProvider = (text: string) => ({
  id: 'test-provider',
  generate: vi.fn().mockResolvedValue({
    text,
    usage: { inputTokens: 100, outputTokens: 50 },
  }),
  resolveConflict: vi.fn(async () => ''),
});

describe('Extractor with YOps', () => {
  it('first extraction returns yops with add op', async () => {
    const raw = `trip:\n  destination: Hangzhou\n---\n{"slot_quotes":{"destination":"go to HZ"},"source_map":{"trip":"T1"}}`;
    const extractor = new Extractor(mockProvider(raw));
    const result = await extractor.extract({
      turns: [{ role: 'user', content: 'Plan trip', turn_hash: 'T1' }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.yops).toBeDefined();
    expect(result.yops.length).toBeGreaterThan(0);
    expect(result.snapshot.trees).toHaveLength(1);
  });

  it('incremental returns yops', async () => {
    const raw = `yops:\n  - set:\n      path: trip/budget\n      value: 2000`;
    const snapshot: SemanticContent = { trees: [t('trip', { budget: 1000 })], relations: [] };
    const extractor = new Extractor(mockProvider(raw));
    const result = await extractor.extract({
      turns: [{ role: 'user', content: 'Budget 2000', turn_hash: 'T1' }],
      snapshot,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.trees[0].slots.budget).toBe(2000);
  });

  it('returns snapshot without lint scores', async () => {
    const raw = `trip:\n  destination: Hangzhou\n---\n{"slot_quotes":{"destination":"go"},"source_map":{"trip":"T1"}}`;
    const extractor = new Extractor(mockProvider(raw));
    const result = await extractor.extract({
      turns: [{ role: 'user', content: 'Hi', turn_hash: 'T1' }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.trees.length).toBeGreaterThan(0);
  });

  it('returns error on garbage output', async () => {
    const extractor = new Extractor(mockProvider('totally invalid'));
    const result = await extractor.extract({
      turns: [{ role: 'user', content: 'Hi', turn_hash: 'T1' }],
    });
    expect(result.ok).toBe(false);
  });

  it('retries once on parse failure then succeeds', async () => {
    const validOutput = `trip:\n  destination: Tokyo\n---\n{"slot_quotes":{"destination":"travel to Tokyo"},"source_map":{"trip":"T1"}}`;
    let callCount = 0;
    const provider = {
      id: 'test-provider',
      generate: vi.fn(async () => {
        callCount++;
        const text = callCount === 1 ? 'garbage output' : validOutput;
        return { text, usage: { inputTokens: 10, outputTokens: 5 } };
      }),
      resolveConflict: vi.fn(async () => ''),
    };
    const extractor = new Extractor(provider);
    const result = await extractor.extract({
      turns: [{ role: 'user', content: 'Travel to Tokyo', turn_hash: 'T1' }],
    });
    expect(result.ok).toBe(true);
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it('returns error after retries exhausted', async () => {
    const provider = {
      id: 'test-provider',
      generate: vi.fn(async () => ({
        text: 'garbage',
        usage: { inputTokens: 10, outputTokens: 5 },
      })),
      resolveConflict: vi.fn(async () => ''),
    };
    const extractor = new Extractor(provider);
    const result = await extractor.extract({
      turns: [{ role: 'user', content: 'hello', turn_hash: 'T1' }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('parse');
    // 2 attempts (main + retry) x 2 calls each (extract + repair) = 4
    expect(provider.generate).toHaveBeenCalledTimes(4);
  });

  it('accumulates usage across retries', async () => {
    const validOutput = `trip:\n  destination: Tokyo\n---\n{"slot_quotes":{"destination":"Tokyo"},"source_map":{"trip":"T1"}}`;
    let callCount = 0;
    const provider = {
      id: 'test-provider',
      generate: vi.fn(async () => {
        callCount++;
        return {
          text: callCount === 1 ? 'garbage' : validOutput,
          usage: { inputTokens: 100, outputTokens: 50 },
        };
      }),
      resolveConflict: vi.fn(async () => ''),
    };
    const extractor = new Extractor(provider);
    const result = await extractor.extract({
      turns: [{ role: 'user', content: 'Tokyo', turn_hash: 'T1' }],
    });
    expect(result.ok).toBe(true);
    expect(result.usage.inputTokens).toBe(200);
    expect(result.usage.outputTokens).toBe(100);
  });
});
