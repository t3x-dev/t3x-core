import { parseSchema } from '@t3x-dev/yschema';
import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '../../llm/types';
import { YamlExtractionStrategy } from '../strategies/yaml-strategy';
import type { ExtractionInput } from '../yopsPrompt';

// ── Helpers ──

function mockProvider(responses: string[]): LLMProvider {
  let i = 0;
  return {
    id: 'test-provider',
    generate: vi.fn(async () => {
      const text = responses[i] ?? responses[responses.length - 1] ?? '';
      i++;
      return { text, usage: { inputTokens: 10, outputTokens: 5 } };
    }),
    resolveConflict: vi.fn(async () => ({ text: '', usage: { inputTokens: 0, outputTokens: 0 } })),
  };
}

// ── Schema fixture ──

const composeSchema = parseSchema(`
name: docker-compose
strict: false
nodes:
  services:
    required: true
    children: any
    each_child:
      slots:
        image:
          type: scalar
          required: true
          pattern: "^[^:\\\\s]+:[^:\\\\s]+$"
`);

// ── LLM output fixtures ──

// YAML tree format — image without a tag → fails pattern
const BAD_OUTPUT = `services:
  app:
    image: nginx
---
{"slot_quotes":{},"source_map":{"services":"T1"}}`;

// YAML tree format — image with tag → passes pattern
const GOOD_OUTPUT = `services:
  app:
    image: nginx:1.25
---
{"slot_quotes":{},"source_map":{"services":"T1"}}`;

const baseTurns = [
  { role: 'user' as const, content: 'I want nginx pinned to 1.25', turn_hash: 'T1' },
];

// ── Tests ──

describe('yaml-strategy L3 schema repair', () => {
  it('repairs schema violations when targetSchema is provided', async () => {
    const provider = mockProvider([BAD_OUTPUT, GOOD_OUTPUT]);
    const strategy = new YamlExtractionStrategy();
    const result = await strategy.extract(
      { turns: baseTurns, targetSchema: composeSchema } as ExtractionInput,
      provider
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // After repair, services/app/image should have the tagged version
    const services = result.snapshot.trees.find((t) => t.key === 'services');
    expect(services).toBeDefined();
    const app = services?.children.find((c) => c.key === 'app');
    expect(app?.slots.image).toBe('nginx:1.25');
  });

  it('gives up after schema retries exhausted if schema still fails', async () => {
    const provider = mockProvider([BAD_OUTPUT, BAD_OUTPUT, BAD_OUTPUT]);
    const strategy = new YamlExtractionStrategy();
    const result = await strategy.extract(
      { turns: baseTurns, targetSchema: composeSchema } as ExtractionInput,
      provider
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/schema|pattern|INVALID_PATTERN/i);
  });

  it('bypasses schema validation when targetSchema is absent (regression check)', async () => {
    const provider = mockProvider([BAD_OUTPUT]);
    const strategy = new YamlExtractionStrategy();
    const result = await strategy.extract({ turns: baseTurns } as ExtractionInput, provider);
    // BAD_OUTPUT passes L0/L1/L2 fine; without targetSchema, no L3 runs
    expect(result.ok).toBe(true);
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });
});
