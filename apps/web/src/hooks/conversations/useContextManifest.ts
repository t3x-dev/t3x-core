/**
 * useContextManifest — async loader for a conversation's structured
 * context manifest.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchContextManifest } from '@/queries/contextManifest';
import type { ConversationContextManifest } from '@/types/api';

export interface UseContextManifestResult {
  manifest: ConversationContextManifest | null;
  loading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Failed to load context manifest');
}

export function useContextManifest(
  conversationId: string | null | undefined
): UseContextManifestResult {
  const [manifest, setManifest] = useState<ConversationContextManifest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const currentConversationIdRef = useRef(conversationId);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  currentConversationIdRef.current = conversationId;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const isCurrentRequest = useCallback(
    (requestId: number, requestConversationId: string) =>
      mountedRef.current &&
      requestIdRef.current === requestId &&
      currentConversationIdRef.current === requestConversationId,
    []
  );

  useEffect(() => {
    if (!conversationId) {
      requestIdRef.current += 1;
      setManifest(null);
      setLoading(false);
      setError(null);
      return;
    }

    const requestConversationId = conversationId;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setManifest(null);
    setLoading(true);
    setError(null);

    fetchContextManifest(requestConversationId)
      .then((nextManifest) => {
        if (isCurrentRequest(requestId, requestConversationId)) setManifest(nextManifest);
      })
      .catch((cause) => {
        if (isCurrentRequest(requestId, requestConversationId)) {
          setManifest(null);
          setError(toError(cause));
        }
      })
      .finally(() => {
        if (isCurrentRequest(requestId, requestConversationId)) setLoading(false);
      });
  }, [conversationId, isCurrentRequest]);

  const reload = useCallback(async () => {
    if (!conversationId) {
      requestIdRef.current += 1;
      setManifest(null);
      setLoading(false);
      setError(null);
      return;
    }

    const requestConversationId = conversationId;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const nextManifest = await fetchContextManifest(requestConversationId);
      if (isCurrentRequest(requestId, requestConversationId)) setManifest(nextManifest);
    } catch (cause) {
      if (isCurrentRequest(requestId, requestConversationId)) {
        setManifest(null);
        setError(toError(cause));
      }
    } finally {
      if (isCurrentRequest(requestId, requestConversationId)) setLoading(false);
    }
  }, [conversationId, isCurrentRequest]);

  return { manifest, loading, error, reload };
}
