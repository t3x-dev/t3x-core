/**
 * Frame Extractor Orchestrator
 *
 * Orchestrates the frame semantic extraction pipeline:
 * buildPrompt → LLM generate → parse delta → apply delta → validate integrity
 *
 * When the provider supports generateStructured(), uses native structured output
 * for more reliable extraction. Falls back to generate() + text parsing for
 * legacy providers.
 *
 * Retries once on parse or validation failure (MAX_RETRIES = 1, 2 attempts total).
 */

import type { LLMGenerateOptionsV2, LLMPrompt, LLMProvider } from '../llm/types';
import { applyDelta } from '../semantic/delta';
import { DeltaSchema } from '../semantic/schema';
import type { Delta, SemanticContent } from '../semantic/types';
import { validateIntegrity } from '../semantic/validate';
import { parseFrameDelta } from './frameDeltaParser';
import type { FrameExtractionInput, FrameExtractionTurn } from './frameExtractionPrompt';
import { buildFrameExtractionPrompt } from './frameExtractionPrompt';

// ── Constants ──

const MAX_RETRIES = 1;
const TEMPERATURE = 0.1;
const MAX_TOKENS = 4096;

// ── Result Type ──

export type FrameExtractionResult =
  | {
      ok: true;
      delta: Delta;
      snapshot: SemanticContent;
      usage: { inputTokens: number; outputTokens: number };
    }
  | { ok: false; error: string; usage: { inputTokens: number; outputTokens: number } };

// ── Re-export input types ──

export type { FrameExtractionInput, FrameExtractionTurn };

// ── Helpers ──

/**
 * Call generateStructured with one retry on validation failure.
 * The retry appends the error message to guide the model.
 */
async function callGenerateStructured(
  provider: Required<Pick<LLMProvider, 'generateStructured'>>,
  prompt: LLMPrompt,
  options: LLMGenerateOptionsV2
): Promise<{
  delta: Delta;
  usage: { inputTokens: number; outputTokens: number };
}> {
  const promptWithRetry = { ...prompt, messages: [...prompt.messages] };
  try {
    const result = await provider.generateStructured(promptWithRetry, DeltaSchema, options);
    return { delta: result.data as Delta, usage: result.usage };
  } catch (error) {
    // Retry once with error feedback appended to the conversation
    const errorMsg = `Previous attempt failed validation: ${error instanceof Error ? error.message : String(error)}. Fix these issues.`;
    promptWithRetry.messages.push(
      { role: 'assistant', content: 'I apologize for the error.' },
      { role: 'user', content: errorMsg }
    );
    const retryResult = await provider.generateStructured(promptWithRetry, DeltaSchema, options);
    return { delta: retryResult.data as Delta, usage: retryResult.usage };
  }
}

// ── Class ──

export class FrameExtractor {
  constructor(private readonly provider: LLMProvider) {}

  async extract(input: FrameExtractionInput): Promise<FrameExtractionResult> {
    const baseSnapshot: SemanticContent = input.snapshot ?? { frames: [], relations: [] };
    const totalUsage = { inputTokens: 0, outputTokens: 0 };

    // ── Structured output path (provider-native, more reliable) ──
    if (typeof this.provider.generateStructured === 'function') {
      const { systemPrompt, userPrompt } = buildFrameExtractionPrompt(input);
      const prompt: LLMPrompt = {
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      };
      const options: LLMGenerateOptionsV2 = {
        model: this.provider.id,
        temperature: TEMPERATURE,
        maxTokens: MAX_TOKENS,
      };

      let delta: Delta;
      try {
        const structured = await callGenerateStructured(
          this.provider as Required<Pick<LLMProvider, 'generateStructured'>>,
          prompt,
          options
        );
        delta = structured.delta;
        totalUsage.inputTokens += structured.usage.inputTokens;
        totalUsage.outputTokens += structured.usage.outputTokens;
      } catch (err) {
        return {
          ok: false,
          error: `LLM structured output error: ${err instanceof Error ? err.message : String(err)}`,
          usage: totalUsage,
        };
      }

      // Apply delta
      let snapshot: SemanticContent;
      try {
        snapshot = applyDelta(baseSnapshot, delta);
      } catch (err) {
        return {
          ok: false,
          error: `Failed to apply delta: ${err instanceof Error ? err.message : String(err)}`,
          usage: totalUsage,
        };
      }

      // Validate integrity
      const validation = validateIntegrity(snapshot);
      if (!validation.valid) {
        const errorMessages = validation.errors.map((e) => e.message).join('; ');
        return { ok: false, error: `Validation failed: ${errorMessages}`, usage: totalUsage };
      }

      return { ok: true, delta, snapshot, usage: totalUsage };
    }

    // ── Legacy path: generate() + text parsing ──
    let lastError = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // 1. Build prompt
      const { systemPrompt, userPrompt } = buildFrameExtractionPrompt(input);
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

      // 3. Parse delta
      const parseResult = parseFrameDelta(raw, input.snapshot);
      if (!parseResult.ok) {
        lastError = `Failed to parse LLM output: ${parseResult.error}`;
        continue;
      }

      // 4. Apply delta
      let snapshot: SemanticContent;
      try {
        snapshot = applyDelta(baseSnapshot, parseResult.delta);
      } catch (err) {
        lastError = `Failed to apply delta: ${err instanceof Error ? err.message : String(err)}`;
        continue;
      }

      // 5. Validate integrity
      const validation = validateIntegrity(snapshot);
      if (!validation.valid) {
        const errorMessages = validation.errors.map((e) => e.message).join('; ');
        lastError = `Validation failed: ${errorMessages}`;
        continue;
      }

      return { ok: true, delta: parseResult.delta, snapshot, usage: totalUsage };
    }

    return { ok: false, error: lastError, usage: totalUsage };
  }
}
