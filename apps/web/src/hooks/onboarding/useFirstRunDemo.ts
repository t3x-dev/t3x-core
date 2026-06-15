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
  autoOpen?: boolean;
  forceOpen?: boolean;
  forceOpenKey?: string | null;
}

export function useFirstRunDemo({
  autoOpen = true,
  forceOpen = false,
  forceOpenKey = null,
}: UseFirstRunDemoOptions = {}) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    setReady(true);
    let hasSeen = false;
    try {
      hasSeen = window.localStorage.getItem(FIRST_RUN_DEMO_SEEN_KEY) === 'true';
    } catch {
      // Storage errors should not block the intro demo.
    }
    setSeen(hasSeen);

    if (forceOpen) {
      setOpen(true);
      return;
    }
    if (!autoOpen) {
      setOpen(false);
      return;
    }
    if (hasSeen) return;
    setOpen(true);
  }, [autoOpen, forceOpen, forceOpenKey]);

  const close = useCallback(() => {
    writeSeenFlag();
    setSeen(true);
    setOpen(false);
  }, []);

  const replay = useCallback(() => {
    setOpen(true);
  }, []);

  return { ready, seen, open, close, replay };
}
