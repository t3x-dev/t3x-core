/**
 * usePinEnrichment — resolves display metadata (title + assertion lessons)
 * for a list of pins by hitting the per-resource API endpoints.
 *
 * Extracted out of ChatWorkspace so the component stops hand-rolling fetch
 * logic with a dynamic `@/lib/api/core` import.
 */

import { useEffect, useState } from 'react';
import { API_V1, fetchWithTimeout, handleResponse } from '@/infrastructure/core';

interface PinRef {
  id: string;
  type: string;
  ref_id: string;
}

export interface EnrichedPin {
  title: string;
  assertionLessons?: string[];
  turnCount?: number;
}

export function usePinEnrichment(
  pins: readonly PinRef[],
  enabled: boolean
): Map<string, EnrichedPin> {
  const [data, setData] = useState<Map<string, EnrichedPin>>(new Map());

  useEffect(() => {
    if (!enabled || pins.length === 0) {
      setData(new Map());
      return;
    }
    let stale = false;
    (async () => {
      const next = new Map<string, EnrichedPin>();
      for (const pin of pins) {
        try {
          if (pin.type === 'conversation') {
            const res = await fetchWithTimeout(`${API_V1}/conversations/${pin.ref_id}`);
            const conv = await handleResponse<{ title?: string }>(res);
            if (!stale) next.set(pin.id, { title: conv.title || pin.ref_id.slice(0, 12) });
          } else if (pin.type === 'leaf') {
            const res = await fetchWithTimeout(`${API_V1}/leaves/${pin.ref_id}`);
            const leaf = await handleResponse<{
              title?: string;
              assertions?: Array<{ lesson?: string }>;
              runner_assertions?: Array<{ lesson?: string }>;
            }>(res);
            if (stale) continue;
            const allAssertions = leaf.runner_assertions ?? leaf.assertions ?? [];
            const lessons = allAssertions
              .filter((a) => a.lesson)
              .map((a) => a.lesson as string);
            next.set(pin.id, {
              title: leaf.title || pin.ref_id.slice(0, 12),
              assertionLessons: lessons.length > 0 ? lessons : undefined,
            });
          }
        } catch {
          if (!stale) next.set(pin.id, { title: pin.ref_id.slice(0, 12) });
        }
      }
      if (!stale) setData(next);
    })();
    return () => {
      stale = true;
    };
  }, [pins, enabled]);

  return data;
}
