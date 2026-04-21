/** Compatibility alias: FlatNode-like shape with an id field for relevance scoring */
interface TreeNodeLike {
  id: string;
}

export interface RelevanceContext {
  confirmedNodeIds: Record<string, boolean>;
  llmHighlightedNodeIds: Record<string, boolean>;
  turnsAgoMap: Record<string, number>; // treeId → turns since last touched
  touchCountMap: Record<string, number>; // treeId → number of delta entries that touched it
  relationDegreeMap: Record<string, number>; // treeId → number of relations referencing it
}

export interface RelevanceReason {
  signal: string;
  value: number;
  reason: string;
}

export interface RelevanceResult {
  score: number;
  reasons: RelevanceReason[];
}

const RECENCY_DECAY = 0.7;
const TOUCH_FREQ_CAP = 5;
const RELATION_DEGREE_CAP = 3;

/**
 * Compute relevance score for a tree node with explanations.
 * Returns a value in [0, 1] and an array of reasons explaining why.
 *
 * Signals:
 * - confirmed: 1.0 if user confirmed
 * - llm_boost: 0.8 if LLM flagged as core intent
 * - recency: 1.0 * RECENCY_DECAY^turnsAgo
 * - touch_frequency: min(touchCount/5, 1.0) * 0.7
 * - relation_degree: min(degree/3, 1.0) * 0.6
 *
 * Score = max of all signal values.
 * Tier thresholds: >= 0.6 → highlighted, < 0.6 → faded
 */
export function relevanceScore(node: TreeNodeLike, context: RelevanceContext): RelevanceResult {
  const reasons: RelevanceReason[] = [];

  // Signal 1: User confirmed
  const confirmed = context.confirmedNodeIds[node.id] ? 1.0 : 0;
  if (confirmed > 0) {
    reasons.push({ signal: 'confirmed', value: confirmed, reason: 'You confirmed this' });
  }

  // Signal 2: LLM intent boost
  const llmBoost = context.llmHighlightedNodeIds[node.id] ? 0.8 : 0;
  if (llmBoost > 0) {
    reasons.push({ signal: 'llm_boost', value: llmBoost, reason: 'LLM identified as core intent' });
  }

  // Signal 3: Recency decay
  const turnsAgo = context.turnsAgoMap[node.id];
  const recency = turnsAgo != null ? RECENCY_DECAY ** turnsAgo : 0;
  if (recency > 0) {
    const label =
      turnsAgo === 0
        ? 'Changed this turn'
        : `Changed ${turnsAgo} turn${turnsAgo > 1 ? 's' : ''} ago`;
    reasons.push({ signal: 'recency', value: recency, reason: label });
  }

  // Signal 4: Touch frequency
  const touchCount = context.touchCountMap[node.id] ?? 0;
  const touchFreq = Math.min(touchCount / TOUCH_FREQ_CAP, 1.0) * 0.7;
  if (touchFreq > 0) {
    reasons.push({
      signal: 'touch_frequency',
      value: touchFreq,
      reason: `Discussed ${touchCount} time${touchCount > 1 ? 's' : ''}`,
    });
  }

  // Signal 5: Relation degree (centrality)
  const degree = context.relationDegreeMap[node.id] ?? 0;
  const relationScore = Math.min(degree / RELATION_DEGREE_CAP, 1.0) * 0.6;
  if (relationScore > 0) {
    reasons.push({
      signal: 'relation_degree',
      value: relationScore,
      reason: `Connected to ${degree} other tree${degree > 1 ? 's' : ''}`,
    });
  }

  const score = Math.max(confirmed, llmBoost, recency, touchFreq, relationScore);

  // Sort reasons by value descending — top reason explains the score
  reasons.sort((a, b) => b.value - a.value);

  return { score, reasons };
}

export const RELEVANCE_THRESHOLD = 0.6;
