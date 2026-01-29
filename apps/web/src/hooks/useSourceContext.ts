'use client';

/**
 * useSourceContext - Independent hook for sentence source tracing
 *
 * Fetches conversation context around a sentence's source turn.
 * Can be used by both Diff and Merge pages.
 */

import { useState, useCallback } from 'react';
import type { Sentence, TurnContextData } from '@/types/merge';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const API_V1 = `${API_BASE}/api/v1`;

export function useSourceContext() {
  const [open, setOpen] = useState(false);
  const [sentence, setSentence] = useState<Sentence | null>(null);
  const [data, setData] = useState<TurnContextData | null>(null);
  const [loading, setLoading] = useState(false);

  const openContext = useCallback(async (s: Sentence) => {
    if (!s.source.turn_hash) {
      setSentence(s);
      setOpen(true);
      setLoading(false);
      setData(null);
      return;
    }

    setSentence(s);
    setOpen(true);
    setLoading(true);
    setData(null);

    try {
      const turnHash = encodeURIComponent(s.source.turn_hash);
      const params = new URLSearchParams({ before: '2', after: '2' });

      if (s.source.start_char !== undefined) {
        params.set('highlight_start', String(s.source.start_char));
      }
      if (s.source.end_char !== undefined) {
        params.set('highlight_end', String(s.source.end_char));
      }

      const response = await fetch(`${API_V1}/turns/${turnHash}/context?${params}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to load context');
      }

      setData(json.data as TurnContextData);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const closeContext = useCallback(() => {
    setOpen(false);
    setSentence(null);
    setData(null);
  }, []);

  return { open, sentence, data, loading, openContext, closeContext };
}
