/**
 * Frame Extractor Orchestrator
 *
 * Orchestrates the frame semantic extraction pipeline:
 * buildPrompt → LLM generate → parse delta → apply delta → validate integrity
 *
 * Retries once on parse or validation failure (MAX_RETRIES = 1, 2 attempts total).
 */

import type { LLMProvider } from '../llm/types';
import { applyDelta } from '../semantic/delta';
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
  | { ok: true; delta: Delta; snapshot: SemanticContent }
  | { ok: false; error: string };

// ── Re-export input types ──

export type { FrameExtractionInput, FrameExtractionTurn };

// ── Class ──

export class FrameExtractor {
  constructor(private readonly provider: LLMProvider) {}

  async extract(input: FrameExtractionInput): Promise<FrameExtractionResult> {
    const baseSnapshot: SemanticContent = input.snapshot ?? { frames: [], relations: [] };
    let lastError = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // 1. Build prompt
      const { systemPrompt, userPrompt } = buildFrameExtractionPrompt(input);
      const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

      // 2. Call LLM
      let raw: string;
      try {
        raw = await this.provider.generate(combinedPrompt, {
          temperature: TEMPERATURE,
          maxTokens: MAX_TOKENS,
        });
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

      return { ok: true, delta: parseResult.delta, snapshot };
    }

    return { ok: false, error: lastError };
  }
}
