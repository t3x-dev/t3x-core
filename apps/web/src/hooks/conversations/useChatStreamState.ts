'use client';

/**
 * useChatStreamState — owns the transient stream-rendering state
 * (streaming text, thinking, citations, search query) plus the refs
 * for the streaming pipeline (token buffer, RAF id, abort controller)
 * and the stopGenerating trigger.
 *
 * Extracted from useConversationChat (PR23).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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

export function useChatStreamState(): UseChatStreamStateReturn {
  const [streamingContent, setStreamingContent] = useState('');
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [thinkingContent, setThinkingContent] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  const tokenBufferRef = useRef('');
  const rafIdRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cancel any pending RAF on unmount.
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  const stopGenerating = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

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
