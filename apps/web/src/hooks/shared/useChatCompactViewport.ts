'use client';

import { useEffect, useState } from 'react';

const CHAT_COMPACT_VIEWPORT_QUERY = '(max-width: 767px)';

export function useChatCompactViewport(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia(CHAT_COMPACT_VIEWPORT_QUERY);
    const sync = () => setCompact(mediaQuery.matches);
    sync();

    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, []);

  return compact;
}
