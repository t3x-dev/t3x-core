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
import { useCallback, useEffect, useState } from 'react';
import {
  getProviderRoles,
  listProviders,
  type ProviderInfo,
  type RoleAssignment,
  type TestConnectionResult,
  testProvider,
  updateProviderRoles,
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

// ────────────────────────────────────────────────────────────
// Sortable Provider Card
// ────────────────────────────────────────────────────────────

function SortableProviderCard({
  provider,
  testResult,
  onTest,
  isDraggable,
}: {
  provider: ProviderInfo;
  testResult: TestConnectionResult | 'loading' | undefined;
  onTest: (id: string) => void;
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
            className="cursor-grab active:cursor-grabbing text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : (
          <div className="w-4" />
        )}
        {provider.configured ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        ) : (
          <Circle className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
        )}
        <div>
          <div className="text-sm font-medium text-[var(--text-primary)]">{provider.name}</div>
          <div className="text-xs text-[var(--text-tertiary)]">
            {provider.configured ? (
              <>
                {provider.default_model && <span>Default: {provider.default_model}</span>}
                {result && (
                  <span className="ml-2">
                    {result.ok ? (
                      <span className="text-[var(--status-success)]">Connected ({result.latency_ms}ms)</span>
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
          <span className="text-xs text-[var(--text-tertiary)] hidden sm:inline">
            {provider.available_models.length} models
          </span>
        )}
        {provider.configured && (
          <button
            type="button"
            onClick={() => onTest(provider.id)}
            disabled={isTesting}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium',
              'border border-[var(--stroke-divider)]',
              'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              'hover:bg-[var(--hover-bg)] transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
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

// ────────────────────────────────────────────────────────────
// Sortable Role Group
// ────────────────────────────────────────────────────────────

function SortableRoleGroup({
  role,
  providers,
  testResults,
  onTest,
  onReorder,
}: {
  role: RoleGroup;
  providers: ProviderInfo[];
  testResults: Record<string, TestConnectionResult | 'loading'>;
  onTest: (id: string) => void;
  onReorder: (role: RoleGroup, oldIndex: number, newIndex: number) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Only configured providers are draggable
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
          <p className="text-xs text-[var(--text-tertiary)] mt-1 italic">
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
            isDraggable={false}
          />
        ))}
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────

export default function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestConnectionResult | 'loading'>>(
    {}
  );
  const [saving, setSaving] = useState(false);

  const loadProviders = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      setTestResults({});

      const [data, roles] = await Promise.all([listProviders(), getProviderRoles()]);

      // Reorder providers based on saved role assignments
      const reordered = reorderByRoles(data, roles);
      setProviders(reordered);
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

  const handleReorder = async (role: RoleGroup, oldIndex: number, newIndex: number) => {
    // Get configured providers for this role
    const roleProviders = providers.filter((p) => p.role === role && p.configured);
    const reordered = arrayMove(roleProviders, oldIndex, newIndex);

    // Update providers state optimistically
    setProviders((prev) => {
      const others = prev.filter((p) => p.role !== role || !p.configured);
      const unconfigured = prev.filter((p) => p.role === role && !p.configured);
      return [...others, ...reordered, ...unconfigured].sort((a, b) => {
        // Maintain role group ordering
        const roleOrder = Object.keys(ROLE_LABELS);
        const roleA = roleOrder.indexOf(a.role);
        const roleB = roleOrder.indexOf(b.role);
        if (roleA !== roleB) return roleA - roleB;
        // Within role: configured first, then by position
        if (a.configured !== b.configured) return a.configured ? -1 : 1;
        return 0;
      });
    });

    // Save to API
    try {
      setSaving(true);
      // Build role assignments from current state
      const grouped = groupByRole(providers);
      // Override the reordered role
      grouped[role] = [...reordered, ...providers.filter((p) => p.role === role && !p.configured)];

      const roles: RoleAssignment[] = Object.entries(grouped).map(([r, ps]) => ({
        role: r,
        provider_ids: ps.filter((p) => p.configured).map((p) => p.id),
      }));

      await updateProviderRoles(roles);
    } catch (err) {
      console.error('Failed to save provider order:', err);
      // Reload to revert
      await loadProviders();
    } finally {
      setSaving(false);
    }
  };

  // Group providers by role
  const grouped = groupByRole(providers);

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
          {saving && <span className="ml-2 text-xs text-[var(--text-tertiary)]">Saving...</span>}
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
            <SortableRoleGroup
              key={role}
              role={role}
              providers={roleProviders}
              testResults={testResults}
              onTest={handleTest}
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

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

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

  // For each role, add providers in the saved order
  for (const role of Object.keys(ROLE_LABELS)) {
    const order = roleMap.get(role) ?? [];
    const roleProviders = providers.filter((p) => p.role === role);

    // Add in saved order first
    for (const id of order) {
      const p = roleProviders.find((rp) => rp.id === id);
      if (p && !used.has(p.id)) {
        result.push(p);
        used.add(p.id);
      }
    }

    // Add remaining (not in saved order)
    for (const p of roleProviders) {
      if (!used.has(p.id)) {
        result.push(p);
        used.add(p.id);
      }
    }
  }

  return result;
}
