/**
 * Extractor Orchestrator
 *
 * Orchestrates the semantic extraction pipeline:
 * buildYOpsPrompt → LLM generate → parseYOpsOutput → applyYOps → validate → ylint
 *
 * Retries once on parse or validation failure (MAX_RETRIES = 1, 2 attempts total).
 */

import type { LLMProvider } from '../llm/types';
import type { SemanticContent } from '../semantic/types';
import { validateIntegrity } from '../semantic/validate';
import { applyYOps } from '../yops/engine';
import type { YOp } from '../yops/types';
import { ylint } from '../ylint';
import type { LintResult } from '../ylint/types';
import type { ExtractionStyleConfig } from './extractionStyleConfig';
import { parseYOpsOutput } from './yopsParser';
import type { ExtractionInput, ExtractionTurn } from './yopsPrompt';
import { buildYOpsPrompt } from './yopsPrompt';

// ── Constants ──

const MAX_RETRIES = 1;
const TEMPERATURE = 0.1;
const MAX_TOKENS = 8192;

// ── Result Type ──

export type ExtractionResult =
  | {
      ok: true;
      yops: YOp[];
      snapshot: SemanticContent;
      usage: { inputTokens: number; outputTokens: number };
      lintResult?: LintResult;
    }
  | { ok: false; error: string; usage: { inputTokens: number; outputTokens: number } };

// ── Re-export input types ──

export type { ExtractionInput, ExtractionTurn };

// ── Class ──

export class Extractor {
  constructor(private readonly provider: LLMProvider) {}

  async extract(
    input: ExtractionInput,
    style?: ExtractionStyleConfig
  ): Promise<ExtractionResult> {
    const baseSnapshot: SemanticContent = input.snapshot ?? { trees: [], relations: [] };
    let lastError = '';
    const totalUsage = { inputTokens: 0, outputTokens: 0 };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // 1. Build prompt (YOps format)
      const { systemPrompt, userPrompt } = buildYOpsPrompt(input, style);
      const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

      // 2. Call LLM
      let raw: string;
      try {
        const genResult = await this.provider.generate(combinedPrompt, {
          temperature: TEMPERATURE,
          maxTokens: MAX_TOKENS,
        });
        raw = genResult.text;
        totalUsage.inputTokens += genResult.usage.inputTokens;
        totalUsage.outputTokens += genResult.usage.outputTokens;
      } catch (err) {
        lastError = `LLM provider error: ${err instanceof Error ? err.message : String(err)}`;
        continue;
      }

      // 3. Parse YOps output
      const parseResult = parseYOpsOutput(raw);
      if (!parseResult.ok) {
        lastError = `Failed to parse LLM output: ${parseResult.error}`;
        continue;
      }

      // 4. Apply YOps
      const applyResult = applyYOps(baseSnapshot, parseResult.yops);
      if (!applyResult.ok) {
        lastError = `Failed to apply YOps: ${applyResult.error?.message ?? 'unknown'}`;
        continue;
      }

      const snapshot: SemanticContent = { trees: applyResult.trees, relations: applyResult.relations };

      // 5. Validate integrity
      const validation = validateIntegrity(snapshot);
      if (!validation.valid) {
        lastError = `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`;
        continue;
      }

      // 6. ylint (non-blocking — attach result)
      const lintResult = ylint(snapshot);

      return { ok: true, yops: parseResult.yops, snapshot, usage: totalUsage, lintResult };
    }

    return { ok: false, error: lastError, usage: totalUsage };
  }
}
