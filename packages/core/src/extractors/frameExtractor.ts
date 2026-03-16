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

/** Per-change slot quotes extracted from LLM output before Zod strips them */
export type SlotQuotesMap = Map<number, Record<string, string>>; // changeIndex → { slotKey: quote }

export type FrameExtractionResult =
  | {
      ok: true;
      delta: Delta;
      snapshot: SemanticContent;
      usage: { inputTokens: number; outputTokens: number };
      slotQuotes?: SlotQuotesMap;
    }
  | { ok: false; error: string; usage: { inputTokens: number; outputTokens: number } };

/**
 * Extract slot_quotes from raw LLM JSON before Zod validation strips them.
 * Returns a map of changeIndex → { slotKey: quote }.
 */
function extractSlotQuotes(rawJson: unknown): SlotQuotesMap {
  const map: SlotQuotesMap = new Map();
  if (!rawJson || typeof rawJson !== 'object') return map;

  const obj = rawJson as Record<string, unknown>;
  const changes = (obj.changes ?? obj.frames) as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(changes)) return map;

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    // For delta format: changes[i].frame.slot_quotes or changes[i].slot_quotes
    const quotes =
      (change.frame as Record<string, unknown>)?.slot_quotes ??
      change.slot_quotes;
    if (quotes && typeof quotes === 'object') {
      map.set(i, quotes as Record<string, string>);
      // Clean from the object so Zod doesn't reject unknown keys
      if ((change.frame as Record<string, unknown>)?.slot_quotes) {
        delete (change.frame as Record<string, unknown>).slot_quotes;
      }
      delete change.slot_quotes;
    }
    // For first-extraction format: frames[i].slot_quotes
    if (change.slot_quotes) {
      map.set(i, change.slot_quotes as Record<string, string>);
      delete change.slot_quotes;
    }
  }
  return map;
}

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
    // ── Text generation path ──
    // Always use generate() (not generateStructured) so we can extract
    // slot_quotes from the raw JSON before Zod validation strips them.
    let lastError = '';
    const totalUsage = { inputTokens: 0, outputTokens: 0 };

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

      // 3. Extract slot_quotes from raw JSON before parsing strips them
      let slotQuotes: SlotQuotesMap = new Map();
      try {
        // Find JSON in the raw text
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const rawJson = JSON.parse(jsonMatch[0]);
          slotQuotes = extractSlotQuotes(rawJson);
          // Re-stringify so parser gets clean JSON without slot_quotes
          raw = JSON.stringify(rawJson);
        }
      } catch {
        // JSON extraction failed — continue with original raw text
      }

      // 4. Parse delta
      const parseResult = parseFrameDelta(raw, input.snapshot);
      if (!parseResult.ok) {
        lastError = `Failed to parse LLM output: ${parseResult.error}`;
        continue;
      }

      // 5. Apply delta
      let snapshot: SemanticContent;
      try {
        snapshot = applyDelta(baseSnapshot, parseResult.delta);
      } catch (err) {
        lastError = `Failed to apply delta: ${err instanceof Error ? err.message : String(err)}`;
        continue;
      }

      // 6. Validate integrity
      const validation = validateIntegrity(snapshot);
      if (!validation.valid) {
        const errorMessages = validation.errors.map((e) => e.message).join('; ');
        lastError = `Validation failed: ${errorMessages}`;
        continue;
      }

      return { ok: true, delta: parseResult.delta, snapshot, usage: totalUsage, slotQuotes };
    }

    return { ok: false, error: lastError, usage: totalUsage };
  }
}
