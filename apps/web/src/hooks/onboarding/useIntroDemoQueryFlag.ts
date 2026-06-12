'use client';

import { useEffect, useState } from 'react';
import { isIntroDemoQueryEnabled } from '@/utils/introDemo';

export function useIntroDemoQueryFlag() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return isIntroDemoQueryEnabled(new URLSearchParams(window.location.search));
  });

  useEffect(() => {
    setEnabled(isIntroDemoQueryEnabled(new URLSearchParams(window.location.search)));
  }, []);

  return enabled;
}
