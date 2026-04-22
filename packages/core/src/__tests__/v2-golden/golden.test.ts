/**
 * F15 — Golden eval harness.
 *
 * Regression testing for the deterministic portions of the V2 extraction
 * pipeline. Each golden is a directory containing:
 *
 *   turns.json              input conversation (PromptTurnInput[])
 *   provider-response.json  what the LLM "said" — mocked so no network
 *                           call and no non-determinism
 *   expected.json           expected { draft, compiledOpKinds, snapshotTrees }
 *
 * The harness runs extractAndApply with a mock provider that replays the
 * recorded response, and asserts the pipeline's output matches the
 * expected file exactly. When someone changes the pipeline (normalizer,
 * compiler, lift step, etc.), any behavior drift fails a golden test
 * and forces an explicit update to expected.json.
 *
 * Adding a new golden: drop a new directory under v2-golden/ with the
 * three JSON files. This test auto-discovers them.
 *
 * Why not test with real LLM calls?
 * - Expensive + flaky in CI (rate limits, cost, variance)
 * - Real LLM variance is covered by the --runs=N harness invoked manually
 * - Golden tests verify the pipeline's DETERMINISTIC behavior — that's
 *   what CI should enforce. LLM quality is a separate concern with
 *   separate gating.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractAndApply } from '../../extractors/v2/extract-and-apply';
import type { PromptTurnInput } from '../../extractors/v2/normalization';
import type { LLMProvider, StructuredResult } from '../../llm/types';

const GOLDEN_DIR = dirname(fileURLToPath(import.meta.url));

function discoverGoldens(): string[] {
  return readdirSync(GOLDEN_DIR)
    .map((entry) => resolve(GOLDEN_DIR, entry))
    .filter((p) => statSync(p).isDirectory())
    .sort();
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

interface ExpectedGolden {
  draft: unknown;
  compiledOpKinds: string[];
  snapshotTrees: unknown;
}

function opKind(op: Record<string, unknown>): string {
  for (const key of Object.keys(op)) {
    if (key !== 'source') return key;
  }
  return 'unknown';
}

describe('F15 v2 golden eval', () => {
  const goldens = discoverGoldens();

  if (goldens.length === 0) {
    it.skip('no goldens found — add directories under __tests__/v2-golden/', () => {});
    return;
  }

  for (const goldenPath of goldens) {
    const name = basename(goldenPath);

    it(`replays ${name} → pipeline output matches expected`, async () => {
      const turns = loadJson<PromptTurnInput[]>(resolve(goldenPath, 'turns.json'));
      const recordedResponse = loadJson<unknown>(resolve(goldenPath, 'provider-response.json'));
      const expected = loadJson<ExpectedGolden>(resolve(goldenPath, 'expected.json'));

      const provider: Pick<LLMProvider, 'generateStructured'> = {
        async generateStructured() {
          // Mock — replays the recorded provider response verbatim.
          return {
            data: recordedResponse,
            usage: { inputTokens: 0, outputTokens: 0 },
          } as StructuredResult<unknown>;
        },
      };

      const result = await extractAndApply({
        turns,
        mode: 'bootstrap',
        providerId: 'openai',
        provider,
        model: 'golden-mock',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Draft — full structural equality.
      expect(result.draft).toEqual(expected.draft);

      // Compiled ops — assert op kinds in order. Skip the source field
      // (which embeds LLM model name and timestamp) to keep goldens stable.
      const actualKinds = result.compiled.ops.map((op) =>
        opKind(op as unknown as Record<string, unknown>)
      );
      expect(actualKinds).toEqual(expected.compiledOpKinds);

      // Snapshot trees — structural equality.
      expect(result.snapshot.trees).toEqual(expected.snapshotTrees);
    });
  }
});
