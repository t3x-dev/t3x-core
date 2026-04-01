/**
 * useSourceTrace — Cached bidirectional YAML ↔ Chat tracing.
 *
 * Wraps hoverTrace.ts with an LRU cache (size 50) that auto-invalidates
 * when the draft changes. Provides stable callbacks for components.
 */

import type { SemanticContent } from '@t3x-dev/core';
import { useCallback, useRef } from 'react';
import { type TraceResult, traceChatToYaml, traceYamlToChat } from '@/lib/hoverTrace';
import { useDraftStore } from '@/store/draftStore';

// ── LRU Cache ──

const LRU_SIZE = 50;

interface CacheEntry<T> {
  key: string;
  value: T;
}

function createLRU<T>(size: number) {
  const entries: CacheEntry<T>[] = [];
  return {
    get(key: string): T | undefined {
      const idx = entries.findIndex((e) => e.key === key);
      if (idx === -1) return undefined;
      const [entry] = entries.splice(idx, 1);
      entries.push(entry);
      return entry.value;
    },
    set(key: string, value: T) {
      const idx = entries.findIndex((e) => e.key === key);
      if (idx !== -1) entries.splice(idx, 1);
      entries.push({ key, value });
      if (entries.length > size) entries.shift();
    },
    clear() {
      entries.length = 0;
    },
  };
}

// ── Hook ──

export function useSourceTrace() {
  const draft = useDraftStore((s) => s.draft);
  const cacheRef = useRef(createLRU<TraceResult | string[]>(LRU_SIZE));
  const lastDraftRef = useRef<SemanticContent | null>(null);

  // Invalidate cache when draft reference changes
  if (lastDraftRef.current !== draft) {
    cacheRef.current.clear();
    lastDraftRef.current = draft;
  }

  const traceToChat = useCallback(
    (nodeId: string, slotKey?: string | null): TraceResult => {
      const key = `y2c:${nodeId}:${slotKey ?? ''}`;
      const cached = cacheRef.current.get(key) as TraceResult | undefined;
      if (cached) return cached;
      const result = traceYamlToChat(draft, nodeId, slotKey ?? null);
      cacheRef.current.set(key, result);
      return result;
    },
    [draft]
  );

  const traceFromChat = useCallback(
    (turnIndex: number): string[] => {
      const key = `c2y:${turnIndex}`;
      const cached = cacheRef.current.get(key) as string[] | undefined;
      if (cached) return cached;
      const result = traceChatToYaml(draft, turnIndex);
      cacheRef.current.set(key, result);
      return result;
    },
    [draft]
  );

  return { traceToChat, traceFromChat };
}
