'use client';

/**
 * ProvidersSettingsPanel — 3 cards, one API key each.
 *
 * T3X ships three LLM generation providers: Anthropic, OpenAI, Google.
 * Each card exposes a single API-key field (via `ProviderCredentialDialog`)
 * and a connection-test button. Model selection happens per-call in
 * the chat input, not here.
 *
 * Embedding and fallback-ordering used to live in this panel. They're
 * intentionally gone:
 *   - Embedding providers are auto-derived from the same API key
 *     (OpenAI key → openai-embedding, Google key → google-ai-embedding,
 *     Ollama is a local-only fallback that needs no key).
 *   - Fallback ordering is a role-registry concern, not a per-user
 *     concern; the backend resolves a single provider for each call.
 */

import { CheckCircle2, Circle, Loader2, RefreshCw, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ProviderCredentialDialog } from '@/components/settings/ProviderCredentialDialog';
import { useProviderCommands } from '@/hooks/providers/useProviderCommands';
import { useProvidersSettingsData } from '@/hooks/providers/useProvidersSettingsData';
import {
  type LocalProviderCredentialInput,
  type LocalProviderId,
  type LocalProviderStatus,
  type ProviderInfo,
  type TestConnectionResult,
  toLocalProviderId,
} from '@/infrastructure';
import { cn } from '@/utils/cn';

/** Only these three provider ids are shown in the settings UI. */
const GENERATION_PROVIDER_ORDER: readonly string[] = ['anthropic', 'openai', 'google-ai'];

function displayName(provider: ProviderInfo): string {
  // Strip "AI (Gemini)" style suffixes when possible; Google reads cleaner in the UI.
  const local = toLocalProviderId(provider.id);
  if (local === 'google') return 'Google';
  return provider.name;
}

function ProviderCard({
  provider,
  testResult,
  onTest,
  onManageCredentials,
}: {
  provider: ProviderInfo;
  testResult: TestConnectionResult | 'loading' | undefined;
  onTest: (id: string) => void;
  onManageCredentials: (provider: ProviderInfo) => void;
}) {
  const isTesting = testResult === 'loading';
  const result = testResult && testResult !== 'loading' ? testResult : null;

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-lg border px-4 py-3 border-[var(--stroke-divider)]',
        provider.configured
          ? 'bg-[var(--surface-primary)]'
          : 'bg-[var(--surface-secondary)] opacity-70'
      )}
    >
      <div className="flex items-center gap-3">
        {provider.configured ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <Circle className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
        )}
        <div>
          <div className="text-sm font-medium text-[var(--text-primary)]">
            {displayName(provider)}
          </div>
          <div className="text-xs text-[var(--text-tertiary)]">
            {provider.configured ? (
              <>
                <span>Key configured</span>
                {result && (
                  <span className="ml-2">
                    {result.ok ? (
                      <span className="text-[var(--status-success)]">
                        Connected ({result.latency_ms}ms)
                      </span>
                    ) : (
                      <span className="text-[var(--status-error)]">{result.error}</span>
                    )}
                  </span>
                )}
              </>
            ) : (
              <span>No API key set</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onManageCredentials(provider)}
          className={cn(
            'flex items-center gap-1.5 rounded-md border border-[var(--stroke-divider)] px-2.5 py-1.5 text-xs font-medium',
            'text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
          )}
        >
          {provider.configured ? 'Manage' : 'Connect'}
        </button>
        {provider.configured && (
          <button
            type="button"
            onClick={() => onTest(provider.id)}
            disabled={isTesting}
            className={cn(
              'flex items-center gap-1.5 rounded-md border border-[var(--stroke-divider)] px-2.5 py-1.5 text-xs font-medium',
              'text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            Test
          </button>
        )}
      </div>
    </div>
  );
}

export function ProvidersSettingsPanel() {
  const { removeLocalProviderCredential, runProviderConnectionTest, saveLocalProviderCredential } =
    useProviderCommands();
  const { fetchProviderStatus, fetchProvidersWithRoles } = useProvidersSettingsData();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [dialogProvider, setDialogProvider] = useState<{
    id: LocalProviderId;
    name: string;
    availableModels: string[];
  } | null>(null);
  const [dialogStatus, setDialogStatus] = useState<LocalProviderStatus | null>(null);
  const [dialogStatusLoading, setDialogStatusLoading] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestConnectionResult | 'loading'>>(
    {}
  );

  // We still fetch roles alongside providers because the backend contract is
  // `[providers, roles]` — but we only consume the providers list here and
  // keep only the three generation ids in canonical order.
  const loadProviders = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      setTestResults({});

      const [data] = await fetchProvidersWithRoles();
      const generationOnly = GENERATION_PROVIDER_ORDER.map((id) =>
        data.find((p) => p.id === id && p.role === 'generation')
      ).filter((p): p is ProviderInfo => p !== undefined);
      setProviders(generationOnly);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load providers';
      setLoadError(message);
      console.error('Failed to load providers:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchProvidersWithRoles]);

  const refreshProvidersSilently = useCallback(async () => {
    const [data] = await fetchProvidersWithRoles();
    const generationOnly = GENERATION_PROVIDER_ORDER.map((id) =>
      data.find((p) => p.id === id && p.role === 'generation')
    ).filter((p): p is ProviderInfo => p !== undefined);
    setProviders(generationOnly);
  }, [fetchProvidersWithRoles]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (!dialogProvider) {
      setDialogStatus(null);
      setDialogStatusLoading(false);
      setDialogError(null);
      return;
    }

    let cancelled = false;
    setDialogStatusLoading(true);
    setDialogError(null);

    void fetchProviderStatus(dialogProvider.id)
      .then((status) => {
        if (cancelled) return;
        setDialogStatus(status);
      })
      .catch((err) => {
        if (cancelled) return;
        setDialogError(err instanceof Error ? err.message : 'Failed to load provider status');
      })
      .finally(() => {
        if (!cancelled) {
          setDialogStatusLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dialogProvider, fetchProviderStatus]);

  const handleTest = async (providerId: string) => {
    setTestResults((prev) => ({ ...prev, [providerId]: 'loading' }));
    try {
      const result = await runProviderConnectionTest(providerId);
      setTestResults((prev) => ({ ...prev, [providerId]: result }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { ok: false, error: 'Connection test failed' },
      }));
    }
  };

  const handleManageCredentials = (provider: ProviderInfo) => {
    const localProviderId = toLocalProviderId(provider.id);
    if (!localProviderId) return;

    setDialogStatus(null);
    setDialogError(null);
    setDialogProvider({
      id: localProviderId,
      name: displayName(provider),
      availableModels: provider.available_models ?? [],
    });
  };

  const handleDialogSave = async (input: LocalProviderCredentialInput) => {
    if (!dialogProvider) return;

    setDialogError(null);

    try {
      const status = await saveLocalProviderCredential(dialogProvider.id, input);
      setDialogStatus(status);
      setTestResults((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (toLocalProviderId(key) === dialogProvider.id) delete next[key];
        }
        return next;
      });
      try {
        await refreshProvidersSilently();
      } catch (refreshError) {
        console.error('Failed to refresh providers after credential save:', refreshError);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save provider credentials';
      setDialogError(message);
      throw err;
    }
  };

  const handleDialogDelete = async () => {
    if (!dialogProvider) return;

    setDialogError(null);

    try {
      const status = await removeLocalProviderCredential(dialogProvider.id);
      setDialogStatus(status);
      setTestResults((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (toLocalProviderId(key) === dialogProvider.id) delete next[key];
        }
        return next;
      });
      try {
        await refreshProvidersSilently();
      } catch (refreshError) {
        console.error('Failed to refresh providers after credential removal:', refreshError);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove provider credentials';
      setDialogError(message);
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  return (
    <>
      {loadError && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {loadError}
        </div>
      )}

      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Providers</h2>
          <p className="text-xs text-[var(--text-tertiary)]">
            One API key per provider. Model selection happens in the chat.
          </p>
        </div>

        <div className="space-y-2">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              testResult={testResults[provider.id]}
              onTest={handleTest}
              onManageCredentials={handleManageCredentials}
            />
          ))}
        </div>
      </section>

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={loadProviders}
          className={cn(
            'flex items-center gap-1.5 rounded-md border border-[var(--stroke-divider)] px-3 py-2 text-xs font-medium',
            'text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
          )}
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      {dialogProvider && (
        <ProviderCredentialDialog
          providerId={dialogProvider.id}
          providerName={dialogProvider.name}
          availableModels={dialogProvider.availableModels}
          error={dialogError}
          open={dialogProvider !== null}
          onOpenChange={(open) => {
            if (!open) {
              setDialogProvider(null);
            }
          }}
          onDelete={handleDialogDelete}
          onSave={handleDialogSave}
          status={
            dialogStatus
              ? {
                  configured: dialogStatus.configured,
                  defaultModel: dialogStatus.default_model,
                  lastTestStatus: dialogStatus.last_test_status,
                  lastTestError: dialogStatus.last_test_error,
                }
              : null
          }
          statusLoading={dialogStatusLoading}
        />
      )}
    </>
  );
}
