'use client';

/**
 * useChatWarnings — error + transient warning strings for the chat
 * pane. `showWarning` auto-clears after 5s via a single managed timer.
 *
 * Extracted from useConversationChat (PR23).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseChatWarningsReturn {
  error: string | null;
  setError: (msg: string | null) => void;
  warning: string | null;
  setWarning: (msg: string | null) => void;
  showWarning: (msg: string) => void;
}

export function useChatWarnings(): UseChatWarningsReturn {
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, []);

  const showWarning = useCallback((msg: string) => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    setWarning(msg);
    warningTimerRef.current = setTimeout(() => setWarning(null), 5000);
  }, []);

  return { error, setError, warning, setWarning, showWarning };
}
