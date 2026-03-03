/**
 * Cross-Conversation Conflict Detection (#9)
 *
 * Detects when new sentences semantically conflict with existing
 * committed sentences across the project.
 *
 * Conflict = high cosine similarity (similar meaning) + low Jaccard (different words).
 * This pattern indicates potential contradictions: two sentences talk about
 * the same topic but say different things.
 */

import { jaccard } from '../diff/jaccard';
import { tokenize } from '../diff/tokenize';
import type { EmbeddingProvider } from '../providers/embedding/base';

export interface ConflictCandidate {
  new_sentence_id: string;
  new_sentence_text: string;
  existing_sentence_id: string;
  existing_sentence_text: string;
  existing_commit_hash: string;
  cosine: number;
  jaccard: number;
}

export interface ConflictReport {
  conflicts: ConflictCandidate[];
  checked_count: number;
}

export interface ExistingSentenceWithEmbedding {
  id: string;
  text: string;
  commit_hash: string;
  embedding: number[];
}

export interface DetectConflictsOptions {
  cosineThreshold?: number;
  jaccardThreshold?: number;
}

const DEFAULT_COSINE_THRESHOLD = 0.80;
const DEFAULT_JACCARD_THRESHOLD = 0.70;

export async function detectConflicts(
  newSentences: { id: string; text: string }[],
  existingSentences: ExistingSentenceWithEmbedding[],
  embedder: EmbeddingProvider,
  options?: DetectConflictsOptions,
): Promise<ConflictReport> {
  const cosineThreshold = options?.cosineThreshold ?? DEFAULT_COSINE_THRESHOLD;
  const jaccardThreshold = options?.jaccardThreshold ?? DEFAULT_JACCARD_THRESHOLD;

  if (newSentences.length === 0 || existingSentences.length === 0) {
    return { conflicts: [], checked_count: newSentences.length };
  }

  // Batch-encode all new sentences
  const newTexts = newSentences.map((s) => s.text);
  const newEmbeddings = await embedder.encode(newTexts);

  const conflicts: ConflictCandidate[] = [];

  for (let i = 0; i < newSentences.length; i++) {
    const newSentence = newSentences[i];
    const newVec = newEmbeddings[i];
    const newTokens = tokenize(newSentence.text);

    for (const existing of existingSentences) {
      const cosine = embedder.similarity(newVec, existing.embedding);
      if (cosine < cosineThreshold) continue;

      const existingTokens = tokenize(existing.text);
      const jaccardScore = jaccard(newTokens, existingTokens);

      // High cosine + low jaccard = conflict
      if (jaccardScore < jaccardThreshold) {
        conflicts.push({
          new_sentence_id: newSentence.id,
          new_sentence_text: newSentence.text,
          existing_sentence_id: existing.id,
          existing_sentence_text: existing.text,
          existing_commit_hash: existing.commit_hash,
          cosine,
          jaccard: jaccardScore,
        });
      }
    }
  }

  return { conflicts, checked_count: newSentences.length };
}
