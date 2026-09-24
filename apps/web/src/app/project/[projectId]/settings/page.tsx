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
import { ArrowLeft, CheckCircle2, Circle, GripVertical, Loader2, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { AutopilotSettings } from '@/components/autopilot/AutopilotSettings';
import { ProjectCollaborationPanel } from '@/components/project/ProjectCollaborationPanel';
import { ProjectVisibilitySettings } from '@/components/project/ProjectVisibilitySettings';
import { ModelSelector } from '@/components/shared/ModelSelector';
import { useProjectCrud } from '@/hooks/projects/useProjectCrud';
import { useProjectDetail } from '@/hooks/projects/useProjectDetail';
import { useProviderCommands } from '@/hooks/providers/useProviderCommands';
import {
  fetchProjectProviderConfig,
  fetchProviderRoles,
  fetchProviders,
} from '@/queries/providers';
import type { ProviderInfo, RoleAssignment } from '@/types/api';
import { cn } from '@/utils/cn';

type RoleGroup = 'generation' | 'embedding' | 'extraction' | 'merge';

const ROLE_LABELS: Record<RoleGroup, string> = {
  generation: 'LLM Generation',
  embedding: 'Embedding',
  extraction: 'NLP Extraction',
  merge: 'Merge Resolution',
};

// ────────────────────────────────────────────────────────────
// Sortable Provider Card (simplified from global page)
// ────────────────────────────────────────────────────────────

function SortableProviderCard({
  provider,
  isDraggable,
  isOverridden,
}: {
  provider: ProviderInfo;
  isDraggable: boolean;
  isOverridden: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: provider.id,
    disabled: !isDraggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

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
          <CheckCircle2 className="h-4 w-4 text-[var(--status-success)] shrink-0" />
        ) : (
          <Circle className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
        )}
        <div>
          <div className="text-sm font-medium text-[var(--text-primary)]">
            {provider.name}
            {!isOverridden && (
              <span className="ml-2 text-xs font-normal text-[var(--text-tertiary)]">
                Global Default
              </span>
            )}
          </div>
          <div className="text-xs text-[var(--text-tertiary)]">
            {provider.configured ? (
              provider.default_model && <span>Default: {provider.default_model}</span>
            ) : (
              <span>Requires: {provider.required_env_keys.join(', ') || 'Local server'}</span>
            )}
          </div>
        </div>
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
  isOverridden,
  onReorder,
}: {
  role: RoleGroup;
  providers: ProviderInfo[];
  isOverridden: boolean;
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
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {ROLE_LABELS[role]}
          {isOverridden && (
            <span className="ml-2 text-xs font-normal text-[var(--status-warning)]">
              Overridden
            </span>
          )}
        </h2>
        {configured.length > 1 && (
          <p className="text-xs text-[var(--text-tertiary)] mt-1 italic">
            Drag to reorder fallback priority
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
                isDraggable={configured.length > 1}
                isOverridden={isOverridden}
              />
            ))}
          </SortableContext>
        </DndContext>

        {unconfigured.map((provider) => (
          <SortableProviderCard
            key={provider.id}
            provider={provider}
            isDraggable={false}
            isOverridden={isOverridden}
          />
        ))}
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────

export default function ProjectSettingsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectSettingsPageContent />
    </Suspense>
  );
}

function ProjectSettingsPageContent() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const requestedReturnTo = searchParams.get('returnTo');
  const returnTo =
    requestedReturnTo?.startsWith('/') &&
    !requestedReturnTo.startsWith('//') &&
    !requestedReturnTo.includes('\\')
      ? requestedReturnTo
      : `/project/${encodeURIComponent(projectId)}`;
  const { saveProjectProviderConfig } = useProviderCommands();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [globalRoles, setGlobalRoles] = useState<RoleAssignment[]>([]);
  const [overriddenRoles, setOverriddenRoles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [projectModel, setProjectModel] = useState<{
    provider: string | null;
    model: string | null;
  } | null>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [modelVersion, setModelVersion] = useState(0);
  const { setModel: updateProjectModel } = useProjectCrud();
  const { loadProject } = useProjectDetail();

  const handleModelChange = async (provider: string | null, model: string | null) => {
    setModelError(null);
    try {
      await updateProjectModel(projectId, provider, model);
      setProjectModel({ provider, model });
    } catch (error) {
      setModelError(error instanceof Error ? error.message : 'Failed to save model settings.');
      setModelVersion((version) => version + 1);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setModelLoading(true);
    setModelError(null);
    loadProject(projectId)
      .then((value) => {
        if (!cancelled)
          setProjectModel({
            provider: value.default_provider ?? null,
            model: value.default_model ?? null,
          });
      })
      .catch((error) => {
        if (!cancelled)
          setModelError(
            error instanceof Error ? error.message : 'Failed to load project model settings.'
          );
      })
      .finally(() => {
        if (!cancelled) setModelLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadProject, projectId]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setProviderError(null);
      const [data, roles, projectConfig] = await Promise.all([
        fetchProviders(),
        fetchProviderRoles(),
        fetchProjectProviderConfig(projectId),
      ]);

      setGlobalRoles(roles);

      // Determine which roles are overridden at the project level
      const overridden = new Set<string>();
      if (projectConfig?.roles) {
        for (const r of projectConfig.roles) {
          overridden.add(r.role);
        }
      }
      setOverriddenRoles(overridden);

      // Apply project overrides to the provider ordering
      const effectiveRoles = [...roles];
      if (projectConfig?.roles) {
        for (const pr of projectConfig.roles) {
          const idx = effectiveRoles.findIndex((r) => r.role === pr.role);
          if (idx >= 0) {
            effectiveRoles[idx] = pr;
          } else {
            effectiveRoles.push(pr);
          }
        }
      }

      setProviders(reorderByRoles(data, effectiveRoles));
    } catch (err) {
      setProviderError(err instanceof Error ? err.message : 'Failed to load provider overrides.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleReorder = async (role: RoleGroup, oldIndex: number, newIndex: number) => {
    setProviderError(null);
    const configured = providers.filter((p) => p.role === role && p.configured);
    const reordered = arrayMove(configured, oldIndex, newIndex);

    // Update state optimistically
    setProviders((prev) => {
      const others = prev.filter((p) => p.role !== role || !p.configured);
      const unconfigured = prev.filter((p) => p.role === role && !p.configured);
      return [...others, ...reordered, ...unconfigured].sort((a, b) => {
        const roleOrder = Object.keys(ROLE_LABELS);
        const rA = roleOrder.indexOf(a.role);
        const rB = roleOrder.indexOf(b.role);
        if (rA !== rB) return rA - rB;
        if (a.configured !== b.configured) return a.configured ? -1 : 1;
        return 0;
      });
    });

    setOverriddenRoles((prev) => new Set([...prev, role]));

    // Save project-level config
    // Note: we use `reordered` (not `providers` state) to avoid stale closure
    try {
      setSaving(true);
      const newOverridden = new Set([...overriddenRoles, role]);

      // Build config from current providers snapshot, overriding the reordered role
      const projectRoles: RoleAssignment[] = [];
      for (const r of Object.keys(ROLE_LABELS) as RoleGroup[]) {
        if (!newOverridden.has(r)) continue;
        if (r === role) {
          // Use the freshly reordered list
          projectRoles.push({
            role: r,
            provider_ids: reordered.map((p) => p.id),
          });
        } else {
          // Use existing providers state for other overridden roles
          projectRoles.push({
            role: r,
            provider_ids: providers.filter((p) => p.role === r && p.configured).map((p) => p.id),
          });
        }
      }

      await saveProjectProviderConfig(projectId, { roles: projectRoles });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save provider overrides.';
      await loadData();
      setProviderError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetToGlobal = async () => {
    try {
      setSaving(true);
      setProviderError(null);
      await saveProjectProviderConfig(projectId, null);
      setOverriddenRoles(new Set());
      // Reload with global defaults
      const data = await fetchProviders();
      setProviders(reorderByRoles(data, globalRoles));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset provider overrides.';
      await loadData();
      setProviderError(message);
    } finally {
      setSaving(false);
    }
  };

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
      <div className="mb-2">
        <Link
          href={returnTo}
          className="inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to project
        </Link>
      </div>

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Project Settings</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Manage this project&apos;s privacy, collaboration, and local provider overrides.
            {saving && <span className="ml-2 text-xs text-[var(--text-tertiary)]">Saving...</span>}
          </p>
        </div>

        {overriddenRoles.size > 0 && (
          <button
            type="button"
            onClick={handleResetToGlobal}
            disabled={saving}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium',
              'border border-[var(--stroke-divider)]',
              'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              'hover:bg-[var(--hover-bg)] transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <RotateCcw className="h-3 w-3" />
            Reset to Global
          </button>
        )}
      </div>

      <ProjectVisibilitySettings projectId={projectId} />

      <div className="mt-12 border-t border-[var(--stroke-divider)] pt-8">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Provider overrides</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Override the global provider order for this project.
        </p>
        {providerError ? (
          <p className="mt-2 text-sm text-[var(--status-error)]" role="alert">
            {providerError}
          </p>
        ) : null}
      </div>

      <div className="mt-6 space-y-8">
        {(Object.keys(ROLE_LABELS) as RoleGroup[]).map((role) => {
          const roleProviders = grouped[role] ?? [];
          if (roleProviders.length === 0) return null;

          return (
            <SortableRoleGroup
              key={role}
              role={role}
              providers={roleProviders}
              isOverridden={overriddenRoles.has(role)}
              onReorder={handleReorder}
            />
          );
        })}
      </div>

      {/* Default AI Model */}
      <div className="mt-12 pt-8 border-t border-[var(--stroke-divider)]">
        <h1 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Default AI Model</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Set the default provider and model used for AI operations in this project.
        </p>
        {modelError ? (
          <p className="mb-3 text-sm text-[var(--status-error)]" role="alert">
            {modelError}
          </p>
        ) : null}
        {modelLoading ? (
          <output>Loading project model settings…</output>
        ) : projectModel ? (
          <ModelSelector
            initialProvider={projectModel.provider}
            initialModel={projectModel.model}
            key={modelVersion}
            onChange={handleModelChange}
          />
        ) : null}
      </div>

      {/* Autopilot Settings */}
      <div className="mt-12 pt-8 border-t border-[var(--stroke-divider)]">
        <h1 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Autopilot</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Configure automatic knowledge commit rules for this project.
        </p>
        <AutopilotSettings projectId={projectId} />
      </div>

      <ProjectCollaborationPanel projectId={projectId} />
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

  for (const role of Object.keys(ROLE_LABELS)) {
    const order = roleMap.get(role) ?? [];
    const roleProviders = providers.filter((p) => p.role === role);

    for (const id of order) {
      const p = roleProviders.find((rp) => rp.id === id);
      if (p && !used.has(p.id)) {
        result.push(p);
        used.add(p.id);
      }
    }

    for (const p of roleProviders) {
      if (!used.has(p.id)) {
        result.push(p);
        used.add(p.id);
      }
    }
  }

  return result;
}
