/**
 * E2E: conversation turns → yaml-strategy → schema-valid tree → emitted compose YAML.
 *
 * Proves the full pipeline works end-to-end against the real docker-compose
 * yschema, with a mock LLM that needs one repair round.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { YValue } from '@t3x-dev/yops';
import { parseSchema, validateSchema } from '@t3x-dev/yschema';
import { describe, expect, it, vi } from 'vitest';
import { emitDockerCompose } from '../../emitters';
import { YamlExtractionStrategy } from '../../extractors/strategies/yaml-strategy';
import type { ExtractionInput } from '../../extractors/yopsPrompt';
import type { LLMProvider } from '../../llm/types';
import { semanticToPlain } from '../../semantic/serialize';

function mockProvider(responses: string[]): LLMProvider {
  let i = 0;
  return {
    id: 'e2e-provider',
    generate: vi.fn(async () => {
      const text = responses[i] ?? responses[responses.length - 1] ?? '';
      i++;
      return { text, usage: { inputTokens: 10, outputTokens: 5 } };
    }),
    resolveConflict: vi.fn(async () => ({
      text: '',
      usage: { inputTokens: 0, outputTokens: 0 },
    })),
  };
}

// Load the actual production compose schema — proves this works with the
// real artifact, not a test stub.
const composeSchemaPath = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'yschema',
  'examples',
  'docker-compose.yschema.yaml'
);
const composeSchema = parseSchema(readFileSync(composeSchemaPath, 'utf8'));

const turns = [
  {
    role: 'user' as const,
    content: 'I want an nginx web server pinned to 1.25 on port 8080',
  },
];

// First attempt: LLM forgets to tag the image (INVALID_PATTERN).
const BAD_YOPS = `yops:
  - define:
      path: services
      source: "nginx web server"
      from: T1
  - define:
      path: services/web
      source: "nginx web server"
      from: T1
  - set:
      path: services/web/image
      value: nginx
      source: "nginx"
      from: T1
  - set:
      path: services/web/ports
      value:
        - "8080:80"
      source: "port 8080"
      from: T1
`;

// Repair: tag the image properly.
const GOOD_YOPS = `yops:
  - define:
      path: services
      source: "nginx web server"
      from: T1
  - define:
      path: services/web
      source: "nginx web server"
      from: T1
  - set:
      path: services/web/image
      value: "nginx:1.25"
      source: "nginx web server"
      from: T1
  - set:
      path: services/web/ports
      value:
        - "8080:80"
      source: "port 8080"
      from: T1
`;

describe('E2E: conversation → compose-valid tree → compose YAML', () => {
  it('produces a schema-valid tree after one repair round, and emits valid compose', async () => {
    const strategy = new YamlExtractionStrategy();
    const provider = mockProvider([BAD_YOPS, GOOD_YOPS]);

    const result = await strategy.extract(
      { turns, targetSchema: composeSchema } as ExtractionInput,
      provider
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Tree passes yschema with zero errors.
    const plain = semanticToPlain(result.snapshot) as YValue;
    const vresult = validateSchema(plain, composeSchema);
    const errors = vresult.violations.filter((v) => v.severity === 'error');
    expect(errors).toEqual([]);

    // LLM was called twice — initial + one repair.
    expect((provider.generate as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);

    // Emitted YAML contains the tagged image and ports.
    const yaml = emitDockerCompose(plain as Record<string, unknown>);
    expect(yaml).toContain('nginx:1.25');
    expect(yaml).toContain('"8080:80"');
    expect(yaml).toMatch(/services:\s*\n\s+web:/);
  });

  it('hard-fails (no silent accept) when LLM cannot satisfy the schema', async () => {
    const strategy = new YamlExtractionStrategy();
    // Every response is still bad — pattern fails.
    const provider = mockProvider([BAD_YOPS, BAD_YOPS, BAD_YOPS]);

    const result = await strategy.extract(
      { turns, targetSchema: composeSchema } as ExtractionInput,
      provider
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/schema|pattern|INVALID_PATTERN/i);
  });
});
