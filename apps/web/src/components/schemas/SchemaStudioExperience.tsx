'use client';

import type { StudioCandidate, StudioPreview } from '@t3x-dev/api-client';
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
import { useBranches } from '@/hooks/shared/useBranches';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import { useWorkspaceFlow } from '@/hooks/workspaces/useWorkspaceFlow';
import moduleStyles from './AddModulesDialog.module.css';
import { SchemaStudioSurface } from './SchemaStudioSurface';
import { StudioChanges } from './StudioDefinitionPreview';

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
  children,
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
  const [advanced, setAdvanced] = useState(false);
  const [review, setReview] = useState<StudioPreview>();
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
  const preview = useStudioPreview(
    projectId,
    {
      candidateIds: selection,
      ...(persistedTarget ? { workspaceId: persistedTarget.id } : {}),
    },
    persistedTarget?.revision
  );
  const data = preview.data;
  const locked = new Set(
    data?.modules.filter((item) => item.requiredBy.length).map((item) => item.candidateId)
  );
  const candidateSelectionKey = JSON.stringify(selection);

  useEffect(() => {
    setReview(undefined);
    setError(undefined);
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
    setActiveModuleId(module.id);
    if (!module.candidate) return;
    const candidate = module.candidate;
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
    setApplying(true);
    setError(undefined);
    try {
      await applySelection({
        candidateIds: [...selection],
        workspaceId: reviewWorkspace.id,
        ifRevision: reviewWorkspace.revision,
        reviewHash: review.reviewHash,
      });
      if (!mounted.current) return;
      const applied = draftWorkspaces.find((item) => item.id === reviewWorkspace.id) ?? target;
      const href = applied
        ? `${getProjectIdWorkspacePath(projectId, { branch: applied.targetBranch })}&workspace=${encodeURIComponent(applied.id)}`
        : getProjectIdWorkspacePath(projectId);
      router.push(href);
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : 'Apply failed');
        setReview(undefined);
        preview.refresh();
      }
    } finally {
      if (mounted.current) setApplying(false);
    }
  }

  function openReview() {
    if (target && data?.workspace?.id === target.id && data?.report.valid && data?.adoption.allowed)
      setReview(data);
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

  const canReview =
    !!target &&
    data?.workspace?.id === target.id &&
    !!data?.report.valid &&
    !!data?.adoption.allowed &&
    !applying;
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
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white"
    >
      {!workspaces.loading && !workspaces.error && workspaceId && !target ? (
        <p className="px-6 py-2 text-sm text-red-700" role="alert">
          Workspace {workspaceId} was not found in this project. Select a valid Workspace before
          applying.
        </p>
      ) : null}
      {error ? (
        <p className="px-6 py-2 text-sm text-red-700" role="alert">
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
        error={candidates.error || preview.error || workspaces.error || undefined}
        data={data}
        onCheck={() => {
          preview.refresh();
          void workspaces.refresh();
        }}
        onAdd={() => setAdvanced(true)}
        onReview={openReview}
        canReview={canReview}
        onDownload={downloadDefinition}
        onClear={() => setSelection([])}
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
          <div className={moduleStyles.body}>{children}</div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!review}
        onOpenChange={(open) => {
          if (!open && !applying) setReview(undefined);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Apply exact definition</DialogTitle>
            <DialogDescription>
              {target?.title} · revision {review?.workspace?.revision}. Previous checks and proposed
              operations will be invalidated.
            </DialogDescription>
          </DialogHeader>
          {review ? (
            <>
              <div className="space-y-1 text-xs">
                {review.sources.map((source) => (
                  <p className="font-mono" key={source.artifactVersionId}>
                    {source.canonicalName} · {source.version}
                  </p>
                ))}
              </div>
              <StudioChanges changes={review.workspace?.changes ?? []} />
              <details className="text-xs">
                <summary className="cursor-pointer">Reviewed definition hash</summary>
                <p className="mt-2 break-all font-mono">{review.schemaHash}</p>
              </details>
              <div className="flex justify-end gap-3">
                <Button disabled={applying} onClick={() => setReview(undefined)} variant="outline">
                  Cancel
                </Button>
                <Button
                  disabled={applying || review.reviewHash !== data?.reviewHash}
                  onClick={() => void apply()}
                >
                  {applying ? 'Applying…' : 'Confirm & apply'}
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
    </section>
  );
}
