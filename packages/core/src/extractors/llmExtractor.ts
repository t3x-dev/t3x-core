/**
 * LLM Extractor
 *
 * Core class that orchestrates LLM-based semantic extraction.
 * Injects an LLMProvider to call generate(), then parses and resolves source refs.
 */

import { nanoid } from 'nanoid';
import type { LLMProvider } from '../llm/types';
import type {
  ExtractionCursor,
  IncrementalExtractionResult,
  ProjectExtractionConfig,
  SemanticPoint,
  SentenceSourceRef,
} from '../types/v4';
import { parseExtractionResponse } from './extractionParser';
import type { LLMExtractionOptions, TurnInput } from './extractionPrompt';
import { buildExtractionPrompt } from './extractionPrompt';
import { parseIncrementalResponse } from './incrementalParser';
import { buildIncrementalPrompt } from './incrementalPrompt';
import { routeProposal } from './routeProposal';
import { resolveSourceRef } from './sourceRefResolver';
import { verifyProposal } from './verifyProposal';

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
      } else {
        confidence *= 0.5;
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

  async extractIncremental(
    turns: TurnInput[],
    existingSPs: SemanticPoint[],
    cursor: ExtractionCursor,
    options?: {
      config?: ProjectExtractionConfig;
      temperature?: number;
    }
  ): Promise<IncrementalExtractionResult> {
    const reviewZoneItems = existingSPs.filter((sp) => sp.zone === 'review');

    const { systemPrompt, userPrompt } = buildIncrementalPrompt(
      existingSPs,
      turns,
      reviewZoneItems
    );

    const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

    const raw = await this.provider.generate(combinedPrompt, {
      temperature: options?.temperature ?? 0.1,
      maxTokens: 4096,
    });

    const proposals = parseIncrementalResponse(raw);

    // Verify and route each proposal
    const readyPoints: SemanticPoint[] = [];
    const reviewPoints: SemanticPoint[] = [];
    let rejected = 0;
    let position = existingSPs.length;

    for (const proposal of proposals) {
      const verified = verifyProposal(proposal, existingSPs, turns);
      if (!verified) {
        rejected++;
        continue;
      }

      const route = routeProposal(proposal, options?.config);

      const sp: SemanticPoint = {
        id: `sp_${nanoid(12)}`,
        text: verified.text,
        extraction_mode: 'llm_extracted',
        inference_type: verified.inference_type,
        status: verified.type === 'reinforce' ? 'reinforced' : 'auto_landed',
        zone: route.zone,
        routing_reason: route.reason,
        evidence: verified.evidence,
        confidence: verified.confidence,
        position: position++,
        staged: route.zone === 'ready',
      };

      if (route.zone === 'ready') {
        readyPoints.push(sp);
      } else {
        reviewPoints.push(sp);
      }
    }

    // Update cursor
    const newCursor: ExtractionCursor = { cursors: { ...cursor.cursors } };
    const convIds = new Set(turns.map((t) => t.conversation_id));
    for (const convId of convIds) {
      const convTurns = turns.filter((t) => t.conversation_id === convId);
      const lastTurn = convTurns[convTurns.length - 1];
      if (lastTurn) {
        newCursor.cursors[convId] = {
          last_processed_turn: lastTurn.turn_hash,
          processed_at: new Date().toISOString(),
        };
      }
    }

    return {
      readyPoints,
      reviewPoints,
      newCursor,
      stats: {
        total_turns: turns.length,
        new_turns: turns.length,
        proposals: proposals.length,
        auto_landed: readyPoints.length,
        needs_review: reviewPoints.length,
        rejected,
      },
    };
  }
}

/**
 * Factory function to create an LLMExtractor.
 */
export function createLLMExtractor(provider: LLMProvider): LLMExtractor {
  return new LLMExtractor(provider);
}
