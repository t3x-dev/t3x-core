import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthMe } from '@/hooks/shared/useAuthMe';
import { useSession } from '@/hooks/shared/useSession';
import { useChatModelPreferencesStore } from '@/store/chatModelPreferencesStore';
import { resolveAvailableModelSelection, useAvailableModels } from './useAvailableModels';

interface UseChatModelSelectionParams {
  initialProvider?: string | null;
  initialModel?: string | null;
}

export function useChatModelSelection({
  initialProvider = null,
  initialModel = null,
}: UseChatModelSelectionParams) {
  const authDisabled = process.env.NEXT_PUBLIC_AUTH_DISABLED?.toLowerCase() === 'true';
  const { loadAuthMe } = useAuthMe();
  const { getKey } = useSession();
  const {
    providers,
    loading: modelsLoading,
    hasConfiguredGenerationProvider,
    defaultProvider,
    defaultModel,
  } = useAvailableModels();
  const sessionProvider = useChatModelPreferencesStore((s) => s.selectedProvider);
  const sessionModel = useChatModelPreferencesStore((s) => s.selectedModel);
  const setSelection = useChatModelPreferencesStore((s) => s.setSelection);
  const [userDefaultProvider, setUserDefaultProvider] = useState<string | null>(null);
  const [userDefaultModel, setUserDefaultModel] = useState<string | null>(null);
  const [userPreferenceLoading, setUserPreferenceLoading] = useState<boolean>(
    !authDisabled && Boolean(getKey())
  );

  useEffect(() => {
    if (authDisabled) {
      setUserDefaultProvider(null);
      setUserDefaultModel(null);
      setUserPreferenceLoading(false);
      return;
    }

    if (!getKey()) {
      setUserDefaultProvider(null);
      setUserDefaultModel(null);
      setUserPreferenceLoading(false);
      return;
    }

    let cancelled = false;
    setUserPreferenceLoading(true);

    loadAuthMe()
      .then((user) => {
        if (cancelled) return;
        setUserDefaultProvider(user.default_provider ?? null);
        setUserDefaultModel(user.default_model ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setUserDefaultProvider(null);
        setUserDefaultModel(null);
      })
      .finally(() => {
        if (!cancelled) setUserPreferenceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authDisabled, getKey, loadAuthMe]);

  const candidateProvider = initialProvider ?? sessionProvider;
  const candidateModel = initialModel ?? sessionModel;
  const fallbackProvider = userDefaultProvider ?? defaultProvider;
  const fallbackModel = userDefaultModel ?? defaultModel;

  const resolvedSelection = useMemo(() => {
    if (modelsLoading || userPreferenceLoading) {
      return { provider: null, model: null };
    }

    return resolveAvailableModelSelection(
      providers,
      candidateProvider,
      candidateModel,
      fallbackProvider,
      fallbackModel
    );
  }, [
    candidateModel,
    candidateProvider,
    fallbackModel,
    fallbackProvider,
    modelsLoading,
    providers,
    userPreferenceLoading,
  ]);

  useEffect(() => {
    if (modelsLoading || userPreferenceLoading) return;
    if (!resolvedSelection.provider || !resolvedSelection.model) return;
    if (
      sessionProvider === resolvedSelection.provider &&
      sessionModel === resolvedSelection.model
    ) {
      return;
    }

    setSelection(resolvedSelection.provider, resolvedSelection.model);
  }, [
    modelsLoading,
    resolvedSelection.model,
    resolvedSelection.provider,
    sessionModel,
    sessionProvider,
    setSelection,
    userPreferenceLoading,
  ]);

  const handleModelChange = useCallback(
    (provider: string, model: string) => {
      setSelection(provider, model);
    },
    [setSelection]
  );

  return {
    providers,
    loading: modelsLoading || userPreferenceLoading,
    hasConfiguredGenerationProvider,
    defaultProvider: fallbackProvider,
    defaultModel: fallbackModel,
    selectedProvider: resolvedSelection.provider,
    selectedModel: resolvedSelection.model,
    handleModelChange,
    isSelectionReady: Boolean(
      !modelsLoading &&
        !userPreferenceLoading &&
        resolvedSelection.provider &&
        resolvedSelection.model
    ),
  };
}
