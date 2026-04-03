/**
 * Relation Extractor
 *
 * Extracts inter-node relations using a dedicated LLM call.
 * Triggered at commit time when nodes are finalized.
 *
 * @see docs/plans/2026-03-05-inter-sentence-relations-design.md
 */

import { nanoid } from 'nanoid';
import type { LLMProvider } from '../llm/types';
import type { NodeRelation, RelationExtractionResult } from '../types';
import { parseRelationResponse } from './relationParser';
import { buildRelationPrompt } from './relationPrompt';

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
        avg_confidence: 0,
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

    const relations: NodeRelation[] = items.map((item) => ({
      id: `rel_${nanoid(12)}`,
      source_id: item.source_id,
      target_id: item.target_id,
      type: item.type,
      confidence: item.confidence,
      reasoning: item.reasoning,
    }));

    const extractionTimeMs = Date.now() - startTime;
    const avgConfidence =
      relations.length > 0
        ? relations.reduce((sum, r) => sum + r.confidence, 0) / relations.length
        : 0;

    return {
      relations,
      stats: {
        total_nodes: nodes.length,
        relations_found: relations.length,
        avg_confidence: avgConfidence,
        extraction_time_ms: extractionTimeMs,
      },
      usage: genResult.usage,
    };
  }
}

export function createRelationExtractor(provider: LLMProvider): RelationExtractor {
  return new RelationExtractor(provider);
}
