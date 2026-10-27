'use client';

import type { SchemaPreparationTarget, StudioCandidate, StudioPreview } from '@t3x-dev/api-client';
import { dump } from 'js-yaml';
import { ChevronDown } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import { schemaFieldRows } from '@/domain/schemas/schemaFieldEditing';
import {
  schemaBrowseHref,
  schemaSourceHref,
  schemaWorkspaceHref,
} from '@/domain/schemas/schemaNavigation';
import { type SchemaSourcePin, schemaSourceKey } from '@/domain/schemas/schemaProvenance';
import {
  pruneSchemaMappings,
  type SchemaSourceMappings,
} from '@/domain/schemas/schemaSourceMappings';
import {
  listStudioDraftWorkspaces,
  listStudioWorkspacesForBranches,
  resolveStudioWorkspaceId,
} from '@/domain/workspaces/studioTargets';
import { useSchemaDraftStatus } from '@/hooks/schemas/useSchemaDraftStatus';
import { useSchemaReviewFlow } from '@/hooks/schemas/useSchemaReviewFlow';
import { useSchemaSourceIdentities } from '@/hooks/schemas/useSchemaSourceIdentities';
import { useStudioCandidates } from '@/hooks/schemas/useStudioCandidates';
import { useStudioPreview } from '@/hooks/schemas/useStudioPreview';
import { useStudioSchemaEditCandidate } from '@/hooks/schemas/useStudioSchemaEditCandidate';
import { useWorkspaceSchemaPending } from '@/hooks/schemas/useWorkspaceSchemaPending';
import { useBranches } from '@/hooks/shared/useBranches';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import { useWorkspaceFlow } from '@/hooks/workspaces/useWorkspaceFlow';
import { SchemaContentPreparationDialog } from './SchemaContentPreparationDialog';
import { SchemaDataEditor } from './SchemaDataEditor';
import { SchemaDefinitionWorkbench } from './SchemaDefinitionWorkbench';
import { SchemaSourceCompositionDialog } from './SchemaSourceCompositionDialog';
import { SchemaSourceManager } from './SchemaSourceManager';
import { SchemaStudioSurface } from './SchemaStudioSurface';
import { StudioChanges, StudioChecks, StudioImpactPreview } from './StudioDefinitionPreview';
import { StudioPublishDialog } from './StudioPublishDialog';
import type { SchemaEditorNavigation } from './useSchemaNavigationGuard';

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
  const pathname = usePathname();
  const candidates = useStudioCandidates(projectId);
  const workspaces = useProjectWorkspaces(projectId);
  const projectBranches = useBranches(projectId, true);
  const { saveDraft } = useWorkspaceFlow();
  const ensuringBranches = useRef(new Map<string, Promise<void>>());
  const [selection, setSelection] = useState<string[]>([]);
  const navigationRef = useRef<SchemaEditorNavigation | null>(null);
  const reviewFlow = useSchemaReviewFlow(projectId);
  const requestedWorkspaceId = params?.get('workspace') ?? '';
  const requestedBranch = params?.get('branch');
  const query = params?.toString() ?? '';
  const legacyView = params?.get('schemaView') === 'active';
  const [definitionOpen, setDefinitionOpen] = useState(false);
  const [sourceManagerOpen, setSourceManagerOpen] = useState(false);
  const [compositionRequest, setCompositionRequest] = useState<{
    ids: string[];
    revision: number;
    base?: Record<string, unknown>;
    current?: Record<string, unknown>;
    choices?: Record<string, string>;
  }>();
  const [editorReset, setEditorReset] = useState(0);
  const [blankWorkspace, setBlankWorkspace] = useState<string>();
  const [editorInvalid, setEditorInvalid] = useState(false);
  const [dataDirty, setDataDirty] = useState(false);
  const [dataCanSave, setDataCanSave] = useState(false);
  const dataDirtyRef = useRef(false);
  const updateDataDirty = useCallback((dirty: boolean) => {
    dataDirtyRef.current = dirty;
    setDataDirty(dirty);
  }, []);
  const [editorBase, setEditorBase] = useState<{
    schema: Record<string, unknown>;
    hash: string;
    initial: Record<string, unknown>;
  }>();
  const [localContribution, setLocalContribution] = useState<Record<string, unknown>>({});
  const [schemaDefinition, setSchemaDefinition] = useState<Record<string, unknown>>();
  const [sourceMappings, setSourceMappings] = useState<SchemaSourceMappings>([]);
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
  const workspaceId = resolveStudioWorkspaceId(
    draftWorkspaces,
    requestedWorkspaceId,
    requestedBranch
  );
  const target = draftWorkspaces.find((item) => item.id === workspaceId);
  useEffect(() => {
    if (!target || workspaces.loading || projectBranches.loading) return;
    if (
      !legacyView &&
      requestedWorkspaceId === target.id &&
      requestedBranch === target.targetBranch
    )
      return;
    router.replace(schemaWorkspaceHref(pathname, query, target), { scroll: false });
  }, [
    legacyView,
    pathname,
    query,
    requestedBranch,
    requestedWorkspaceId,
    router,
    target,
    workspaces.loading,
    projectBranches.loading,
  ]);

  function changeWorkspace(id: string) {
    const next = draftWorkspaces.find((item) => item.id === id);
    if (!next || next.id === workspaceId || applying) return;
    const navigate = () =>
      router.push(schemaWorkspaceHref(pathname, query, next, true), { scroll: false });
    if (navigationRef.current) navigationRef.current.requestNavigation(navigate);
    else navigate();
  }
  const persistedTarget = listStudioDraftWorkspaces(workspaces.workspaces).find(
    (item) => item.id === workspaceId
  );
  const schemaEdit = useStudioSchemaEditCandidate(
    projectId,
    persistedTarget?.id ?? '',
    persistedTarget?.revision
  );
  const currentBinding = persistedTarget?.schemaBindings?.[0];
  const creatingBlank = blankWorkspace === workspaceId;
  const draftView = useSchemaDraftStatus(
    projectId,
    persistedTarget?.id ?? '',
    persistedTarget?.revision
  );
  const savedEditIsApplied =
    !!currentBinding?.schemaHash &&
    schemaEdit.candidate?.authoringDraft?.resultSchemaHash === currentBinding.schemaHash;
  const savedEditUsesBinding =
    !!currentBinding?.schemaHash &&
    schemaEdit.candidate?.authoringDraft?.base?.kind === 'composition' &&
    schemaEdit.candidate.authoringDraft.base.schemaHash === currentBinding.schemaHash;
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
  const [recoveredEditIdentity, setRecoveredEditIdentity] = useState('');
  const [usingSavedCandidate, setUsingSavedCandidate] = useState(false);
  const activeCandidate = usingSavedCandidate && !savedEditIsApplied ? schemaEdit.candidate : null;
  const editIdentity = `${projectId}:${workspaceId}:${recoveredCandidateKey}:${savedEditIsApplied}`;
  const missingEditSources = (schemaEdit.candidate?.baseSources ?? []).filter(
    (base) =>
      !candidates.items.some(
        (candidate) =>
          candidate.available &&
          candidate.source &&
          schemaSourceKey(candidate.source) === schemaSourceKey(base)
      )
  );
  const recoveryError =
    !schemaEdit.loading &&
    !candidates.loading &&
    recoveredEditIdentity !== editIdentity &&
    !savedEditIsApplied &&
    !savedEditUsesBinding &&
    missingEditSources.length
      ? `The saved Schema candidate needs missing sources: ${missingEditSources.map((source) => `${source.canonicalName} @ ${source.version}`).join(', ')}. Restore them in Sources, or select another source to start a new definition. The saved candidate is preserved until you save.`
      : undefined;
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
    } else if (schemaEdit.candidate && !savedEditIsApplied && !savedEditUsesBinding) {
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
      // An empty picker means continue the exact bound snapshot, not an empty editor.
      setSelection([]);
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
    savedEditIsApplied,
    savedEditUsesBinding,
  ]);
  useEffect(() => {
    if (schemaEdit.loading || candidates.loading || dataDirtyRef.current) return;
    if (recoveredEditIdentity === editIdentity) return;
    if (savedEditIsApplied || savedEditUsesBinding) setSelection([]);
    else if (schemaEdit.candidate?.baseSources?.length) {
      const ids = schemaEdit.candidate.baseSources.map(
        (base) =>
          candidates.items.find(
            (candidate) =>
              candidate.available &&
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
    setRecoveredEditIdentity(editIdentity);
    setUsingSavedCandidate(!!schemaEdit.candidate && !savedEditIsApplied);
    setSourceMappings(structuredClone(schemaEdit.candidate?.authoringDraft?.sourceMappings ?? []));
    setReview(undefined);
    setPublishReview(undefined);
    setDefinitionOpen(false);
    setEditorBase(undefined);
    setLocalContribution(
      structuredClone(!savedEditIsApplied ? (schemaEdit.candidate?.localContribution ?? {}) : {})
    );
    setSchemaDefinition(undefined);
    setSavedCandidateRef(
      schemaEdit.candidate && !savedEditIsApplied
        ? {
            candidateId: schemaEdit.candidate.candidateId,
            revision: schemaEdit.candidate.revision,
          }
        : undefined
    );
  }, [
    candidates.items,
    candidates.loading,
    editIdentity,
    projectId,
    recoveredCandidateKey,
    recoveredEditIdentity,
    dataDirty,
    schemaEdit.candidate,
    schemaEdit.loading,
    workspaceId,
    savedEditIsApplied,
    savedEditUsesBinding,
  ]);

  useEffect(() => {
    setDefinitionOpen(false);
    setBlankWorkspace(undefined);
    setEditorBase(undefined);
    setSchemaDefinition(undefined);
    setApplying(false);
    setPreparation(undefined);
  }, [workspaceId]);

  const previewInput = {
    ...(activeCandidate?.composition ? { composition: activeCandidate.composition } : {}),
    candidateIds: selection,
    ...(persistedTarget && (selection.length || currentBinding || creatingBlank || activeCandidate)
      ? { workspaceId: persistedTarget.id }
      : {}),
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
                  sourceMappings,
                  baseSchemaHash: editorBase?.hash ?? basePreview.data?.schemaHash,
                }
              : { localContribution }),
        }
      : { candidateIds: [] },
    persistedTarget?.revision
  );
  const preview = hasSchemaEdit ? localPreview : basePreview;
  const data = preview.data;
  const sourcePins = useMemo(
    () => [
      ...candidates.items
        .filter((candidate) => candidate.available)
        .map((candidate) => candidate.source)
        .filter((source): source is SchemaSourcePin => !!source),
      ...Object.values(data?.nodeProvenance?.byPath ?? {}).flatMap((refs) =>
        refs.flatMap((ref) => (ref.source ? [ref.source] : []))
      ),
    ],
    [candidates.items, selection, data?.nodeProvenance]
  );
  const sourceIdentities = useSchemaSourceIdentities(sourcePins);
  const wholeSchemaSource =
    data?.sources.length === 1 &&
    candidates.items.some(
      (candidate) =>
        candidate.kind === 'schema' &&
        candidate.source &&
        schemaSourceKey(candidate.source) === schemaSourceKey(data.sources[0])
    )
      ? data.sources[0]
      : undefined;
  // Do not initialize Data with the base result while a saved edit is being recovered.
  const recoveredDefinitionReady = !schemaEdit.loading && recoveredEditIdentity === editIdentity;
  const locked = new Set(
    data?.modules.filter((item) => item.requiredBy.length).map((item) => item.candidateId)
  );
  const candidateSelectionKey = JSON.stringify(selection);

  useEffect(() => {
    setReview(undefined);
  }, [candidateSelectionKey, workspaceId, data?.reviewHash]);
  useEffect(() => {
    setError(undefined);
  }, [candidateSelectionKey, workspaceId]);

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
  const selectedWorkspaceTitle =
    target?.title ??
    (workspaceId || requestedBranch ? 'Workspace unavailable' : 'No draft workspace');

  function composeSources(sourceId?: string) {
    setCompositionRequest({
      ids: sourceId ? [...new Set([...selection, sourceId])] : [...selection],
      revision: schemaEdit.candidate?.revision ?? 0,
      base: structuredClone(
        editorBase?.schema ??
          activeCandidate?.baseDefinition ??
          basePreview.data?.workspace?.boundSchema ??
          basePreview.data?.schema
      ),
      current: structuredClone(schemaDefinition ?? data?.schema),
      choices: sourceId && !selection.includes(sourceId) ? {} : activeCandidate?.composition,
    });
  }

  function choose(module: StudioModule) {
    if (dataDirtyRef.current) return;
    recoveredSelection.current = recoveryKey;
    if (!module.candidate) return;
    const candidate = module.candidate;
    setRecoveredEditIdentity(editIdentity);
    setUsingSavedCandidate(false);
    setBlankWorkspace(undefined);
    setSourceMappings([]);
    setEditorBase(undefined);
    setLocalContribution({});
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

  function inspectDefinition() {
    if (!data) return;
    const matchesWorkspace = target && data.workspace?.id === target.id;
    setReview({
      ...data,
      workspace: matchesWorkspace ? data.workspace : null,
      impact: matchesWorkspace ? data.impact : null,
    });
  }

  const reviewScope = `${projectId}:${workspaceId}`;
  const activeReviewScope = useRef(reviewScope);
  activeReviewScope.current = reviewScope;

  async function openReview() {
    if (applying || editorInvalid) return;
    if (!persistedTarget) return inspectDefinition();
    setApplying(true);
    setError(undefined);
    const targetId = persistedTarget.id;
    const isCurrent = () => mounted.current && activeReviewScope.current === reviewScope;
    try {
      let edit = savedCandidateRef;
      if (dataDirty) {
        if (!(await navigationRef.current?.save?.())) return;
        const saved = await reviewFlow.readEdit(targetId);
        if (!saved) throw new Error('Saved Schema changes are unavailable. Retry saving.');
        edit = { candidateId: saved.candidateId, revision: saved.revision };
      }
      if (!isCurrent()) return;
      await reviewFlow.ensureAuthoring(targetId);
      if (!isCurrent()) return;
      const fresh = await reviewFlow.preview({
        workspaceId: targetId,
        candidateIds: [...selection],
        ...(edit ? { schemaEditCandidate: edit } : {}),
      });
      if (!isCurrent()) return;
      if (!fresh.report.valid || !fresh.adoption.allowed || fresh.impact?.status === 'blocked') {
        setReview(fresh);
        return;
      }
      if (!fresh.workspace) throw new Error('The target Workspace is unavailable.');
      if (
        fresh.workspace.binding === null ||
        fresh.workspace.changes.length ||
        fresh.workspace.canBind ||
        fresh.impact?.content.ready === false
      ) {
        const target: SchemaPreparationTarget = {
          kind: 'studio',
          candidateIds: [...selection],
          reviewHash: fresh.reviewHash,
          ...(edit ? { schemaEditCandidate: edit } : {}),
        };
        const input = {
          target,
          ifRevision: fresh.workspace.revision,
          commands: [],
          confirmedChanges: [],
        };
        const checked = await reviewFlow.previewContent(targetId, input);
        if (!isCurrent()) return;
        if (!checked.canPrepare) {
          setPreparation({ workspaceId: targetId, revision: fresh.workspace.revision, target });
          return;
        }
        // Schema-only changes need no separate adoption or migration confirmation.
        await reviewFlow.prepareContent(targetId, {
          ...input,
          previewHash: checked.previewHash,
          requestId: crypto.randomUUID(),
        });
      }
      if (!isCurrent()) return;
      const href = await reviewFlow.review(targetId);
      if (isCurrent()) router.push(href);
    } catch (cause) {
      if (isCurrent())
        setError(cause instanceof Error ? cause.message : 'Could not prepare Review.');
    } finally {
      if (isCurrent()) {
        setApplying(false);
        void workspaces.refresh();
        preview.refresh();
      }
    }
  }

  function downloadDefinition() {
    if (!data?.schema) return;
    const blob = new Blob([dump(data.schema, { noRefs: true, lineWidth: 100 })], {
      type: 'application/yaml',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'schema-studio-definition.yaml';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function saveDefinition(
    contribution: Record<string, unknown>,
    intent: string,
    mappings = sourceMappings
  ) {
    if (!persistedTarget)
      throw new Error('Create or select a persisted Workspace before saving a Schema candidate.');
    if (!selection.length && !currentBinding && !creatingBlank && !activeCandidate)
      throw new Error('Create a blank Schema or choose a source first.');
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
            sourceMappings: pruneSchemaMappings(mappings, contribution),
            baseSchemaHash: editorBase?.hash ?? basePreview.data?.schemaHash,
            ...(!usingSavedCandidate && schemaEdit.candidate ? { rebase: true } : {}),
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
      setLocalContribution(structuredClone(activeCandidate?.localContribution ?? {}));
      setSourceMappings(structuredClone(activeCandidate?.authoringDraft?.sourceMappings ?? []));
      setSavedCandidateRef(
        activeCandidate
          ? {
              candidateId: activeCandidate.candidateId,
              revision: activeCandidate.revision,
            }
          : undefined
      );
    }
    setDefinitionOpen(open);
  }

  const canReview =
    !!data &&
    !applying &&
    !editorInvalid &&
    !preview.loading &&
    !definitionOpen &&
    (dataDirty || !!savedCandidateRef || selection.length > 0 || draftView?.hasChanges !== false);
  const browseHref = schemaBrowseHref(
    projectId,
    workspaceId,
    target?.targetBranch ?? requestedBranch ?? undefined
  );
  const sourceHref = schemaSourceHref(
    params?.get('returnTo') ?? null,
    projectId,
    workspaceId,
    target?.targetBranch ?? requestedBranch ?? undefined
  );

  const sourceManagement = (
    <SchemaSourceManager
      open={sourceManagerOpen}
      onOpenChange={setSourceManagerOpen}
      browseHref={browseHref}
      modules={visibleSources.flatMap((source) => source.modules)}
      composition={composition}
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
      locked={
        dataDirty || definitionOpen ? new Set(candidates.items.map((item) => item.id)) : locked
      }
      pending={applying || preview.loading || candidates.pending}
      contextLocked={dataDirty || definitionOpen || applying}
      loading={candidates.loading}
      error={candidates.error || undefined}
      data={data}
      onAdd={persistedTarget ? () => composeSources() : undefined}
      onClear={
        dataDirty
          ? undefined
          : () => {
              recoveredSelection.current = recoveryKey;
              setRecoveredEditIdentity(editIdentity);
              setUsingSavedCandidate(false);
              setSourceMappings([]);
              setSavedCandidateRef(undefined);
              setEditorBase(undefined);
              setSchemaDefinition(undefined);
              setLocalContribution({});
              setSelection([]);
            }
      }
    />
  );

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
      {!workspaces.loading && !workspaces.error && !workspaceId && requestedBranch && !target ? (
        <p className="px-6 py-2 text-sm text-[var(--status-error)]" role="alert">
          No Workspace is available for branch {requestedBranch}. Select a valid Workspace before
          editing.
        </p>
      ) : null}
      {error ? (
        <p className="px-6 py-2 text-sm text-[var(--status-error)]" role="alert">
          {error} Review the refreshed selection before trying again.
        </p>
      ) : null}
      <SchemaStudioSurface
        hidden={!!preparation}
        navigation={navigation}
        contextLocked={dataDirty || definitionOpen || applying}
        editorInvalid={editorInvalid}
        dataEditor={() => (
          <SchemaDataEditor
            navigationRef={navigationRef}
            showSaveAction={false}
            onSaveAvailabilityChange={setDataCanSave}
            onValidationChange={setEditorInvalid}
            provenance={data}
            sourceIdentities={sourceIdentities}
            wholeSchemaSource={wholeSchemaSource}
            projectId={projectId}
            sources={candidates.items}
            sourceManagement={sourceManagement}
            baseDefinition={
              editorBase?.schema ??
              activeCandidate?.baseDefinition ??
              basePreview.data?.workspace?.boundSchema ??
              basePreview.data?.schema
            }
            initialSourceMappings={activeCandidate?.authoringDraft?.sourceMappings}
            onComposeSources={persistedTarget ? composeSources : undefined}
            layoutKey={`${projectId}:${workspaceId}`}
            key={`${projectId}:${workspaceId}:${candidateSelectionKey}:${editorReset}`}
            initiallyDirty={creatingBlank && !savedCandidateRef}
            onCreateBlank={
              persistedTarget &&
              !currentBinding &&
              !selection.length &&
              !activeCandidate &&
              !creatingBlank
                ? () => setBlankWorkspace(workspaceId)
                : undefined
            }
            onChooseSources={() => setSourceManagerOpen(true)}
            initialDefinition={
              editorBase?.initial ??
              ((selection.length || currentBinding || creatingBlank || activeCandidate) &&
              recoveredDefinitionReady &&
              data
                ? !hasSchemaEdit && basePreview.data?.workspace?.boundSchema
                  ? basePreview.data.workspace.boundSchema
                  : data.schema
                : undefined)
            }
            revisionKey={`${workspaceId}:${recoveredCandidateKey}:${candidateSelectionKey}`}
            disabledReason={
              !persistedTarget ? 'Select a saved Workspace to edit its Schema.' : undefined
            }
            pending={schemaEdit.pending || applying}
            loading={
              workspaces.loading ||
              projectBranches.loading ||
              pendingSchema.loading ||
              preview.loading ||
              schemaEdit.loading ||
              candidates.loading
            }
            previewError={
              workspaces.error ||
              recoveryError ||
              schemaEdit.error ||
              candidates.error ||
              preview.error
            }
            onRetry={() => {
              void workspaces.refresh();
              void candidates.refresh();
              void schemaEdit.refresh();
              preview.refresh();
            }}
            onDirtyChange={updateDataDirty}
            onPreview={(definition, mappings) => {
              setSourceMappings(mappings ?? []);
              if (!editorBase && basePreview.data && data) {
                setEditorBase({
                  schema: structuredClone(
                    activeCandidate?.baseDefinition ??
                      basePreview.data.workspace?.boundSchema ??
                      basePreview.data.schema
                  ),
                  hash: activeCandidate?.baseDefinition
                    ? String(activeCandidate.authoringDraft?.base.schemaHash)
                    : basePreview.data.schemaHash,
                  initial: structuredClone(
                    !hasSchemaEdit && basePreview.data.workspace?.boundSchema
                      ? basePreview.data.workspace.boundSchema
                      : data.schema
                  ),
                });
              }
              setSchemaDefinition(definition);
              setSavedCandidateRef(undefined);
              setReview(undefined);
            }}
            onDiscard={() => {
              updateDataDirty(false);
              setBlankWorkspace(undefined);
              setSchemaDefinition(undefined);
              setEditorBase(undefined);
              setEditorReset((value) => value + 1);
              changeDefinitionOpen(false);
            }}
            onSave={async (definition, intent, mappings) => {
              await saveDefinition(definition, intent, mappings);
              setEditorBase(undefined);
              updateDataDirty(false);
            }}
          />
        )}
        sourceHref={sourceHref}
        branch={target?.targetBranch}
        draftStatus={
          dataDirty
            ? 'Unsaved changes'
            : savedCandidateRef
              ? 'Changes saved · not committed'
              : draftView?.hasChanges === false && draftView.basis.refHead
                ? `Committed · ${draftView.basis.refHead.slice(7, 19)}`
                : draftView?.hasChanges === true
                  ? 'Saved to Draft · not committed'
                  : undefined
        }
        bindingStatus={
          persistedTarget
            ? currentBinding
              ? `Draft Schema: ${currentBinding.schemaName ?? currentBinding.canonicalName} · ${currentBinding.version}`
              : 'No Schema applied to this Workspace.'
            : undefined
        }
        workspaceTitle={selectedWorkspaceTitle}
        workspaceId={workspaceId}
        workspaces={draftWorkspaces}
        onWorkspace={changeWorkspace}
        pending={applying || preview.loading || candidates.pending}
        loading={candidates.loading}
        error={
          candidates.error || schemaEdit.error || preview.error || workspaces.error || undefined
        }
        data={data}
        onEditDefinition={
          !dataDirty &&
          persistedTarget &&
          (selection.length || currentBinding || creatingBlank || activeCandidate)
            ? () => {
                if (!basePreview.data || !data) return;
                setEditorBase({
                  schema: structuredClone(
                    activeCandidate?.baseDefinition ??
                      basePreview.data.workspace?.boundSchema ??
                      basePreview.data.schema
                  ),
                  hash: activeCandidate?.baseDefinition
                    ? String(activeCandidate.authoringDraft?.base.schemaHash)
                    : basePreview.data.schemaHash,
                  initial: structuredClone(
                    !hasSchemaEdit && basePreview.data.workspace?.boundSchema
                      ? basePreview.data.workspace.boundSchema
                      : data.schema
                  ),
                });
                setDefinitionOpen(true);
              }
            : undefined
        }
        onReview={() => void openReview()}
        onSave={() => void navigationRef.current?.save?.()}
        canSave={dataCanSave && !definitionOpen && !applying && !schemaEdit.pending}
        onInspect={inspectDefinition}
        canReview={canReview}
        onDownload={downloadDefinition}
      />
      {compositionRequest ? (
        <SchemaSourceCompositionDialog
          projectId={projectId}
          workspaceId={persistedTarget?.id ?? ''}
          candidates={candidates.items}
          selection={compositionRequest.ids}
          initialComposition={compositionRequest.choices}
          baseDefinition={compositionRequest.base}
          currentDefinition={compositionRequest.current}
          onClose={() => setCompositionRequest(undefined)}
          onSave={async (ids, composition, combined, definition) => {
            if (!persistedTarget) throw new Error('Select a saved Workspace.');
            const retainedMappings = pruneSchemaMappings(sourceMappings, definition);
            const previousRows = new Map(
              schemaFieldRows(compositionRequest.base ?? {}).map((row) => [row.path, row])
            );
            const nextRows = new Map(
              schemaFieldRows(combined.schema).map((row) => [row.path, row])
            );
            for (const mapping of retainedMappings.filter((entry) => !entry.source)) {
              const key = JSON.stringify(mapping.from),
                previous = previousRows.get(key),
                next = nextRows.get(key);
              if (
                !previous ||
                !next ||
                JSON.stringify(previous.definition) !== JSON.stringify(next.definition) ||
                JSON.stringify(basePreview.data?.origins[previous.semanticPath]) !==
                  JSON.stringify(combined.origins[next.semanticPath])
              )
                throw new Error(
                  'This combination changes the source of a moved item. Undo that move before changing its source selection. Your draft is preserved.'
                );
            }
            const saved = await schemaEdit.save({
              workspaceId: persistedTarget.id,
              candidateIds: ids,
              ifRevision: compositionRequest.revision,
              retryKey: `studio-rebase:${crypto.randomUUID()}`,
              origin: 'studio',
              intent: 'Combine pinned Schema sources and preserve local edits.',
              localContribution: {},
              schemaDefinition: definition,
              sourceMappings: retainedMappings,
              baseSchemaHash: combined.schemaHash,
              composition,
              rebase: true,
            });
            setEditorReset((value) => value + 1);
            setSelection(ids);
            setEditorBase(undefined);
            setSchemaDefinition(undefined);
            setLocalContribution({});
            setSavedCandidateRef({
              candidateId: saved.candidate.candidateId,
              revision: saved.candidate.revision,
            });
            setReview(undefined);
            updateDataDirty(false);
            await workspaces.refresh();
          }}
        />
      ) : null}
      <SchemaDefinitionWorkbench
        baseSchema={definitionOpen ? editorBase?.schema : basePreview.data?.schema}
        initialContribution={localContribution}
        initialDefinition={schemaDefinition ?? (definitionOpen ? editorBase?.initial : undefined)}
        onOpenChange={changeDefinitionOpen}
        onPreview={(contribution) => {
          if (contribution.yschema === '0.1') {
            setSchemaDefinition(contribution);
            setSourceMappings((current) => pruneSchemaMappings(current, contribution));
          } else setLocalContribution(contribution);
          setSavedCandidateRef(undefined);
        }}
        onSave={saveDefinition}
        open={definitionOpen}
        pending={schemaEdit.pending}
        previewError={preview.error}
        recoveryLabel={
          activeCandidate
            ? `Recovered candidate revision ${activeCandidate.revision} · ${activeCandidate.origin.channel}`
            : schemaEdit.loading
              ? 'Recovering the Workspace candidate…'
              : 'New Workspace-local candidate'
        }
        resultSchema={data?.schema}
      />
      <Dialog
        open={!!review}
        onOpenChange={(open) => {
          if (!open && !applying) setReview(undefined);
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-4xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>Schema checks</DialogTitle>
            <DialogDescription>
              Definition checks and current content impact. Saving a Draft does not commit it. Use
              Review Schema changes to inspect the complete Draft and make a decision.
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
                <StudioChecks preview={review} />
                {review.workspace ? (
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
                ) : null}
                {hasSchemaEdit && !savedCandidateRef ? (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Review saves these edits before creating the complete Draft snapshot.
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" aria-label="Review actions" disabled={applying}>
                      More <ChevronDown size={14} aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        setReview(undefined);
                        preview.refresh();
                        pendingSchema.refresh();
                        void workspaces.refresh();
                      }}
                    >
                      Refresh checks
                    </DropdownMenuItem>
                    {review.workspace && !review.workspace.canBind ? (
                      <DropdownMenuItem
                        disabled={
                          applying ||
                          !savedCandidateRef ||
                          !review.impact?.canPublish ||
                          !review.report.valid ||
                          !review.adoption.allowed ||
                          review.reviewHash !== data?.reviewHash
                        }
                        onSelect={() => {
                          setPublishReview(review);
                          setReview(undefined);
                        }}
                      >
                        Publish public Schema
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  disabled={
                    applying ||
                    !review.workspace ||
                    !review.report.valid ||
                    !review.adoption.allowed ||
                    review.impact?.status === 'blocked'
                  }
                  onClick={() => {
                    setReview(undefined);
                    void openReview();
                  }}
                  variant="commit"
                >
                  Continue to Review
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      {preparation ? (
        <SchemaContentPreparationDialog
          projectId={projectId}
          workspaceId={preparation.workspaceId}
          revision={preparation.revision}
          target={preparation.target}
          open
          continueToReview
          embedded
          onOpenChange={(open) => {
            if (!open) setPreparation(undefined);
          }}
          onPrepared={async () => {
            const href = await reviewFlow.review(preparation.workspaceId);
            await workspaces.refresh();
            if (mounted.current && activeReviewScope.current === reviewScope) router.push(href);
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
