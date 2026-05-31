'use client';

import { useEffect, useState } from 'react';

export function useIntroDemoQueryFlag() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    setEnabled(new URLSearchParams(window.location.search).get('introDemo') === '1');
  }, []);

  return enabled;
}
