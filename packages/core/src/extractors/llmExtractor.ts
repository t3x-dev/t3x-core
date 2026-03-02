/**
 * LLM Extractor
 *
 * Core class that orchestrates LLM-based semantic extraction.
 * Injects an LLMProvider to call generate(), then parses and resolves source refs.
 */

import type { LLMProvider } from '../llm/types';
import type { SentenceSourceRef } from '../types/v4';
import { parseExtractionResponse } from './extractionParser';
import type { LLMExtractionOptions, TurnInput } from './extractionPrompt';
import { buildExtractionPrompt } from './extractionPrompt';
import { resolveSourceRef } from './sourceRefResolver';

export interface ExtractedSentence {
  text: string;
  confidence: number;
  quote: string;
  turn_index: number;
  source_ref?: SentenceSourceRef;
}

export interface LLMExtractionResult {
  sentences: ExtractedSentence[];
  model: string;
  usage?: { input_tokens: number; output_tokens: number };
}

/**
 * LLMExtractor orchestrates the full extraction pipeline:
 * 1. Build prompt from turns
 * 2. Call LLM provider
 * 3. Parse JSON response
 * 4. Resolve source references
 */
export class LLMExtractor {
  constructor(private readonly provider: LLMProvider) {}

  async extract(turns: TurnInput[], options?: LLMExtractionOptions): Promise<LLMExtractionResult> {
    const { systemPrompt, userPrompt } = buildExtractionPrompt(turns, options);

    // Combine system + user into a single prompt for LLMProvider.generate()
    const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

    const raw = await this.provider.generate(combinedPrompt, {
      temperature: options?.temperature ?? 0.1,
      maxTokens: 4096,
    });

    const items = parseExtractionResponse(raw);

    // Resolve source refs
    const sentences: ExtractedSentence[] = items.map((item) => {
      const turn = turns[item.turn_index];
      let sourceRef: SentenceSourceRef | undefined;
      let confidence = item.confidence;

      if (turn) {
        sourceRef = resolveSourceRef(
          item.quote,
          turn.content,
          turn.conversation_id,
          turn.turn_hash
        );

        // Lower confidence if source_ref could not be resolved
        if (!sourceRef) {
          confidence = Math.min(confidence, 0.6);
        }
      }

      return {
        text: item.text,
        confidence,
        quote: item.quote,
        turn_index: item.turn_index,
        source_ref: sourceRef,
      };
    });

    return {
      sentences,
      model: this.provider.id,
    };
  }
}

/**
 * Factory function to create an LLMExtractor.
 */
export function createLLMExtractor(provider: LLMProvider): LLMExtractor {
  return new LLMExtractor(provider);
}
