/**
 * Centroid clustering for grouping sentences by embedding similarity.
 *
 * All functions are pure — no DB, no IO, no side effects.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SentenceInput {
  id: string;
  text: string;
  embedding: number[];
  commit_hash: string;
}

export interface ClusterResult {
  /** Top 3 terms from member texts, joined by " / " */
  label: string;
  type: 'topic';
  members: Array<{ sentence_id: string; commit_hash: string }>;
  /** Average embedding of members */
  centroid: number[];
}

export interface ClusterOptions {
  /** Minimum cosine similarity to join an existing cluster (default 0.75) */
  similarity_threshold?: number;
}

// ---------------------------------------------------------------------------
// Stop words
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'need',
  'must',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'out',
  'off',
  'over',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'because',
  'but',
  'and',
  'or',
  'if',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'his',
  'she',
  'her',
  'they',
  'their',
  'what',
  'which',
  'who',
  'whom',
]);

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

/**
 * Cosine similarity between two vectors.
 * Returns 0 when either vector has zero magnitude.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}

// ---------------------------------------------------------------------------
// Top-term extraction
// ---------------------------------------------------------------------------

/**
 * Extract the top N most frequent non-stop-word terms from an array of texts.
 * Returns terms joined by " / ", or "unnamed" when nothing remains.
 */
export function extractTopTerms(texts: string[], n = 3): string {
  const freq = new Map<string, number>();

  for (const text of texts) {
    const words = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .split(/\s+/)
      .filter((w) => w.length > 0 && !STOP_WORDS.has(w));

    for (const w of words) {
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }

  if (freq.size === 0) return 'unnamed';

  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  return sorted
    .slice(0, n)
    .map(([word]) => word)
    .join(' / ');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface InternalCluster {
  members: Array<{ sentence_id: string; commit_hash: string; text: string }>;
  centroid: number[];
}

function addToCentroid(centroid: number[], embedding: number[], prevCount: number): number[] {
  const newCount = prevCount + 1;
  return centroid.map((c, i) => (c * prevCount + embedding[i]) / newCount);
}

// ---------------------------------------------------------------------------
// Main clustering function
// ---------------------------------------------------------------------------

/**
 * Greedy centroid clustering: each sentence is assigned to the most similar
 * existing cluster (if similarity >= threshold), otherwise a new cluster is
 * created.
 */
export function clusterSentences(
  sentences: SentenceInput[],
  options?: ClusterOptions
): ClusterResult[] {
  if (sentences.length === 0) return [];

  const threshold = options?.similarity_threshold ?? 0.75;
  const clusters: InternalCluster[] = [];

  for (const s of sentences) {
    let bestIdx = -1;
    let bestSim = -Infinity;

    for (let i = 0; i < clusters.length; i++) {
      const sim = cosineSimilarity(s.embedding, clusters[i].centroid);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && bestSim >= threshold) {
      const cluster = clusters[bestIdx];
      cluster.centroid = addToCentroid(cluster.centroid, s.embedding, cluster.members.length);
      cluster.members.push({
        sentence_id: s.id,
        commit_hash: s.commit_hash,
        text: s.text,
      });
    } else {
      clusters.push({
        centroid: [...s.embedding],
        members: [
          {
            sentence_id: s.id,
            commit_hash: s.commit_hash,
            text: s.text,
          },
        ],
      });
    }
  }

  return clusters.map((c) => ({
    label: extractTopTerms(c.members.map((m) => m.text)),
    type: 'topic' as const,
    members: c.members.map(({ sentence_id, commit_hash }) => ({
      sentence_id,
      commit_hash,
    })),
    centroid: c.centroid,
  }));
}
