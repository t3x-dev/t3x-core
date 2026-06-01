'use client';

/**
 * ProvidersSettingsPanel — 3 cards, one API key each, with explicit source.
 *
 * Answers the four questions the local-shared-access plan says the team
 * should never have to ask again:
 *
 *   1. "Where's the current config?"          → source chip per card
 *   2. "Where do I change it?"                 → `Manage` button per card
 *   3. "How do I confirm it took effect?"     → `Test` button + source + preview
 *   4. "If .env overrides me, can I tell?"    → amber override banner per card
 *
 * Key lifecycle (create / list / revoke) is intentionally not here — this
 * panel is the usage-path surface, not a key-management console.
 */

import { AlertTriangle, CheckCircle2, Circle, Loader2, RefreshCw, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ProviderCredentialDialog } from '@/components/settings/ProviderCredentialDialog';
import { useProviderCommands } from '@/hooks/providers/useProviderCommands';
import { useProvidersSettingsData } from '@/hooks/providers/useProvidersSettingsData';
import {
  GENERATION_PROVIDER_ORDER,
  type LocalProviderCredentialInput,
  type LocalProviderId,
  type LocalProviderKeySource,
  type LocalProviderStatus,
  type ProviderInfo,
  type TestConnectionResult,
  toLocalProviderId,
} from '@/types/providers';
import { cn } from '@/utils/cn';

const SOURCE_LABEL: Record<LocalProviderKeySource, string> = {
  env: 'from .env',
  file: 'Stored locally',
  none: 'Not configured',
};

const SOURCE_CHIP_CLASS: Record<LocalProviderKeySource, string> = {
  env: 'bg-[var(--accent-pending)]/10 text-[var(--accent-pending)] border-[var(--accent-pending)]/30',
  file: 'bg-[var(--status-success)]/10 text-[var(--status-success)] border-[var(--status-success)]/30',
  none: 'bg-[var(--surface-secondary)] text-[var(--text-tertiary)] border-[var(--stroke-divider)]',
};

function displayName(provider: ProviderInfo): string {
  const local = toLocalProviderId(provider.id);
  if (local === 'google') return 'Google';
  return provider.name;
}

function SourceChip({
  source,
  preview,
}: {
  source: LocalProviderKeySource;
  preview: string | null;
}) {
  const label = SOURCE_LABEL[source];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
        SOURCE_CHIP_CLASS[source]
      )}
      title={source === 'env' ? 'Loaded from an environment variable' : undefined}
    >
      {label}
      {preview && <span className="font-mono opacity-80">· {preview}</span>}
    </span>
  );
}

function ProviderCard({
  provider,
  status,
  testResult,
  onTest,
  onManageCredentials,
}: {
  provider: ProviderInfo;
  status: LocalProviderStatus | null;
  testResult: TestConnectionResult | 'loading' | undefined;
  onTest: (id: string) => void;
  onManageCredentials: (provider: ProviderInfo) => void;
}) {
  const isTesting = testResult === 'loading';
  const result = testResult && testResult !== 'loading' ? testResult : null;
  // Trust status.api_key_source as the single source of truth for "is this
  // provider live". It already folds env + stored into one answer.
  const source: LocalProviderKeySource = status?.api_key_source ?? 'none';
  const configured = source !== 'none';
  const envOverridesStored = status?.env_overrides_stored === true;

  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--stroke-divider)]',
        configured ? 'bg-[var(--surface-primary)]' : 'bg-[var(--surface-secondary)] opacity-80'
      )}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {configured ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--status-success)]" />
          ) : (
            <Circle className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {displayName(provider)}
              </span>
              <SourceChip source={source} preview={status?.api_key_preview ?? null} />
            </div>
            {result && (
              <div className="mt-0.5 text-xs">
                {result.ok ? (
                  <span className="text-[var(--status-success)]">
                    Connected ({result.latency_ms}ms)
                  </span>
                ) : (
                  <span className="text-[var(--status-error)]">{result.error}</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onManageCredentials(provider)}
            className={cn(
              'flex items-center gap-1.5 rounded-md border border-[var(--stroke-divider)] px-2.5 py-1.5 text-xs font-medium',
              'text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
            )}
          >
            {source === 'none' ? 'Connect' : 'Manage'}
          </button>
          {configured && (
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
              {isTesting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Zap className="h-3 w-3" />
              )}
              Test
            </button>
          )}
        </div>
      </div>

      {envOverridesStored && (
        <div
          className={cn(
            'flex items-start gap-2 border-t border-[var(--accent-pending)]/30 px-4 py-2 text-xs',
            'bg-[var(--accent-pending)]/5 text-[var(--accent-pending)]'
          )}
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            An environment variable is overriding your stored key. The Manage dialog still edits the
            stored value, but it won&apos;t take effect until the env var is unset.
          </span>
        </div>
      )}
    </div>
  );
}

export function ProvidersSettingsPanel() {
  const { removeLocalProviderCredential, runProviderConnectionTest, saveLocalProviderCredential } =
    useProviderCommands();
  const { fetchProviderStatus, fetchProvidersWithRoles } = useProvidersSettingsData();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [statuses, setStatuses] = useState<Record<LocalProviderId, LocalProviderStatus | null>>({
    anthropic: null,
    openai: null,
    google: null,
  });
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

  const loadAll = useCallback(async () => {
    const [[data], anthropicStatus, openaiStatus, googleStatus] = await Promise.all([
      fetchProvidersWithRoles(),
      fetchProviderStatus('anthropic').catch(() => null),
      fetchProviderStatus('openai').catch(() => null),
      fetchProviderStatus('google').catch(() => null),
    ]);
    const generationOnly = GENERATION_PROVIDER_ORDER.map((id) =>
      data.find((p) => p.id === id && p.role === 'generation')
    ).filter((p): p is ProviderInfo => p !== undefined);
    return {
      providers: generationOnly,
      statuses: {
        anthropic: anthropicStatus,
        openai: openaiStatus,
        google: googleStatus,
      } as Record<LocalProviderId, LocalProviderStatus | null>,
    };
  }, [fetchProviderStatus, fetchProvidersWithRoles]);

  const loadProviders = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      setTestResults({});

      const { providers: nextProviders, statuses: nextStatuses } = await loadAll();
      setProviders(nextProviders);
      setStatuses(nextStatuses);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load providers';
      setLoadError(message);
      console.error('Failed to load providers:', err);
    } finally {
      setLoading(false);
    }
  }, [loadAll]);

  const refreshProvidersSilently = useCallback(async () => {
    const { providers: nextProviders, statuses: nextStatuses } = await loadAll();
    setProviders(nextProviders);
    setStatuses(nextStatuses);
  }, [loadAll]);

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
            One API key per provider. Resolved as <strong>.env &gt; stored &gt; none</strong>. Model
            selection happens in the chat.
          </p>
        </div>

        <div className="space-y-2">
          {providers.map((provider) => {
            const localId = toLocalProviderId(provider.id);
            const status = localId ? statuses[localId] : null;
            return (
              <ProviderCard
                key={provider.id}
                provider={provider}
                status={status}
                testResult={testResults[provider.id]}
                onTest={handleTest}
                onManageCredentials={handleManageCredentials}
              />
            );
          })}
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
