import type { YOp } from '@t3x-dev/core';

export type SourceTag = 'user' | 'llm' | 'both';

/**
 * deriveSourceTags — Maps node keys to source role tags.
 *
 * NOTE: The `from` provenance field has been removed from SetOp/PopulateOp
 * in the generic YOps types. Source attribution is now handled at a higher
 * layer. This function returns an empty record until provenance tracking
 * is re-implemented.
 */
export function deriveSourceTags(
  _delta: YOp[],
  _messages: Array<{ role: string }>
): Record<string, SourceTag> {
  return {};
}
