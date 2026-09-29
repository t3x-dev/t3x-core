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
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Circle,
  GripVertical,
  Loader2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { AutopilotSettings } from '@/components/autopilot/AutopilotSettings';
import { ProjectCollaborationPanel } from '@/components/project/ProjectCollaborationPanel';
import { ProjectVisibilitySettings } from '@/components/project/ProjectVisibilitySettings';
import { ProjectDangerZone } from '@/components/project/settings/ProjectDangerZone';
import { ProjectExportSettings } from '@/components/project/settings/ProjectExportSettings';
import { ProjectGeneralSettings } from '@/components/project/settings/ProjectGeneralSettings';
import { ProjectIntegritySettings } from '@/components/project/settings/ProjectIntegritySettings';
import { ProjectSettingsNav } from '@/components/project/settings/ProjectSettingsNav';
import { SettingsSection } from '@/components/project/settings/SettingsSection';
import { ModelSelector } from '@/components/shared/ModelSelector';
import { useProjectCrud } from '@/hooks/projects/useProjectCrud';
import { projectDescription, useProjectSettings } from '@/hooks/projects/useProjectSettings';
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedReturnTo = searchParams.get('returnTo');
  const returnTo =
    requestedReturnTo?.startsWith('/') &&
    !requestedReturnTo.startsWith('//') &&
    !requestedReturnTo.includes('\\')
      ? requestedReturnTo
      : `/project/${encodeURIComponent(projectId)}`;
  const settings = useProjectSettings(projectId);
  const { saveProjectProviderConfig } = useProviderCommands();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [globalRoles, setGlobalRoles] = useState<RoleAssignment[]>([]);
  const [overriddenRoles, setOverriddenRoles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [savedModel, setSavedModel] = useState<{
    provider: string | null;
    model: string | null;
  } | null>(null);
  const [modelVersion, setModelVersion] = useState(0);
  const { setModel: updateProjectModel } = useProjectCrud();
  const projectModel =
    savedModel ??
    (settings.project
      ? {
          provider: settings.project.default_provider ?? null,
          model: settings.project.default_model ?? null,
        }
      : null);

  const handleModelChange = async (provider: string | null, model: string | null) => {
    setModelError(null);
    try {
      await updateProjectModel(projectId, provider, model);
      setSavedModel({ provider, model });
    } catch (error) {
      setModelError(error instanceof Error ? error.message : 'Failed to save model settings.');
      setModelVersion((version) => version + 1);
    }
  };

  const handleDelete = async () => {
    await settings.remove();
    router.push('/');
  };

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
  const project = settings.project;

  return (
    <div className="mx-auto grid max-w-[1180px] gap-8 px-6 pb-24 pt-8 lg:grid-cols-[200px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <div className="sticky top-8">
          <ProjectSettingsNav />
        </div>
      </aside>

      <div className="min-w-0 space-y-6">
        <header>
          <Link
            href={returnTo}
            className="mb-3 inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to project
          </Link>
          <h1 className="text-[22px] font-bold leading-7 tracking-[-0.02em] text-[var(--text-primary)]">
            Settings
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            How this repository is identified, shared, automated, verified and exported.
          </p>
        </header>

        {settings.loading ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-elevated)]">
            <Loader2 className="size-5 animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : !project ? (
          <p
            className="rounded-xl border border-[var(--status-error)]/25 bg-[var(--surface-elevated)] p-5 text-[13px] text-[var(--status-error)]"
            role="alert"
          >
            {settings.error ?? 'Repository not found.'}
          </p>
        ) : (
          <ProjectGeneralSettings
            key={`${project.name}:${projectDescription(project)}`}
            onSave={settings.saveGeneral}
            project={project}
          />
        )}

        <ProjectVisibilitySettings projectId={projectId} />
        <ProjectCollaborationPanel projectId={projectId} />

        <SettingsSection
          action={
            overriddenRoles.size > 0 ? (
              <button
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium',
                  'border border-[var(--stroke-default)]',
                  'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                  'hover:bg-[var(--hover-bg)] transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-50'
                )}
                disabled={saving}
                onClick={handleResetToGlobal}
                type="button"
              >
                <RotateCcw className="size-3" />
                Reset to global
              </button>
            ) : null
          }
          description={
            <>
              The model and provider order used when AI proposes changes here. Replay and commits
              never depend on them.
              {saving && <span className="ml-2 text-[var(--text-tertiary)]">Saving...</span>}
            </>
          }
          icon={Sparkles}
          id="ai"
          title="AI defaults"
        >
          <div className="grid gap-6">
            <div>
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
                Default model
              </h3>
              <p className="mb-3 mt-0.5 text-xs text-[var(--text-tertiary)]">
                Used for AI operations in this project unless a run picks another model.
              </p>
              {modelError ? (
                <p className="mb-3 text-xs text-[var(--status-error)]" role="alert">
                  {modelError}
                </p>
              ) : null}
              {settings.loading ? (
                <output className="text-xs text-[var(--text-tertiary)]">
                  Loading project model settings...
                </output>
              ) : projectModel ? (
                <ModelSelector
                  initialModel={projectModel.model}
                  initialProvider={projectModel.provider}
                  key={modelVersion}
                  onChange={handleModelChange}
                />
              ) : null}
            </div>

            <div className="border-t border-[var(--stroke-divider)] pt-5">
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
                Provider overrides
              </h3>
              <p className="mb-4 mt-0.5 text-xs text-[var(--text-tertiary)]">
                Override the global fallback order for this project only.
              </p>
              {providerError ? (
                <p className="mb-3 text-xs text-[var(--status-error)]" role="alert">
                  {providerError}
                </p>
              ) : null}
              {loading ? (
                <div className="flex h-20 items-center justify-center">
                  <Loader2 className="size-4 animate-spin text-[var(--text-tertiary)]" />
                </div>
              ) : (
                <div className="space-y-6">
                  {(Object.keys(ROLE_LABELS) as RoleGroup[]).map((role) => {
                    const roleProviders = grouped[role] ?? [];
                    if (roleProviders.length === 0) return null;
                    return (
                      <SortableRoleGroup
                        isOverridden={overriddenRoles.has(role)}
                        key={role}
                        onReorder={handleReorder}
                        providers={roleProviders}
                        role={role}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          description="Commit extracted state automatically once it meets these thresholds."
          icon={Bot}
          id="autopilot"
          title="Autopilot"
        >
          <AutopilotSettings projectId={projectId} />
        </SettingsSection>

        <ProjectIntegritySettings onVerify={settings.verify} />

        {project ? (
          <>
            <ProjectExportSettings
              onExport={settings.exportArchive}
              projectId={projectId}
              projectName={project.name}
            />
            <ProjectDangerZone onDelete={handleDelete} project={project} />
          </>
        ) : null}
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
