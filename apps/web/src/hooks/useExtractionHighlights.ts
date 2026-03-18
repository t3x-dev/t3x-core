import type { SemanticContent } from '@t3x-dev/core';
import { useMemo } from 'react';

export interface HighlightSpan {
  frameId: string;
  frameType: string;
}

/**
 * Map frames to turn hashes for highlight overlay.
 * Returns a map: turnHash → list of highlight spans from that turn's frames.
 */
export function useExtractionHighlights(content: SemanticContent) {
  return useMemo(() => {
    const map = new Map<string, HighlightSpan[]>();
    for (const frame of content.frames) {
      if (!frame.source) continue;
      const existing = map.get(frame.source) ?? [];
      existing.push({ frameId: frame.id, frameType: frame.type });
      map.set(frame.source, existing);
    }
    return map;
  }, [content.frames]);
}
