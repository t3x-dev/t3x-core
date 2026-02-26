'use client';

import { CheckCircle2, Circle, Loader2, RefreshCw, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  listProviders,
  type ProviderInfo,
  type TestConnectionResult,
  testProvider,
} from '@/lib/api';
import { cn } from '@/lib/utils';

type RoleGroup = 'generation' | 'embedding' | 'extraction' | 'merge';

const ROLE_LABELS: Record<RoleGroup, string> = {
  generation: 'LLM Generation',
  embedding: 'Embedding',
  extraction: 'NLP Extraction',
  merge: 'Merge Resolution',
};

const ROLE_DESCRIPTIONS: Record<RoleGroup, string> = {
  generation: 'Generate leaf output and agent drafts',
  embedding: 'Semantic similarity and validation',
  extraction: 'Ring extraction and NLP analysis',
  merge: 'LLM-assisted conflict resolution',
};

export default function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestConnectionResult | 'loading'>>(
    {}
  );

  const loadProviders = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      setTestResults({});
      const data = await listProviders();
      setProviders(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load providers';
      setLoadError(message);
      console.error('Failed to load providers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleTest = async (providerId: string) => {
    setTestResults((prev) => ({ ...prev, [providerId]: 'loading' }));
    try {
      const result = await testProvider(providerId);
      setTestResults((prev) => ({ ...prev, [providerId]: result }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { ok: false, error: 'Connection test failed' },
      }));
    }
  };

  // Group providers by role
  const grouped = providers.reduce(
    (acc, p) => {
      const role = p.role as RoleGroup;
      if (!acc[role]) acc[role] = [];
      acc[role].push(p);
      return acc;
    },
    {} as Record<RoleGroup, ProviderInfo[]>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <div className="mb-8">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Providers</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Configure LLM, embedding, and NLP providers for T3X features.
        </p>
      </div>

      {loadError && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {loadError}
        </div>
      )}

      <div className="space-y-8">
        {(Object.keys(ROLE_LABELS) as RoleGroup[]).map((role) => {
          const roleProviders = grouped[role] ?? [];
          if (roleProviders.length === 0) return null;

          return (
            <section key={role}>
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  {ROLE_LABELS[role]}
                </h2>
                <p className="text-xs text-[var(--text-tertiary)]">{ROLE_DESCRIPTIONS[role]}</p>
              </div>

              <div className="space-y-2">
                {roleProviders.map((provider) => {
                  const testResult = testResults[provider.id];
                  const isTesting = testResult === 'loading';
                  const result = testResult && testResult !== 'loading' ? testResult : null;

                  return (
                    <div
                      key={provider.id}
                      className={cn(
                        'flex items-center justify-between rounded-lg border px-4 py-3',
                        'border-[var(--stroke-divider)]',
                        provider.configured
                          ? 'bg-[var(--surface-primary)]'
                          : 'bg-[var(--surface-secondary)] opacity-60'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {provider.configured ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                        )}
                        <div>
                          <div className="text-sm font-medium text-[var(--text-primary)]">
                            {provider.name}
                          </div>
                          <div className="text-xs text-[var(--text-tertiary)]">
                            {provider.configured ? (
                              <>
                                {provider.default_model && (
                                  <span>Default: {provider.default_model}</span>
                                )}
                                {result && (
                                  <span className="ml-2">
                                    {result.ok ? (
                                      <span className="text-emerald-500">
                                        Connected ({result.latency_ms}ms)
                                      </span>
                                    ) : (
                                      <span className="text-red-500">{result.error}</span>
                                    )}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span>
                                Requires: {provider.required_env_keys.join(', ') || 'Local server'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {provider.available_models && provider.available_models.length > 0 && (
                          <span className="text-xs text-[var(--text-tertiary)] hidden sm:inline">
                            {provider.available_models.length} models
                          </span>
                        )}
                        {provider.configured && (
                          <button
                            type="button"
                            onClick={() => handleTest(provider.id)}
                            disabled={isTesting}
                            className={cn(
                              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium',
                              'border border-[var(--stroke-divider)]',
                              'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                              'hover:bg-[var(--hover-bg)] transition-colors',
                              'disabled:opacity-50 disabled:cursor-not-allowed'
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
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={loadProviders}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium',
            'border border-[var(--stroke-divider)]',
            'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            'hover:bg-[var(--hover-bg)] transition-colors'
          )}
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>
    </div>
  );
}
