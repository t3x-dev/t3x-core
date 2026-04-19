import { useCallback, useEffect, useMemo } from 'react';
import { useChatModelPreferencesStore } from '@/store/chatModelPreferencesStore';
import {
  resolveAvailableModelSelection,
  useAvailableModels,
} from './useAvailableModels';

interface UseChatModelSelectionParams {
  initialProvider?: string | null;
  initialModel?: string | null;
}

export function useChatModelSelection({
  initialProvider = null,
  initialModel = null,
}: UseChatModelSelectionParams) {
  const {
    providers,
    loading: modelsLoading,
    hasConfiguredGenerationProvider,
    defaultProvider,
    defaultModel,
  } = useAvailableModels();
  const persistedProvider = useChatModelPreferencesStore((s) => s.selectedProvider);
  const persistedModel = useChatModelPreferencesStore((s) => s.selectedModel);
  const preferencesHydrated = useChatModelPreferencesStore((s) => s.hydrated);
  const setSelection = useChatModelPreferencesStore((s) => s.setSelection);

  const candidateProvider = initialProvider ?? persistedProvider;
  const candidateModel = initialModel ?? persistedModel;

  const resolvedSelection = useMemo(() => {
    if (!preferencesHydrated || modelsLoading) {
      return { provider: null, model: null };
    }

    return resolveAvailableModelSelection(
      providers,
      candidateProvider,
      candidateModel,
      defaultProvider,
      defaultModel
    );
  }, [
    candidateModel,
    candidateProvider,
    defaultModel,
    defaultProvider,
    modelsLoading,
    preferencesHydrated,
    providers,
  ]);

  useEffect(() => {
    if (!preferencesHydrated || modelsLoading) return;
    if (!resolvedSelection.provider || !resolvedSelection.model) return;
    if (
      persistedProvider === resolvedSelection.provider &&
      persistedModel === resolvedSelection.model
    ) {
      return;
    }

    setSelection(resolvedSelection.provider, resolvedSelection.model);
  }, [
    modelsLoading,
    persistedModel,
    persistedProvider,
    preferencesHydrated,
    resolvedSelection.model,
    resolvedSelection.provider,
    setSelection,
  ]);

  const handleModelChange = useCallback(
    (provider: string, model: string) => {
      setSelection(provider, model);
    },
    [setSelection]
  );

  return {
    providers,
    loading: modelsLoading || !preferencesHydrated,
    hasConfiguredGenerationProvider,
    defaultProvider,
    defaultModel,
    selectedProvider: resolvedSelection.provider,
    selectedModel: resolvedSelection.model,
    handleModelChange,
    isSelectionReady: Boolean(
      preferencesHydrated &&
        !modelsLoading &&
        resolvedSelection.provider &&
        resolvedSelection.model
    ),
  };
}
