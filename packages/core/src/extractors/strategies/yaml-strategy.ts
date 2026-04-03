/**
 * YAML Extraction Strategy
 *
 * Extracts semantic content by having the LLM output YAML,
 * then parsing and validating it. This is the original extraction approach.
 */

import type { LLMProvider } from '../../llm/types';
import type { SemanticContent } from '../../semantic/types';
import { validateIntegrity } from '../../semantic/validate';
import { applyYOps } from '../../yops/engine';
import { ylint } from '../../ylint';
import type { ExtractionResult } from '../extractor';
import type { ExtractionStyleConfig } from '../extractionStyleConfig';
import { parseYOpsOutput } from '../yopsParser';
import type { ExtractionInput } from '../yopsPrompt';
import { buildYOpsPrompt } from '../yopsPrompt';
import type { ExtractionStrategy } from './types';

const MAX_RETRIES = 1;
const TEMPERATURE = 0.1;
const MAX_TOKENS = 8192;

export class YamlExtractionStrategy implements ExtractionStrategy {
  readonly name = 'yaml';

  async extract(
    input: ExtractionInput,
    provider: LLMProvider,
    style?: ExtractionStyleConfig
  ): Promise<ExtractionResult> {
    const baseSnapshot: SemanticContent = input.snapshot ?? { trees: [], relations: [] };
    let lastError = '';
    const totalUsage = { inputTokens: 0, outputTokens: 0 };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const { systemPrompt, userPrompt } = buildYOpsPrompt(input, style);
      const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

      let raw: string;
      try {
        const genResult = await provider.generate(combinedPrompt, {
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

      const parseResult = parseYOpsOutput(raw);
      if (!parseResult.ok) {
        lastError = `Failed to parse LLM output: ${parseResult.error}`;
        continue;
      }

      const applyResult = applyYOps(baseSnapshot, parseResult.yops);
      if (!applyResult.ok) {
        lastError = `Failed to apply YOps: ${applyResult.error?.message ?? 'unknown'}`;
        continue;
      }

      const snapshot: SemanticContent = { trees: applyResult.trees, relations: applyResult.relations };

      const validation = validateIntegrity(snapshot);
      if (!validation.valid) {
        lastError = `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`;
        continue;
      }

      const lintResult = ylint(snapshot);

      return { ok: true, yops: parseResult.yops, snapshot, usage: totalUsage, lintResult };
    }

    return { ok: false, error: lastError, usage: totalUsage };
  }
}
