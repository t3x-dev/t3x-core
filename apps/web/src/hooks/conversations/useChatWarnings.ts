'use client';

/**
 * useChatWarnings — error + transient warning strings for the chat
 * pane. `showWarning` auto-clears after 5s via a single managed timer.
 *
 * Extracted from useConversationChat (PR23).
 */

import { useCallback, useEffect } from 'react';
import {
  type SourceThreadSession,
  useSourceThreadSessionRef,
  useSourceThreadSessionState,
} from '@/hooks/sourceThreads/sourceThreadSession';

export interface UseChatWarningsReturn {
  error: string | null;
  setError: (msg: string | null) => void;
  warning: string | null;
  setWarning: (msg: string | null) => void;
  showWarning: (msg: string) => void;
}

export function useChatWarnings(session?: SourceThreadSession): UseChatWarningsReturn {
  const [error, setError] = useSourceThreadSessionState<string | null>(
    session,
    'warnings.error',
    null
  );
  const [warning, setWarning] = useSourceThreadSessionState<string | null>(
    session,
    'warnings.warning',
    null
  );
  const warningTimerRef = useSourceThreadSessionRef<ReturnType<typeof setTimeout> | null>(
    session,
    'warnings.timer',
    null
  );

  useEffect(() => {
    return () => {
      if (!session && warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [session, warningTimerRef]);

  const showWarning = useCallback(
    (msg: string) => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      setWarning(msg);
      warningTimerRef.current = setTimeout(() => setWarning(null), 5000);
    },
    [setWarning, warningTimerRef]
  );

  return { error, setError, warning, setWarning, showWarning };
}
