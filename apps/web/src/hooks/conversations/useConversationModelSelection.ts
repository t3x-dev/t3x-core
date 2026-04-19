import { useCallback, useEffect, useRef, useState } from 'react';
import { updateConversation } from '@/commands/conversations/updateConversation';
import { fetchConversationMeta } from '@/queries/chatInitFetch';

interface UseConversationModelSelectionOptions {
  conversationId?: string;
  initialProvider?: string;
  initialModel?: string;
}

export interface UseConversationModelSelectionResult {
  selectedProvider: string | null;
  selectedModel: string | null;
  setSelectedProvider: (provider: string | null) => void;
  setSelectedModel: (model: string | null) => void;
  handleModelChange: (provider: string, model: string) => void;
}

const CONVERSATION_MODEL_SELECTION_KEY_PREFIX = 't3x:conversation-model-selection:';

function shouldPersistConversationSelection(conversationId?: string): conversationId is string {
  return Boolean(conversationId && conversationId !== 'new');
}

function getConversationSelectionStorageKey(conversationId: string): string {
  return `${CONVERSATION_MODEL_SELECTION_KEY_PREFIX}${conversationId}`;
}

function readCachedConversationSelection(conversationId?: string): {
  provider: string | null;
  model: string | null;
} | null {
  if (!shouldPersistConversationSelection(conversationId) || typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage?.getItem(getConversationSelectionStorageKey(conversationId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as { provider?: string | null; model?: string | null };
    return {
      provider: parsed.provider ?? null,
      model: parsed.model ?? null,
    };
  } catch {
    return null;
  }
}

function writeCachedConversationSelection(
  conversationId: string,
  provider: string | null,
  model: string | null
) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage?.setItem(
      getConversationSelectionStorageKey(conversationId),
      JSON.stringify({ provider, model })
    );
  } catch {
    // Ignore storage failures and rely on server-side conversation metadata.
  }
}

export function useConversationModelSelection({
  conversationId,
  initialProvider,
  initialModel,
}: UseConversationModelSelectionOptions): UseConversationModelSelectionResult {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(initialProvider ?? null);
  const [selectedModel, setSelectedModel] = useState<string | null>(initialModel ?? null);
  const previousConversationIdRef = useRef<string | undefined>(conversationId);

  const persistSelection = useCallback(
    async (nextConversationId: string, provider: string | null, model: string | null) => {
      writeCachedConversationSelection(nextConversationId, provider, model);
      await updateConversation(nextConversationId, {
        provider,
        model,
      });
    },
    []
  );

  const handleModelChange = useCallback(
    (provider: string, model: string) => {
      setSelectedProvider(provider);
      setSelectedModel(model);

      if (shouldPersistConversationSelection(conversationId)) {
        void persistSelection(conversationId, provider, model);
      }
    },
    [conversationId, persistSelection]
  );

  useEffect(() => {
    if (!shouldPersistConversationSelection(conversationId)) {
      previousConversationIdRef.current = conversationId;
      return;
    }

    const cachedConversationSelection = readCachedConversationSelection(conversationId);
    if (cachedConversationSelection) {
      setSelectedProvider(cachedConversationSelection.provider);
      setSelectedModel(cachedConversationSelection.model);
    } else {
      setSelectedProvider(initialProvider ?? null);
      setSelectedModel(initialModel ?? null);
    }

    let cancelled = false;
    const previousConversationId = previousConversationIdRef.current;
    previousConversationIdRef.current = conversationId;

    void fetchConversationMeta(conversationId).then((conversation) => {
      if (cancelled || !conversation) {
        return;
      }

      const savedProvider = conversation.provider ?? null;
      const savedModel = conversation.model ?? null;

      if (savedProvider || savedModel) {
        setSelectedProvider(savedProvider);
        setSelectedModel(savedModel);
        writeCachedConversationSelection(conversationId, savedProvider, savedModel);
        return;
      }

      const isNewlyCreatedConversation =
        !previousConversationId ||
        previousConversationId === 'new' ||
        previousConversationId !== conversationId;

      if (isNewlyCreatedConversation && selectedProvider && selectedModel) {
        void persistSelection(conversationId, selectedProvider, selectedModel);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    conversationId,
    initialModel,
    initialProvider,
    persistSelection,
    selectedModel,
    selectedProvider,
  ]);

  return {
    selectedProvider,
    selectedModel,
    setSelectedProvider,
    setSelectedModel,
    handleModelChange,
  };
}
