/**
 * Relation Extractor
 *
 * Extracts inter-node relations using a dedicated LLM call.
 * Triggered at commit time when nodes are finalized.
 *
 * @see docs/plans/2026-03-05-inter-sentence-relations-design.md
 */

import type { LLMProvider } from '../llm/types';
import type { Relation } from '../semantic/types';
import { parseRelationResponse } from './relationParser';
import { buildRelationPrompt } from './relationPrompt';

export interface RelationExtractionResult {
  relations: Relation[];
  stats: {
    total_nodes: number;
    relations_found: number;
    extraction_time_ms: number;
  };
  usage: { inputTokens: number; outputTokens: number };
}

export class RelationExtractor {
  constructor(private readonly provider: LLMProvider) {}

  async extract(
    nodes: Array<{ id: string; text: string }>,
    options?: { temperature?: number }
  ): Promise<RelationExtractionResult> {
    const emptyResult: RelationExtractionResult = {
      relations: [],
      stats: {
        total_nodes: nodes.length,
        relations_found: 0,
        extraction_time_ms: 0,
      },
      usage: { inputTokens: 0, outputTokens: 0 },
    };

    if (nodes.length < 2) return emptyResult;

    const { systemPrompt, userPrompt } = buildRelationPrompt(nodes);
    const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

    const startTime = Date.now();
    const genResult = await this.provider.generate(combinedPrompt, {
      temperature: options?.temperature ?? 0.1,
      maxTokens: 4096,
    });

    const validIds = new Set(nodes.map((s) => s.id));
    const items = parseRelationResponse(genResult.text, validIds);

    const relations: Relation[] = items.map((item) => ({
      from: item.source_id,
      to: item.target_id,
      type: item.type,
    }));

    const extractionTimeMs = Date.now() - startTime;

    return {
      relations,
      stats: {
        total_nodes: nodes.length,
        relations_found: relations.length,
        extraction_time_ms: extractionTimeMs,
      },
      usage: genResult.usage,
    };
  }
}

export function createRelationExtractor(provider: LLMProvider): RelationExtractor {
  return new RelationExtractor(provider);
}
