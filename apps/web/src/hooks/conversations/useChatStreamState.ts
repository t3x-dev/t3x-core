'use client';

/**
 * useChatStreamState — owns the transient stream-rendering state
 * (streaming text, thinking, citations, search query) plus the refs
 * for the streaming pipeline (token buffer, RAF id, abort controller)
 * and the stopGenerating trigger.
 *
 * Extracted from useConversationChat (PR23).
 */

import { useCallback, useEffect } from 'react';
import {
  type SourceThreadSession,
  useSourceThreadSessionRef,
  useSourceThreadSessionState,
} from '@/hooks/sourceThreads/sourceThreadSession';
import type { Citation } from '@/infrastructure/chat';

export interface UseChatStreamStateReturn {
  streamingContent: string;
  setStreamingContent: (v: string) => void;
  isChatStreaming: boolean;
  setIsChatStreaming: (v: boolean) => void;
  citations: Citation[];
  setCitations: (c: Citation[]) => void;
  searchQuery: string | null;
  setSearchQuery: (q: string | null) => void;
  thinkingContent: string;
  setThinkingContent: React.Dispatch<React.SetStateAction<string>>;
  isThinking: boolean;
  setIsThinking: (v: boolean) => void;
  tokenBufferRef: React.MutableRefObject<string>;
  rafIdRef: React.MutableRefObject<number | null>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  stopGenerating: () => void;
}

export function useChatStreamState(session?: SourceThreadSession): UseChatStreamStateReturn {
  const [streamingContent, setStreamingContent] = useSourceThreadSessionState(
    session,
    'stream.content',
    ''
  );
  const [isChatStreaming, setIsChatStreaming] = useSourceThreadSessionState(
    session,
    'stream.running',
    false
  );
  const [citations, setCitations] = useSourceThreadSessionState<Citation[]>(
    session,
    'stream.citations',
    []
  );
  const [searchQuery, setSearchQuery] = useSourceThreadSessionState<string | null>(
    session,
    'stream.search',
    null
  );
  const [thinkingContent, setThinkingContent] = useSourceThreadSessionState(
    session,
    'stream.thinkingContent',
    ''
  );
  const [isThinking, setIsThinking] = useSourceThreadSessionState(
    session,
    'stream.thinking',
    false
  );

  const tokenBufferRef = useSourceThreadSessionRef(session, 'stream.buffer', '');
  const rafIdRef = useSourceThreadSessionRef<number | null>(session, 'stream.raf', null);
  const abortControllerRef = useSourceThreadSessionRef<AbortController | null>(
    session,
    'stream.controller',
    null
  );

  // Cancel any pending RAF on unmount.
  useEffect(() => {
    return () => {
      if (!session && rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [session, rafIdRef]);

  const stopGenerating = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, [abortControllerRef]);

  return {
    streamingContent,
    setStreamingContent,
    isChatStreaming,
    setIsChatStreaming,
    citations,
    setCitations,
    searchQuery,
    setSearchQuery,
    thinkingContent,
    setThinkingContent,
    isThinking,
    setIsThinking,
    tokenBufferRef,
    rafIdRef,
    abortControllerRef,
    stopGenerating,
  };
}
