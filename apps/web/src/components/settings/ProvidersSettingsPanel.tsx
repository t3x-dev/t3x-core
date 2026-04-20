'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckCircle2, Circle, GripVertical, Loader2, RefreshCw, Zap } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ProviderCredentialDialog } from '@/components/settings/ProviderCredentialDialog';
import { useProviderCommands } from '@/hooks/providers/useProviderCommands';
import {
  type LocalProviderCredentialInput,
  type LocalProviderId,
  type LocalProviderStatus,
  type ProviderInfo,
  type RoleAssignment,
  type TestConnectionResult,
  toLocalProviderId,
} from '@/infrastructure';
import { fetchLocalProviderStatus } from '@/queries/providerStatus';
import { fetchProviderRoles, fetchProviders as fetchProvidersQuery } from '@/queries/providers';
import { cn } from '@/utils/cn';

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

function SortableProviderCard({
  provider,
  testResult,
  onTest,
  onManageCredentials,
  isDraggable,
}: {
  provider: ProviderInfo;
  testResult: TestConnectionResult | 'loading' | undefined;
  onTest: (id: string) => void;
  onManageCredentials: (provider: ProviderInfo) => void;
  isDraggable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: provider.id,
    disabled: !isDraggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isTesting = testResult === 'loading';
  const result = testResult && testResult !== 'loading' ? testResult : null;
  const localProviderId = getLocalGenerationProviderId(provider);
  const displayName = getSettingsProviderName(provider);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center justify-between rounded-lg border px-4 py-3',
        'border-[var(--stroke-divider)]',
        provider.configured
          ? 'bg-[var(--surface-primary)]'
          : 'bg-[var(--surface-secondary)] opacity-60',
        isDragging && 'opacity-50 shadow-lg ring-2 ring-[var(--accent-blue)]'
      )}
    >
      <div className="flex items-center gap-3">
        {isDraggable ? (
          <button
            type="button"
            className="cursor-grab touch-none text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : (
          <div className="w-4" />
        )}
        {provider.configured ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <Circle className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
        )}
        <div>
          <div className="text-sm font-medium text-[var(--text-primary)]">{displayName}</div>
          <div className="text-xs text-[var(--text-tertiary)]">
            {provider.configured ? (
              <>
                {provider.default_model && <span>Default: {provider.default_model}</span>}
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
              <span>Requires: {provider.required_env_keys.join(', ') || 'Local server'}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {provider.available_models && provider.available_models.length > 0 && (
          <span className="hidden text-xs text-[var(--text-tertiary)] sm:inline">
            {provider.available_models.length} models
          </span>
        )}
        {localProviderId && (
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
        )}
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

function SortableRoleGroup({
  role,
  providers,
  testResults,
  onTest,
  onManageCredentials,
  onReorder,
}: {
  role: RoleGroup;
  providers: ProviderInfo[];
  testResults: Record<string, TestConnectionResult | 'loading'>;
  onTest: (id: string) => void;
  onManageCredentials: (provider: ProviderInfo) => void;
  onReorder: (role: RoleGroup, oldIndex: number, newIndex: number) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const configured = providers.filter((p) => p.configured);
  const unconfigured = providers.filter((p) => !p.configured);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = configured.findIndex((p) => p.id === active.id);
    const newIndex = configured.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(role, oldIndex, newIndex);
  };

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{ROLE_LABELS[role]}</h2>
        <p className="text-xs text-[var(--text-tertiary)]">{ROLE_DESCRIPTIONS[role]}</p>
        {configured.length > 1 && (
          <p className="mt-1 text-xs italic text-[var(--text-tertiary)]">
            Fallback order: drag to reorder priority
          </p>
        )}
      </div>

      <div className="space-y-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={configured.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            {configured.map((provider) => (
              <SortableProviderCard
                key={provider.id}
                provider={provider}
                testResult={testResults[provider.id]}
                onTest={onTest}
                onManageCredentials={onManageCredentials}
                isDraggable={configured.length > 1}
              />
            ))}
          </SortableContext>
        </DndContext>

        {unconfigured.map((provider) => (
          <SortableProviderCard
            key={provider.id}
            provider={provider}
            testResult={testResults[provider.id]}
            onTest={onTest}
            onManageCredentials={onManageCredentials}
            isDraggable={false}
          />
        ))}
      </div>
    </section>
  );
}

export function ProvidersSettingsPanel() {
  const {
    removeLocalProviderCredential,
    runProviderConnectionTest,
    saveLocalProviderCredential,
    saveProviderRoles,
  } = useProviderCommands();
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
  const [saving, setSaving] = useState(false);

  const fetchProviders = useCallback(async (): Promise<ProviderInfo[]> => {
    const [data, roles] = await Promise.all([fetchProvidersQuery(), fetchProviderRoles()]);
    return reorderByRoles(data, roles);
  }, []);

  const loadProviders = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      setTestResults({});

      const reordered = await fetchProviders();
      setProviders(reordered);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load providers';
      setLoadError(message);
      console.error('Failed to load providers:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchProviders]);

  const refreshProvidersSilently = useCallback(async () => {
    const reordered = await fetchProviders();
    setProviders(reordered);
  }, [fetchProviders]);

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

    void fetchLocalProviderStatus(dialogProvider.id)
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
  }, [dialogProvider]);

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
    const localProviderId = getLocalGenerationProviderId(provider);
    if (!localProviderId) return;

    setDialogStatus(null);
    setDialogError(null);
    setDialogProvider({
      id: localProviderId,
      name: getSettingsProviderName(provider),
      availableModels: provider.available_models ?? [],
    });
  };

  const handleDialogSave = async (input: LocalProviderCredentialInput) => {
    if (!dialogProvider) return;

    setDialogError(null);

    try {
      const status = await saveLocalProviderCredential(dialogProvider.id, input);
      setDialogStatus(status);
      clearTestResultsForLocalProvider(dialogProvider.id, setTestResults);
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
      clearTestResultsForLocalProvider(dialogProvider.id, setTestResults);
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

  const handleReorder = async (role: RoleGroup, oldIndex: number, newIndex: number) => {
    const roleProviders = providers.filter((p) => p.role === role && p.configured);
    const reordered = arrayMove(roleProviders, oldIndex, newIndex);

    setProviders((prev) => {
      const others = prev.filter((p) => p.role !== role || !p.configured);
      const unconfigured = prev.filter((p) => p.role === role && !p.configured);
      return [...others, ...reordered, ...unconfigured].sort((a, b) => {
        const roleOrder = Object.keys(ROLE_LABELS);
        const roleA = roleOrder.indexOf(a.role);
        const roleB = roleOrder.indexOf(b.role);
        if (roleA !== roleB) return roleA - roleB;
        if (a.configured !== b.configured) return a.configured ? -1 : 1;
        return 0;
      });
    });

    try {
      setSaving(true);
      const grouped = groupByRole(providers);
      grouped[role] = [...reordered, ...providers.filter((p) => p.role === role && !p.configured)];

      const roles: RoleAssignment[] = Object.entries(grouped).map(([r, ps]) => ({
        role: r,
        provider_ids: ps.filter((p) => p.configured).map((p) => p.id),
      }));

      await saveProviderRoles(roles);
    } catch (err) {
      console.error('Failed to save provider order:', err);
      await loadProviders();
    } finally {
      setSaving(false);
    }
  };

  const grouped = groupByRole(providers);

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

      <div className="space-y-8">
        {(Object.keys(ROLE_LABELS) as RoleGroup[]).map((role) => {
          const roleProviders = grouped[role] ?? [];
          if (roleProviders.length === 0) return null;

          return (
            <SortableRoleGroup
              key={role}
              role={role}
              providers={roleProviders}
              testResults={testResults}
              onTest={handleTest}
              onManageCredentials={handleManageCredentials}
              onReorder={handleReorder}
            />
          );
        })}
      </div>

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

function groupByRole(providers: ProviderInfo[]): Record<RoleGroup, ProviderInfo[]> {
  return providers.reduce(
    (acc, p) => {
      const role = p.role as RoleGroup;
      if (!acc[role]) acc[role] = [];
      acc[role].push(p);
      return acc;
    },
    {} as Record<RoleGroup, ProviderInfo[]>
  );
}

function reorderByRoles(providers: ProviderInfo[], roles: RoleAssignment[]): ProviderInfo[] {
  const roleMap = new Map<string, string[]>();
  for (const r of roles) {
    roleMap.set(r.role, r.provider_ids);
  }

  const result: ProviderInfo[] = [];
  const used = new Set<string>();

  for (const role of Object.keys(ROLE_LABELS)) {
    const order = roleMap.get(role) ?? [];
    const roleProviders = providers.filter((p) => p.role === role);

    for (const id of order) {
      const provider = roleProviders.find((roleProvider) => roleProvider.id === id);
      if (provider && !used.has(provider.id)) {
        result.push(provider);
        used.add(provider.id);
      }
    }

    for (const provider of roleProviders) {
      if (!used.has(provider.id)) {
        result.push(provider);
        used.add(provider.id);
      }
    }
  }

  return result;
}

function getLocalGenerationProviderId(provider: ProviderInfo): LocalProviderId | null {
  if (provider.role !== 'generation') return null;
  return toLocalProviderId(provider.id);
}

function getSettingsProviderName(provider: ProviderInfo): string {
  const localProviderId = getLocalGenerationProviderId(provider);
  if (localProviderId === 'google') return 'Google';
  return provider.name;
}

function clearTestResultsForLocalProvider(
  providerId: LocalProviderId,
  setTestResults: Dispatch<SetStateAction<Record<string, TestConnectionResult | 'loading'>>>
) {
  setTestResults((prev) => {
    const next = { ...prev };

    for (const key of Object.keys(next)) {
      if (toLocalProviderId(key) === providerId) {
        delete next[key];
      }
    }

    return next;
  });
}
