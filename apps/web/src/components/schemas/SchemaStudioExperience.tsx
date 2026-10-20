'use client';

import type { SchemaPreparationTarget, StudioCandidate, StudioPreview } from '@t3x-dev/api-client';
import { ArrowRight, Layers } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import { getProjectIdRepoPath, getProjectIdWorkspacePath } from '@/domain/project/repoPath';
import {
  listStudioDraftWorkspaces,
  listStudioWorkspacesForBranches,
  resolveStudioWorkspaceId,
} from '@/domain/workspaces/studioTargets';
import { useStudioCandidates } from '@/hooks/schemas/useStudioCandidates';
import { useApplyStudioSelection, useStudioPreview } from '@/hooks/schemas/useStudioPreview';
import { useStudioSchemaEditCandidate } from '@/hooks/schemas/useStudioSchemaEditCandidate';
import { useWorkspaceSchemaPending } from '@/hooks/schemas/useWorkspaceSchemaPending';
import { useBranches } from '@/hooks/shared/useBranches';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import { useWorkspaceFlow } from '@/hooks/workspaces/useWorkspaceFlow';
import moduleStyles from './AddModulesDialog.module.css';
import { SchemaContentPreparationDialog } from './SchemaContentPreparationDialog';
import { SchemaDefinitionWorkbench } from './SchemaDefinitionWorkbench';
import { SchemaStudioSurface } from './SchemaStudioSurface';
import { StudioChanges, StudioImpactPreview } from './StudioDefinitionPreview';
import { StudioPublishDialog } from './StudioPublishDialog';

type ModuleTone = 'blue' | 'purple' | 'orange' | 'green' | 'rose' | 'slate' | 'amber';

type StudioModule = {
  id: string;
  title: string;
  source: string;
  sourceTone: ModuleTone | 'black';
  tone: ModuleTone;
  icon: string;
  checked: boolean;
  candidate?: StudioCandidate;
};

type StudioSource = {
  name: string;
  tone: ModuleTone | 'black';
  icon: string;
  modules: StudioModule[];
};

const demoSources: StudioSource[] = [
  {
    name: 'T3X PRD',
    tone: 'black',
    icon: 'ri-checkbox-blank-circle-line',
    modules: [
      {
        id: 'summary',
        title: 'Summary',
        source: 'T3X PRD',
        sourceTone: 'black',
        tone: 'blue',
        icon: 'ri-box-3-fill',
        checked: true,
      },
      {
        id: 'requirements',
        title: 'Requirements',
        source: 'T3X PRD',
        sourceTone: 'black',
        tone: 'purple',
        icon: 'ri-file-list-3-fill',
        checked: true,
      },
      {
        id: 'milestones',
        title: 'Milestones',
        source: 'T3X PRD',
        sourceTone: 'black',
        tone: 'orange',
        icon: 'ri-flag-2-fill',
        checked: false,
      },
    ],
  },
  {
    name: 'Release Ops',
    tone: 'blue',
    icon: 'ri-rocket-2-fill',
    modules: [
      {
        id: 'rollout',
        title: 'Rollout',
        source: 'Release Ops',
        sourceTone: 'blue',
        tone: 'green',
        icon: 'ri-rocket-2-fill',
        checked: true,
      },
      {
        id: 'acceptance',
        title: 'Acceptance',
        source: 'Release Ops',
        sourceTone: 'blue',
        tone: 'rose',
        icon: 'ri-checkbox-circle-fill',
        checked: true,
      },
      {
        id: 'audit',
        title: 'Audit',
        source: 'Release Ops',
        sourceTone: 'blue',
        tone: 'slate',
        icon: 'ri-database-2-fill',
        checked: false,
      },
    ],
  },
  {
    name: 'Risk Kit',
    tone: 'purple',
    icon: 'ri-alert-fill',
    modules: [
      {
        id: 'risk',
        title: 'Risk',
        source: 'Risk Kit',
        sourceTone: 'purple',
        tone: 'amber',
        icon: 'ri-alert-fill',
        checked: true,
      },
      {
        id: 'controls',
        title: 'Controls',
        source: 'Risk Kit',
        sourceTone: 'purple',
        tone: 'slate',
        icon: 'ri-shield-check-fill',
        checked: false,
      },
    ],
  },
];

const demoComposition = demoSources
  .flatMap((source) => source.modules)
  .filter((item) => item.checked);

function candidateTone(index: number): ModuleTone {
  return (['blue', 'purple', 'green', 'rose', 'amber', 'slate'] as const)[index % 6];
}

function candidateIcon(index: number) {
  return [
    'ri-box-3-fill',
    'ri-file-list-3-fill',
    'ri-rocket-2-fill',
    'ri-checkbox-circle-fill',
    'ri-alert-fill',
  ][index % 5];
}

export function SchemaStudioExperience({
  projectId,
  navigation,
}: {
  projectId: string;
  children?: ReactNode;
  navigation?: ReactNode;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const candidates = useStudioCandidates(projectId);
  const workspaces = useProjectWorkspaces(projectId);
  const projectBranches = useBranches(projectId, true);
  const { saveDraft } = useWorkspaceFlow();
  const ensuringBranches = useRef(new Map<string, Promise<void>>());
  const applySelection = useApplyStudioSelection(projectId);
  const [selection, setSelection] = useState<string[]>([]);
  const [workspaceId, setWorkspaceId] = useState(params?.get('workspace') ?? '');
  const requestedWorkspaceId = params?.get('workspace') ?? '';
  const [activeModuleId, setActiveModuleId] = useState('requirements');
  const [advanced, setAdvanced] = useState(params?.get('mode') === 'compose');
  const [definitionOpen, setDefinitionOpen] = useState(false);
  const [editorBase, setEditorBase] = useState<{
    schema: Record<string, unknown>;
    hash: string;
    initial: Record<string, unknown>;
  }>();
  const [localContribution, setLocalContribution] = useState<Record<string, unknown>>({});
  const [schemaDefinition, setSchemaDefinition] = useState<Record<string, unknown>>();
  const [savedCandidateRef, setSavedCandidateRef] = useState<{
    candidateId: string;
    revision: number;
  }>();
  const [review, setReview] = useState<StudioPreview>();
  const [publishReview, setPublishReview] = useState<StudioPreview>();
  const [preparation, setPreparation] = useState<{
    workspaceId: string;
    revision: number;
    target: SchemaPreparationTarget;
  }>();
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string>();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setWorkspaceId(requestedWorkspaceId);
  }, [requestedWorkspaceId]);

  const requested = params?.get('candidate');
  useEffect(() => {
    if (requested) setSelection([requested]);
  }, [requested]);

  const draftWorkspaces = useMemo(
    () =>
      listStudioWorkspacesForBranches(workspaces.workspaces, projectBranches.branches, (branch) =>
        getProjectWorkspaceStarterCandidate(
          projectId,
          [],
          branch,
          projectBranches.branchHeads[branch] ?? null
        )
      ),
    [projectBranches.branchHeads, projectBranches.branches, projectId, workspaces.workspaces]
  );
  useEffect(() => {
    if (!projectId || projectBranches.loading) return;
    const persistedBranches = new Set(
      listStudioDraftWorkspaces(workspaces.workspaces).map((workspace) => workspace.targetBranch)
    );
    const missing = projectBranches.branches.filter((branch) => !persistedBranches.has(branch));
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      await Promise.all(
        missing.map((branch) => {
          const current = ensuringBranches.current.get(branch);
          if (current) return current;
          const task = (async () => {
            try {
              const starter = getProjectWorkspaceStarterCandidate(
                projectId,
                [],
                branch,
                projectBranches.branchHeads[branch] ?? null
              );
              await saveDraft(starter);
            } catch (error) {
              // Another surface created this branch's workspace first; the refresh below picks it up.
              if ((error as { code?: unknown } | null)?.code !== 'CONFLICT') throw error;
            } finally {
              ensuringBranches.current.delete(branch);
            }
          })();
          ensuringBranches.current.set(branch, task);
          return task;
        })
      );
      if (!cancelled) await workspaces.refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [
    projectBranches.branchHeads,
    projectBranches.branches,
    projectBranches.loading,
    projectId,
    saveDraft,
    workspaces.refresh,
    workspaces.workspaces,
  ]);
  useEffect(() => {
    if (workspaceId) return;
    const resolved = resolveStudioWorkspaceId(draftWorkspaces, workspaceId);
    if (resolved) setWorkspaceId(resolved);
  }, [draftWorkspaces, workspaceId]);
  const target = draftWorkspaces.find((item) => item.id === workspaceId);
  const persistedTarget = listStudioDraftWorkspaces(workspaces.workspaces).find(
    (item) => item.id === workspaceId
  );
  const schemaEdit = useStudioSchemaEditCandidate(
    projectId,
    persistedTarget?.id ?? '',
    persistedTarget?.revision
  );
  const recoveredCandidateKey = schemaEdit.candidate
    ? `${schemaEdit.candidate.candidateId}:${schemaEdit.candidate.revision}`
    : schemaEdit.loading
      ? 'loading'
      : 'none';
  const pendingSchema = useWorkspaceSchemaPending(
    projectId,
    persistedTarget?.id ?? '',
    persistedTarget?.revision
  );
  const recoveredSelection = useRef('');
  const recoveredEditIdentity = useRef('');
  const recoveryKey = `${projectId}:${persistedTarget?.id ?? ''}`;
  useEffect(() => {
    if (
      !persistedTarget ||
      candidates.loading ||
      schemaEdit.loading ||
      pendingSchema.loading ||
      recoveredSelection.current === recoveryKey
    )
      return;
    recoveredSelection.current = recoveryKey;
    if (requested) return;
    const source = pendingSchema.data?.pending?.source;
    if (source?.kind === 'studio') {
      setSelection([...source.candidateIds]);
    } else if (schemaEdit.candidate) {
      const ids = (schemaEdit.candidate.baseSources ?? [])
        .map(
          (base) =>
            candidates.items.find(
              (candidate) => candidate.source?.artifactVersionId === base.artifactVersionId
            )?.id
        )
        .filter((id): id is string => !!id);
      setSelection(ids);
    } else {
      const ids = (persistedTarget.schemaBindings ?? [])
        .flatMap((binding) => binding.studioSources ?? [])
        .map(
          (source) =>
            candidates.items.find(
              (candidate) =>
                candidate.source?.artifactVersionId === source.artifactVersionId &&
                candidate.source.hash === source.hash &&
                candidate.source.projectId === source.projectId &&
                candidate.source.canonicalName === source.canonicalName &&
                candidate.source.version === source.version
            )?.id
        )
        .filter((id): id is string => !!id);
      setSelection([...new Set(ids)]);
    }
  }, [
    candidates.items,
    candidates.loading,
    schemaEdit.candidate,
    schemaEdit.loading,
    pendingSchema.data,
    pendingSchema.loading,
    persistedTarget,
    recoveryKey,
    requested,
  ]);
  useEffect(() => {
    if (schemaEdit.loading || candidates.loading) return;
    const identity = `${projectId}:${workspaceId}:${recoveredCandidateKey}`;
    if (recoveredEditIdentity.current === identity) return;
    if (schemaEdit.candidate?.baseSources?.length) {
      const ids = schemaEdit.candidate.baseSources.map(
        (base) =>
          candidates.items.find(
            (candidate) =>
              candidate.source?.artifactVersionId === base.artifactVersionId &&
              candidate.source.hash === base.hash &&
              candidate.source.projectId === base.projectId &&
              candidate.source.canonicalName === base.canonicalName &&
              candidate.source.version === base.version
          )?.id
      );
      if (ids.some((id) => !id)) return;
      setSelection(ids as string[]);
    }
    recoveredEditIdentity.current = identity;
    setReview(undefined);
    setPublishReview(undefined);
    setDefinitionOpen(false);
    setEditorBase(undefined);
    setLocalContribution(structuredClone(schemaEdit.candidate?.localContribution ?? {}));
    setSchemaDefinition(undefined);
    setSavedCandidateRef(
      schemaEdit.candidate
        ? {
            candidateId: schemaEdit.candidate.candidateId,
            revision: schemaEdit.candidate.revision,
          }
        : undefined
    );
  }, [
    candidates.items,
    candidates.loading,
    projectId,
    recoveredCandidateKey,
    schemaEdit.candidate,
    schemaEdit.loading,
    workspaceId,
  ]);

  useEffect(() => {
    setDefinitionOpen(false);
    setEditorBase(undefined);
    setSchemaDefinition(undefined);
  }, [workspaceId]);

  const previewInput = {
    candidateIds: selection,
    ...(persistedTarget ? { workspaceId: persistedTarget.id } : {}),
  };
  const basePreview = useStudioPreview(projectId, previewInput, persistedTarget?.revision);
  const hasLocalContribution = contributionHasContent(localContribution);
  const hasSchemaEdit = hasLocalContribution || !!savedCandidateRef || !!schemaDefinition;
  const localPreview = useStudioPreview(
    projectId,
    hasSchemaEdit
      ? {
          ...previewInput,
          ...(savedCandidateRef
            ? { schemaEditCandidate: savedCandidateRef }
            : schemaDefinition
              ? {
                  schemaDefinition,
                  baseSchemaHash: editorBase?.hash ?? basePreview.data?.schemaHash,
                }
              : { localContribution }),
        }
      : { candidateIds: [] },
    persistedTarget?.revision
  );
  const preview = hasSchemaEdit ? localPreview : basePreview;
  const data = preview.data;
  const locked = new Set(
    data?.modules.filter((item) => item.requiredBy.length).map((item) => item.candidateId)
  );
  const candidateSelectionKey = JSON.stringify(selection);

  useEffect(() => {
    setReview(undefined);
    setError(undefined);
  }, [candidateSelectionKey, workspaceId, data?.reviewHash]);

  useEffect(() => {
    setPublishReview(undefined);
  }, [candidateSelectionKey, workspaceId]);

  const liveSources = useMemo<StudioSource[]>(() => {
    if (!candidates.items.length) return [];
    const bySource = new Map<string, StudioSource>();
    candidates.items.forEach((candidate, index) => {
      const sourceName = candidate.source?.canonicalName.split('/').at(-1) ?? 'Unavailable source';
      const displaySource = sourceName
        .split(/[-_]/)
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(' ');
      const group = bySource.get(displaySource) ?? {
        name: displaySource,
        tone: candidateTone(index),
        icon: candidateIcon(index),
        modules: [],
      };
      group.modules.push({
        id: candidate.id,
        title: candidate.title ?? 'Unavailable source',
        source: displaySource,
        sourceTone: group.tone,
        tone: candidateTone(index),
        icon: candidateIcon(index),
        checked: selection.includes(candidate.id),
        candidate,
      });
      bySource.set(displaySource, group);
    });
    return [...bySource.values()];
  }, [candidates.items, selection]);

  const showExplicitDemo = params?.get('demo') === '1';
  const visibleSources = liveSources.length ? liveSources : showExplicitDemo ? demoSources : [];
  const liveComposition = liveSources
    .flatMap((source) => source.modules)
    .filter((item) => item.checked);
  const composition = liveSources.length
    ? liveComposition
    : showExplicitDemo
      ? demoComposition
      : [];
  const activeModule =
    visibleSources.flatMap((source) => source.modules).find((item) => item.id === activeModuleId) ??
    composition[1] ??
    composition[0];
  const selectedWorkspaceTitle =
    target?.title ??
    (workspaceId ? 'Workspace unavailable' : (draftWorkspaces[0]?.title ?? 'No draft workspace'));

  function choose(module: StudioModule) {
    recoveredSelection.current = recoveryKey;
    setActiveModuleId(module.id);
    if (!module.candidate) return;
    const candidate = module.candidate;
    setSavedCandidateRef(undefined);
    setSchemaDefinition(undefined);
    setSelection((current) =>
      current.includes(candidate.id)
        ? current.filter((value) => value !== candidate.id)
        : candidate.kind === 'schema'
          ? [candidate.id]
          : [
              ...current.filter(
                (value) => candidates.items.find((item) => item.id === value)?.kind !== 'schema'
              ),
              candidate.id,
            ]
    );
  }

  async function apply() {
    const reviewWorkspace = review?.workspace;
    if (!review || !reviewWorkspace || !target || reviewWorkspace.id !== target.id || applying)
      return;
    if (
      (hasSchemaEdit && !savedCandidateRef) ||
      review.reviewHash !== data?.reviewHash ||
      !review.impact?.canAdopt
    )
      return;
    setApplying(true);
    setError(undefined);
    try {
      await applySelection({
        candidateIds: [...selection],
        workspaceId: reviewWorkspace.id,
        ifRevision: reviewWorkspace.revision,
        reviewHash: review.reviewHash,
        ...(savedCandidateRef ? { schemaEditCandidate: savedCandidateRef } : {}),
      });
      if (!mounted.current) return;
      const applied = draftWorkspaces.find((item) => item.id === reviewWorkspace.id) ?? target;
      const href = applied
        ? `${getProjectIdWorkspacePath(projectId, { branch: applied.targetBranch })}&workspace=${encodeURIComponent(applied.id)}`
        : getProjectIdWorkspacePath(projectId);
      router.push(href);
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : 'Adoption failed');
        setReview(undefined);
        preview.refresh();
      }
    } finally {
      if (mounted.current) setApplying(false);
    }
  }

  function openReview() {
    if (target && data?.workspace?.id === target.id) setReview(data);
  }

  function downloadDefinition() {
    if (!data?.schema) return;
    const blob = new Blob([JSON.stringify(data.schema, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'schema-studio-definition.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function saveDefinition(contribution: Record<string, unknown>, intent: string) {
    if (!persistedTarget)
      throw new Error('Create or select a persisted Workspace before saving a Schema candidate.');
    if (!selection.length) throw new Error('Select at least one base Schema or Module.');
    const saved = await schemaEdit.save({
      workspaceId: persistedTarget.id,
      candidateIds: [...selection],
      ifRevision: schemaEdit.candidate?.revision ?? 0,
      retryKey: `studio:${persistedTarget.id}:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      intent,
      origin: 'studio',
      localContribution: contribution.yschema === '0.1' ? {} : contribution,
      ...(contribution.yschema === '0.1'
        ? {
            schemaDefinition: contribution,
            baseSchemaHash: editorBase?.hash ?? basePreview.data?.schemaHash,
          }
        : {}),
    });
    setLocalContribution(structuredClone(saved.candidate.localContribution));
    setSchemaDefinition(undefined);
    setSavedCandidateRef({
      candidateId: saved.candidate.candidateId,
      revision: saved.candidate.revision,
    });
    setDefinitionOpen(false);
    await workspaces.refresh();
  }

  function changeDefinitionOpen(open: boolean) {
    if (!open) {
      setSchemaDefinition(undefined);
      setLocalContribution(structuredClone(schemaEdit.candidate?.localContribution ?? {}));
      setSavedCandidateRef(
        schemaEdit.candidate
          ? {
              candidateId: schemaEdit.candidate.candidateId,
              revision: schemaEdit.candidate.revision,
            }
          : undefined
      );
    }
    setDefinitionOpen(open);
  }

  const canReview = !!target && data?.workspace?.id === target.id && !applying;
  const repoPath = getProjectIdRepoPath(projectId);
  const browseParams = new URLSearchParams({ tab: 'schemas', schemaView: 'browse' });
  const routeBranch = params?.get('branch');
  if (routeBranch) browseParams.set('branch', routeBranch);
  if (workspaceId) browseParams.set('workspace', workspaceId);
  const browseHref = `${repoPath}?${browseParams.toString()}`;
  const workspaceLink = target
    ? `${getProjectIdWorkspacePath(projectId, { branch: target.targetBranch })}&workspace=${encodeURIComponent(target.id)}`
    : getProjectIdWorkspacePath(projectId);

  return (
    <section
      aria-label="Schema Studio"
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface-card)]"
    >
      {!workspaces.loading && !workspaces.error && workspaceId && !target ? (
        <p className="px-6 py-2 text-sm text-[var(--status-error)]" role="alert">
          Workspace {workspaceId} was not found in this project. Select a valid Workspace before
          applying.
        </p>
      ) : null}
      {error ? (
        <p className="px-6 py-2 text-sm text-[var(--status-error)]" role="alert">
          {error} Review the refreshed selection before trying again.
        </p>
      ) : null}
      <SchemaStudioSurface
        navigation={navigation}
        browseHref={browseHref}
        workspaceTitle={selectedWorkspaceTitle}
        workspaceId={workspaceId}
        workspaces={draftWorkspaces}
        onWorkspace={setWorkspaceId}
        modules={visibleSources.flatMap((source) => source.modules)}
        composition={composition}
        activeModule={activeModule}
        onSelect={setActiveModuleId}
        onChoose={(module) => {
          const candidate = visibleSources
            .flatMap((source) => source.modules)
            .find((item) => item.id === module.id);
          if (candidate) choose(candidate);
        }}
        onRemove={(id) => {
          setSelection((current) => current.filter((value) => value !== id));
          void candidates.remove(id).catch((cause) => setError(cause.message));
        }}
        locked={locked}
        pending={applying || preview.loading || candidates.pending}
        loading={candidates.loading}
        error={
          candidates.error || schemaEdit.error || preview.error || workspaces.error || undefined
        }
        data={data}
        onCheck={() => {
          preview.refresh();
          pendingSchema.refresh();
          void workspaces.refresh();
        }}
        onAdd={() => setAdvanced(true)}
        onEditDefinition={
          activeModule && persistedTarget && selection.length
            ? () => {
                if (!basePreview.data || !data) return;
                setEditorBase({
                  schema: structuredClone(
                    schemaEdit.candidate?.baseDefinition ?? basePreview.data.schema
                  ),
                  hash: schemaEdit.candidate?.baseDefinition
                    ? String(schemaEdit.candidate.authoringDraft?.base.schemaHash)
                    : basePreview.data.schemaHash,
                  initial: structuredClone(data.schema),
                });
                setDefinitionOpen(true);
              }
            : undefined
        }
        onReview={openReview}
        canReview={canReview}
        onDownload={downloadDefinition}
        onClear={() => {
          recoveredSelection.current = recoveryKey;
          setSelection([]);
        }}
      />
      <SchemaDefinitionWorkbench
        baseSchema={definitionOpen ? editorBase?.schema : basePreview.data?.schema}
        initialContribution={localContribution}
        initialDefinition={schemaDefinition ?? (definitionOpen ? editorBase?.initial : undefined)}
        onOpenChange={changeDefinitionOpen}
        onPreview={(contribution) => {
          if (contribution.yschema === '0.1') setSchemaDefinition(contribution);
          else setLocalContribution(contribution);
          setSavedCandidateRef(undefined);
        }}
        onSave={saveDefinition}
        open={definitionOpen}
        pending={schemaEdit.pending}
        previewError={preview.error}
        recoveryLabel={
          schemaEdit.candidate
            ? `Recovered candidate revision ${schemaEdit.candidate.revision} · ${schemaEdit.candidate.origin.channel}`
            : schemaEdit.loading
              ? 'Recovering the Workspace candidate…'
              : 'New Workspace-local candidate'
        }
        resultSchema={data?.schema}
      />
      <Dialog open={advanced} onOpenChange={setAdvanced}>
        <DialogContent className={moduleStyles.dialog}>
          <DialogHeader className={moduleStyles.header}>
            <span className={moduleStyles.icon}>
              <Layers aria-hidden="true" />
            </span>
            <div>
              <DialogTitle>Add modules</DialogTitle>
              <DialogDescription>
                Pick Schema modules from the library to compose into this project.
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className={`${moduleStyles.body} space-y-3 p-5`}>
            <p className="text-sm">
              Choose sources for this Studio candidate. No separate Composition draft is created.
            </p>
            {candidates.items.map((candidate) => (
              <label key={candidate.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selection.includes(candidate.id)}
                  disabled={!candidate.available || !!schemaEdit.candidate?.authoringDraft}
                  onChange={() => choose({ id: candidate.id, candidate } as StudioModule)}
                />
                {candidate.title ?? 'Unavailable source'} · {candidate.source?.version}
              </label>
            ))}
            {schemaEdit.candidate?.authoringDraft ? (
              <p className="text-sm">
                This edited candidate pins its exact Base. Edit its definition without replacing the
                source selection.
              </p>
            ) : null}
            <Link href={browseHref}>Browse more source releases</Link>
            <Button
              disabled={
                !persistedTarget ||
                !selection.length ||
                schemaEdit.pending ||
                !!schemaEdit.candidate?.authoringDraft
              }
              onClick={() =>
                void saveDefinition(localContribution, 'Select Schema sources')
                  .then(() => setAdvanced(false))
                  .catch((cause) =>
                    setError(
                      cause instanceof Error ? cause.message : 'Candidate could not be saved.'
                    )
                  )
              }
            >
              Save selected modules
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!review}
        onOpenChange={(open) => {
          if (!open && !applying) setReview(undefined);
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-4xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {review?.workspace?.canBind ? 'Apply exact definition' : 'Review Schema changes'}
            </DialogTitle>
            <DialogDescription>
              {review?.workspace?.canBind ? (
                `${target?.title} · revision ${review.workspace.revision}. Bind this exact Schema to the empty Workspace. Fill required content later; Review and Commit still validate it.`
              ) : (
                <>
                  {target?.title} · revision {review?.workspace?.revision}. Review definition
                  changes and their effect on current Workspace content. Adopt saves a pending
                  preparation task and returns to this Workspace. Your current Schema, content and
                  proposals remain unchanged.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {review ? (
            <>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
                <div className="space-y-1 text-xs">
                  {review.sources.map((source) => (
                    <p className="font-mono" key={source.artifactVersionId}>
                      {source.canonicalName} · {source.version}
                    </p>
                  ))}
                </div>
                <div className="grid min-w-0 gap-6 sm:grid-cols-2">
                  <section aria-label="Schema definition changes" className="min-w-0">
                    <h3 className="text-sm font-medium">Definition changes</h3>
                    <StudioChanges changes={review.workspace?.changes ?? []} />
                  </section>
                  <div className="min-w-0">
                    <h3 className="mb-3 text-sm font-medium">Content impact</h3>
                    <StudioImpactPreview impact={review.impact ?? null} />
                  </div>
                </div>
                {hasSchemaEdit && !savedCandidateRef ? (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Save the local candidate before adopting it.
                  </p>
                ) : null}
                <details className="text-xs">
                  <summary className="cursor-pointer">Reviewed definition hash</summary>
                  <p className="mt-2 break-all font-mono">{review.schemaHash}</p>
                </details>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-[var(--stroke-divider)] pt-3">
                <Button disabled={applying} onClick={() => setReview(undefined)} variant="outline">
                  Cancel
                </Button>
                <Button
                  hidden={review.workspace?.canBind}
                  variant="outline"
                  disabled={
                    applying ||
                    !savedCandidateRef ||
                    !review.impact?.canPublish ||
                    !review.report.valid ||
                    !review.adoption.allowed ||
                    review.reviewHash !== data?.reviewHash
                  }
                  onClick={() => {
                    setPublishReview(review);
                    setReview(undefined);
                  }}
                >
                  Publish public Schema
                </Button>
                <Button
                  hidden={review.workspace?.canBind}
                  variant="outline"
                  disabled={
                    applying ||
                    !review.report.valid ||
                    !review.adoption.allowed ||
                    review.impact?.status === 'blocked' ||
                    (hasSchemaEdit && !savedCandidateRef) ||
                    review.reviewHash !== data?.reviewHash ||
                    !review.workspace
                  }
                  onClick={() => {
                    if (!review.workspace) return;
                    setPreparation({
                      workspaceId: review.workspace.id,
                      revision: review.workspace.revision,
                      target: {
                        kind: 'studio',
                        candidateIds: [...selection],
                        reviewHash: review.reviewHash,
                        ...(savedCandidateRef ? { schemaEditCandidate: savedCandidateRef } : {}),
                      },
                    });
                    setReview(undefined);
                  }}
                >
                  Prepare content & mappings
                </Button>
                <Button
                  disabled={
                    applying ||
                    (hasSchemaEdit && !savedCandidateRef) ||
                    !review.impact?.canAdopt ||
                    !review.report.valid ||
                    !review.adoption.allowed ||
                    review.reviewHash !== data?.reviewHash
                  }
                  onClick={() => void apply()}
                >
                  {applying
                    ? 'Saving…'
                    : review.workspace?.canBind
                      ? 'Confirm & apply'
                      : 'Adopt & return to Workspace'}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      {target ? (
        <Link className="sr-only" href={workspaceLink}>
          Review in Workspace <ArrowRight />
        </Link>
      ) : null}
      {preparation ? (
        <SchemaContentPreparationDialog
          projectId={projectId}
          workspaceId={preparation.workspaceId}
          revision={preparation.revision}
          target={preparation.target}
          open
          onOpenChange={(open) => {
            if (!open) setPreparation(undefined);
          }}
          onPrepared={async () => {
            await workspaces.refresh();
            router.push(workspaceLink);
          }}
        />
      ) : null}
      {publishReview && publishReview.workspace?.id === workspaceId ? (
        <StudioPublishDialog
          key={`${workspaceId}:${publishReview.reviewHash}`}
          projectId={projectId}
          workspaceId={workspaceId}
          candidateIds={[...selection]}
          preview={publishReview}
          currentReviewHash={data?.reviewHash}
          onOpenChange={(open) => {
            if (!open) setPublishReview(undefined);
          }}
        />
      ) : null}
    </section>
  );
}

function contributionHasContent(contribution: Record<string, unknown>): boolean {
  return (
    ['nodes', 'relationTypes'].some((key) => {
      const value = contribution[key];
      return Boolean(value && typeof value === 'object' && Object.keys(value).length);
    }) ||
    (Array.isArray(contribution.rules) && contribution.rules.length > 0)
  );
}
