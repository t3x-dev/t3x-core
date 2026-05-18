'use client';

import { useEffect, useState } from 'react';

const COMPACT_VIEWPORT_QUERY = '(max-width: 767px)';

export function useCompactViewport(query = COMPACT_VIEWPORT_QUERY): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia(query);
    const sync = () => setCompact(mediaQuery.matches);
    sync();

    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, [query]);

  return compact;
}

export function useChatCompactViewport(): boolean {
  return useCompactViewport();
}
