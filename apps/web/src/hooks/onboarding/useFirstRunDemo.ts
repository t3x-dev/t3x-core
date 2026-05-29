import { useCallback, useEffect, useState } from 'react';

export const FIRST_RUN_DEMO_SEEN_KEY = 't3x:first-run-demo-seen:v1';

function writeSeenFlag() {
  try {
    window.localStorage.setItem(FIRST_RUN_DEMO_SEEN_KEY, 'true');
  } catch {
    // If storage is unavailable, closing the overlay for this session is still enough.
  }
}

interface UseFirstRunDemoOptions {
  forceOpen?: boolean;
  forceOpenKey?: string | null;
}

export function useFirstRunDemo({
  forceOpen = false,
  forceOpenKey = null,
}: UseFirstRunDemoOptions = {}) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    if (forceOpen) {
      setOpen(true);
      return;
    }
    try {
      if (window.localStorage.getItem(FIRST_RUN_DEMO_SEEN_KEY) === 'true') {
        return;
      }
    } catch {
      // Storage errors should not block the intro demo.
    }
    setOpen(true);
  }, [forceOpen, forceOpenKey]);

  const close = useCallback(() => {
    writeSeenFlag();
    setOpen(false);
  }, []);

  const replay = useCallback(() => {
    setOpen(true);
  }, []);

  return { ready, open, close, replay };
}
