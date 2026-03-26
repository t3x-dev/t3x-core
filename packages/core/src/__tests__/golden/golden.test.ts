import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { describe, expect, it } from 'vitest';
import { Extractor } from '../../extractors/extractor';
import { ClaudeProvider } from '../../providers/llm/claude';
import { SemanticContentSchema } from '../../semantic/schema';
import { validateIntegrity } from '../../semantic/validate';

// Load .env from monorepo root
config({ path: resolve(__dirname, '../../../../../.env') });

// ── Config ──

const FIXTURES_DIR = resolve(__dirname, 'fixtures');

const apiKey = process.env.ANTHROPIC_API_KEY ?? '';

// Lazily create provider/extractor only when API key is available
const provider = apiKey ? new ClaudeProvider({ apiKey }) : undefined;
const extractor = provider ? new Extractor(provider) : undefined;

// ── Types ──

interface GoldenInput {
  turns: { role: string; content: string }[];
}

interface GoldenExpected {
  minFrames: number;
  maxFrames: number;
  requiredFrameTypes: string[];
  requiredSlotKeys: Record<string, string[]>;
  requiredRelationTypes: string[];
}

// ── Fixtures ──

const CASES = [
  '01-business-email',
  '02-medical-dialogue',
  '03-legal-clause',
  '04-product-meeting',
  '05-personal-planning',
];

function loadFixture(name: string): {
  input: GoldenInput;
  expected: GoldenExpected;
} {
  const input = JSON.parse(
    readFileSync(resolve(FIXTURES_DIR, `${name}.input.json`), 'utf-8')
  ) as GoldenInput;
  const expected = JSON.parse(
    readFileSync(resolve(FIXTURES_DIR, `${name}.expected.json`), 'utf-8')
  ) as GoldenExpected;
  return { input, expected };
}

// ── Helpers ──

/**
 * Fuzzy type match: checks if any actual type contains the expected keyword.
 * LLM generates domain-specific types (e.g., "business_expansion_proposal")
 * while fixtures use generic keywords (e.g., "proposal").
 */
function hasTypeContaining(actualTypes: Set<string>, keyword: string): boolean {
  for (const actual of actualTypes) {
    if (actual.includes(keyword)) return true;
  }
  return false;
}

/**
 * Find frames whose type contains the given keyword.
 */
function framesMatchingKeyword(
  frames: { type: string; slots: Record<string, unknown> }[],
  keyword: string
) {
  return frames.filter((f) => f.type.includes(keyword));
}

// ── Tests ──

describe.skipIf(!apiKey)('Golden Set — real LLM extraction', () => {
  for (const caseName of CASES) {
    it(
      caseName,
      async () => {
        if (!extractor) throw new Error('unreachable: extractor not initialized');
        const { input, expected } = loadFixture(caseName);

        const result = await extractor.extract({
          turns: input.turns as {
            role: 'user' | 'assistant' | 'system' | 'tool';
            content: string;
          }[],
        });

        // Must succeed
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const snapshot = result.snapshot;

        // 1. Schema validation
        const schemaResult = SemanticContentSchema.safeParse(snapshot);
        expect(schemaResult.success).toBe(true);

        // 2. Integrity validation (no errors)
        const integrity = validateIntegrity(snapshot);
        expect(integrity.errors).toEqual([]);

        // 3. Frame count in range
        expect(snapshot.frames.length).toBeGreaterThanOrEqual(expected.minFrames);
        expect(snapshot.frames.length).toBeLessThanOrEqual(expected.maxFrames);

        // 4. Required frame types exist (fuzzy: keyword substring match)
        const frameTypes = new Set(snapshot.frames.map((f) => f.type));
        for (const requiredType of expected.requiredFrameTypes) {
          expect(
            hasTypeContaining(frameTypes, requiredType),
            `No frame type containing "${requiredType}". Got: [${[...frameTypes].join(', ')}]`
          ).toBe(true);
        }

        // 5. Required slot keys exist on matching frame types (fuzzy match)
        for (const [frameType, slotKeys] of Object.entries(expected.requiredSlotKeys)) {
          const matchingFrames = framesMatchingKeyword(snapshot.frames, frameType);
          expect(
            matchingFrames.length,
            `No frame type containing "${frameType}". Got: [${[...frameTypes].join(', ')}]`
          ).toBeGreaterThan(0);
          for (const key of slotKeys) {
            const hasKey = matchingFrames.some((f) => key in f.slots);
            expect(hasKey, `Frame type containing "${frameType}" missing slot key "${key}"`).toBe(
              true
            );
          }
        }

        // 6. Required relation types exist (fuzzy: keyword substring match)
        const relationTypes = new Set(snapshot.relations.map((r) => r.type));
        for (const requiredType of expected.requiredRelationTypes) {
          expect(
            hasTypeContaining(relationTypes, requiredType),
            `No relation type containing "${requiredType}". Got: [${[...relationTypes].join(', ')}]`
          ).toBe(true);
        }
      },
      { timeout: 60_000 }
    );
  }
});
