import type { Frame } from '@t3x-dev/core';

export interface RelevanceContext {
  confirmedFrameIds: Record<string, boolean>;
  llmHighlightedFrameIds: Record<string, boolean>;
  turnsAgoMap: Record<string, number>;
}

const RECENCY_DECAY = 0.7;

export function relevanceScore(frame: Frame, context: RelevanceContext): number {
  const confirmed = context.confirmedFrameIds[frame.id] ? 1.0 : 0;
  const llmBoost = context.llmHighlightedFrameIds[frame.id] ? 0.8 : 0;
  const turnsAgo = context.turnsAgoMap[frame.id];
  const recency = turnsAgo != null ? RECENCY_DECAY ** turnsAgo : 0;

  return Math.max(confirmed, llmBoost, recency);
}

export const RELEVANCE_THRESHOLD = 0.6;
