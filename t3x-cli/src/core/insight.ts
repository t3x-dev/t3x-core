import { hashText } from '@t3x/core';
import { logger } from '../runtime/logger';

export interface FacetExtractionInput {
  project: string;
  turnIds?: number[];
  sinceId?: number;
  limit?: number;
}

export interface FacetRecord {
  key: string;
  value: string;
  confidence: number;
}

export interface EmbeddingHandle {
  target: string;
  model: string;
  vector: number[];
  hash: string;
}

export async function extractFacets(input: FacetExtractionInput): Promise<FacetRecord[]> {
  logger.trace('events', 'extractFacets: stub invoked', input);
  return [];
}

export async function ensureEmbedding(target: string, model: string): Promise<EmbeddingHandle> {
  const hash = hashText(`${target}:${model}`);
  logger.trace('events', `ensureEmbedding stub for ${target}`, { model });
  return {
    target,
    model,
    vector: [],
    hash,
  };
}
