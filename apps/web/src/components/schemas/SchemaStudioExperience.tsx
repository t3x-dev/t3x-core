'use client';

import type { SchemaPreparationTarget, StudioCandidate, StudioPreview } from '@t3x-dev/api-client';
import { Settings2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { WorkspaceStageNavigation } from '@/components/workspaces/WorkspaceStageNavigation';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import { schemaFieldRows } from '@/domain/schemas/schemaFieldEditing';
import {
  schemaReviewHref,
  schemaSourceHref,
  schemaWorkspaceHref,
} from '@/domain/schemas/schemaNavigation';
import { type SchemaSourcePin, schemaSourceKey } from '@/domain/schemas/schemaProvenance';
import {
  pruneSchemaMappings,
  type SchemaSourceMappings,
} from '@/domain/schemas/schemaSourceMappings';
import { schemaWorkflowStatus } from '@/domain/schemas/schemaWorkflowStatus';
import {
  listStudioDraftWorkspaces,
  listStudioWorkspacesForBranches,
  resolveStudioWorkspaceId,
} from '@/domain/workspaces/studioTargets';
import { useSchemaDraftStatus } from '@/hooks/schemas/useSchemaDraftStatus';
import { useSchemaReviewFlow } from '@/hooks/schemas/useSchemaReviewFlow';
import { useSchemaReviewStatus } from '@/hooks/schemas/useSchemaReviewStatus';
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
import { SchemaSourceComposition } from './SchemaSourceComposition';
import { SchemaSourceManager } from './SchemaSourceManager';
import { SchemaStudioSurface } from './SchemaStudioSurface';
import { SchemaYamlEditor } from './SchemaYamlEditor';
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
      },
      {
        id: 'requirements',
        title: 'Requirements',
        source: 'T3X PRD',
        sourceTone: 'black',
        tone: 'purple',
        icon: 'ri-file-list-3-fill',
      },
      {
        id: 'milestones',
        title: 'Milestones',
        source: 'T3X PRD',
        sourceTone: 'black',
        tone: 'orange',
        icon: 'ri-flag-2-fill',
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
      },
      {
        id: 'acceptance',
        title: 'Acceptance',
        source: 'Release Ops',
        sourceTone: 'blue',
        tone: 'rose',
        icon: 'ri-checkbox-circle-fill',
      },
      {
        id: 'audit',
        title: 'Audit',
        source: 'Release Ops',
        sourceTone: 'blue',
        tone: 'slate',
        icon: 'ri-database-2-fill',
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
      },
      {
        id: 'controls',
        title: 'Controls',
        source: 'Risk Kit',
        sourceTone: 'purple',
        tone: 'slate',
        icon: 'ri-shield-check-fill',
      },
    ],
  },
];

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
  const sourceManagerTrigger = useRef<HTMLButtonElement>(null);
  const [sourceManagerOpen, setSourceManagerOpen] = useState(false);
  const [compositionSaving, setCompositionSaving] = useState(false);
  const [editorActions, setEditorActions] = useState({ undo: false, rules: false, discard: false });
  const [sourceError, setSourceError] = useState<string>();
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
  const yamlSavedRef = useRef<{ candidateId: string; revision: number } | undefined>(undefined);
  const [yamlInitial, setYamlInitial] = useState<Record<string, unknown>>();
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
  const draftState = useSchemaDraftStatus(
    projectId,
    persistedTarget?.id ?? '',
    persistedTarget?.revision,
    Boolean(persistedTarget?.authoringLedger)
  );
  const draftView = draftState.view;
  const reviewStatus = useSchemaReviewStatus(
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
      ? `The saved Schema candidate needs missing sources: ${missingEditSources.map((source) => `${source.canonicalName} @ ${source.version}`).join(', ')}. Restore them in Sources, or use Combine sources to prepare a replacement. The saved candidate is preserved until you save.`
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
    if (schemaEdit.loading || candidates.loading || dataDirtyRef.current || definitionOpen) return;
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
    definitionOpen,
    dataDirty,
    schemaEdit.candidate,
    schemaEdit.loading,
    workspaceId,
    savedEditIsApplied,
    savedEditUsesBinding,
  ]);

  useEffect(() => {
    setDefinitionOpen(false);
    setSourceManagerOpen(false);
    setCompositionRequest(undefined);
    setCompositionSaving(false);
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
  const candidateSelectionKey = JSON.stringify(selection);

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
        candidate,
      });
      bySource.set(displaySource, group);
    });
    return [...bySource.values()];
  }, [candidates.items]);

  const showExplicitDemo = params?.get('demo') === '1';
  const visibleSources = liveSources.length ? liveSources : showExplicitDemo ? demoSources : [];
  const selectedWorkspaceTitle =
    target?.title ??
    (workspaceId || requestedBranch ? 'Workspace unavailable' : 'No draft workspace');

  function composeSources(sourceId?: string | string[]) {
    const ids = Array.isArray(sourceId)
      ? sourceId
      : sourceId
        ? [...new Set([...selection, sourceId])]
        : [...selection];
    setSourceManagerOpen(true);
    setCompositionRequest({
      ids,
      revision: schemaEdit.candidate?.revision ?? 0,
      base: structuredClone(
        editorBase?.schema ??
          activeCandidate?.baseDefinition ??
          basePreview.data?.workspace?.boundSchema ??
          basePreview.data?.schema
      ),
      current: structuredClone(schemaDefinition ?? data?.schema),
      choices:
        ids.length === selection.length && ids.every((id) => selection.includes(id))
          ? activeCandidate?.composition
          : {},
    });
  }

  function inspectDefinition(saved = false) {
    if (!persistedTarget) {
      setError('Select a valid Workspace to inspect Schema checks.');
      return;
    }
    const diagnosticsParams = new URLSearchParams({ schemaDiagnostics: '1', schemaSelection: '1' });
    for (const id of selection) diagnosticsParams.append('schemaSource', id);
    const navigate = () =>
      router.push(
        `${schemaReviewHref(projectId, persistedTarget.id, undefined, persistedTarget.targetBranch)}&${diagnosticsParams}`
      );
    if (!saved && navigationRef.current) navigationRef.current.requestNavigation(navigate);
    else navigate();
  }

  const reviewScope = `${projectId}:${workspaceId}`;
  const activeReviewScope = useRef(reviewScope);
  activeReviewScope.current = reviewScope;

  async function openReview(savedEdit?: { candidateId: string; revision: number }) {
    if (applying || (!savedEdit && (editorInvalid || !canReview))) return;
    if (!persistedTarget) return inspectDefinition();
    setApplying(true);
    setError(undefined);
    const targetId = persistedTarget.id;
    const isCurrent = () => mounted.current && activeReviewScope.current === reviewScope;
    try {
      let edit = savedEdit ?? savedCandidateRef;
      if (!savedEdit && dataDirty) {
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
        if (savedEdit) setDefinitionOpen(false);
        inspectDefinition(!!savedEdit);
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
          if (savedEdit) setDefinitionOpen(false);
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
      if (isCurrent()) {
        if (savedEdit) setDefinitionOpen(false);
        router.push(href);
      }
    } catch (cause) {
      if (savedEdit) throw cause;
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
      ifRevision: savedCandidateRef?.revision ?? schemaEdit.candidate?.revision ?? 0,
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
    setUsingSavedCandidate(true);
    setLocalContribution(structuredClone(saved.candidate.localContribution));
    setSchemaDefinition(undefined);
    setSavedCandidateRef({
      candidateId: saved.candidate.candidateId,
      revision: saved.candidate.revision,
    });
    await workspaces.refresh();
    return { candidateId: saved.candidate.candidateId, revision: saved.candidate.revision };
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

  const workflow = schemaWorkflowStatus({
    draft: draftView,
    preview: data,
    latest: reviewStatus.latest,
    hasDefinition: Boolean(selection.length || currentBinding || creatingBlank || activeCandidate),
  });
  const canReview =
    !!data &&
    !applying &&
    !editorInvalid &&
    !preview.loading &&
    !definitionOpen &&
    recoveredDefinitionReady &&
    !schemaEdit.error &&
    !recoveryError &&
    !draftState.loading &&
    !draftState.error &&
    !reviewStatus.loading &&
    !reviewStatus.error &&
    (persistedTarget ? workflow.hasNewChanges : selection.length > 0);
  function showReview() {
    if (!persistedTarget) return;
    const navigate = () =>
      router.push(
        schemaReviewHref(
          projectId,
          persistedTarget.id,
          reviewStatus.latest?.snapshot_id,
          target?.targetBranch
        )
      );
    if (navigationRef.current) navigationRef.current.requestNavigation(navigate);
    else navigate();
  }
  const sourceHref = schemaSourceHref(
    params?.get('returnTo') ?? null,
    projectId,
    workspaceId,
    target?.targetBranch ?? requestedBranch ?? undefined
  );

  const usedSourceIds = new Set([
    ...selection,
    ...sourceMappings.flatMap((mapping) => (mapping.source ? [mapping.source.candidateId] : [])),
    ...candidates.items
      .filter(
        (candidate) =>
          candidate.source &&
          [...(data?.sources ?? []), ...(activeCandidate?.baseSources ?? [])].some(
            (source) => schemaSourceKey(source) === schemaSourceKey(candidate.source!)
          )
      )
      .map((candidate) => candidate.id),
  ]);
  const sourceManager = (
    <SchemaSourceManager
      open={sourceManagerOpen}
      key={`${projectId}:${workspaceId}`}
      onOpenChange={(open) => {
        setSourceManagerOpen(open);
        if (!open) setCompositionRequest(undefined);
      }}
      projectId={projectId}
      returnFocusRef={sourceManagerTrigger}
      selection={compositionRequest?.ids ?? selection}
      onImport={candidates.add}
      modules={visibleSources.flatMap((source) => source.modules)}
      onRemove={(id) => {
        setSourceError(undefined);
        void candidates
          .remove(id)
          .catch((cause) =>
            setSourceError(
              cause instanceof Error ? cause.message : 'Could not remove the source. Try again.'
            )
          );
      }}
      removalBlockers={Object.fromEntries(
        (schemaEdit.error
          ? candidates.items.map((candidate) => candidate.id)
          : [...usedSourceIds]
        ).map((id) => [
          id,
          schemaEdit.error
            ? 'Reload the saved Schema before removing sources.'
            : 'Used by the current Schema draft. Keep this source available while editing.',
        ])
      )}
      pending={
        compositionSaving ||
        applying ||
        schemaEdit.pending ||
        schemaEdit.loading ||
        candidates.pending
      }
      loading={candidates.loading}
      error={sourceError || candidates.error || undefined}
      composition={
        compositionRequest ? (
          <SchemaSourceComposition
            projectId={projectId}
            workspaceId={persistedTarget?.id ?? ''}
            candidates={candidates.items}
            selection={compositionRequest.ids}
            initialComposition={compositionRequest.choices}
            baseDefinition={compositionRequest.base}
            currentDefinition={compositionRequest.current}
            onBack={() => setCompositionRequest(undefined)}
            onSaved={() => {
              setCompositionRequest(undefined);
              setSourceManagerOpen(false);
            }}
            onSavingChange={setCompositionSaving}
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
              updateDataDirty(false);
              await workspaces.refresh();
            }}
          />
        ) : null
      }
      onCombine={persistedTarget ? composeSources : undefined}
      combineDisabledReason={
        schemaEdit.loading
          ? 'Wait for the saved Schema to finish loading.'
          : schemaEdit.error
            ? 'Reload the saved Schema before combining sources.'
            : definitionOpen
              ? 'Finish editing YAML before combining sources.'
              : editorInvalid
                ? 'Fix the field errors before combining sources.'
                : preview.loading
                  ? 'Wait for the current definition preview.'
                  : undefined
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
        navigation={
          <>
            <WorkspaceStageNavigation
              label="Schema workflow"
              hidden
              mode="compose"
              reviewDisabled={
                !persistedTarget || applying || reviewStatus.loading || Boolean(reviewStatus.error)
              }
              onModeChange={(mode) => {
                if (mode === 'review') showReview();
              }}
            />
            {navigation}
          </>
        }
        contextLocked={dataDirty || definitionOpen || applying}
        editorInvalid={editorInvalid}
        dataEditor={() => (
          <SchemaDataEditor
            navigationRef={navigationRef}
            showSaveAction={false}
            externalActions
            workbenchFooter
            onActionsAvailabilityChange={setEditorActions}
            onSaveAvailabilityChange={setDataCanSave}
            onValidationChange={setEditorInvalid}
            provenance={data}
            sourceIdentities={sourceIdentities}
            wholeSchemaSource={wholeSchemaSource}
            projectId={projectId}
            sources={candidates.items}
            sourceManagement={
              <Button
                ref={sourceManagerTrigger}
                variant="ghost"
                size="sm"
                aria-label="Manage sources"
                title="Manage sources"
                aria-haspopup="dialog"
                aria-expanded={sourceManagerOpen}
                onClick={() => setSourceManagerOpen(true)}
              >
                <Settings2 size={14} aria-hidden="true" /> Manage sources…
              </Button>
            }
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
            onChooseSources={() => {
              setSourceManagerOpen(true);
            }}
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
              void reviewStatus.refresh();
              void draftState.refresh();
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
            : workflow.rejected
              ? 'Changes rejected · draft kept'
              : workflow.matchesReview && workflow.hasChanges
                ? 'Ready for review'
                : (savedCandidateRef || activeCandidate) && workflow.hasChanges
                  ? 'Draft saved · not committed'
                  : draftView?.hasChanges === false && draftView.basis.refHead
                    ? `Committed · ${draftView.basis.refHead.slice(7, 19)}`
                    : draftView?.hasChanges === true
                      ? 'Draft saved · not committed'
                      : draftView?.hasChanges === false
                        ? 'No changes to review'
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
        canEditDefinition={Boolean(
          persistedTarget &&
            (schemaDefinition || data) &&
            (selection.length || currentBinding || creatingBlank || activeCandidate) &&
            !editorInvalid &&
            !applying &&
            !schemaEdit.pending &&
            !schemaEdit.loading &&
            !definitionOpen
        )}
        onEditDefinition={() => {
          const initial =
            schemaDefinition ??
            (!hasSchemaEdit && basePreview.data?.workspace?.boundSchema
              ? basePreview.data.workspace.boundSchema
              : data?.schema);
          if (!initial || (!editorBase && !basePreview.data)) return;
          if (!editorBase && basePreview.data)
            setEditorBase({
              schema: structuredClone(
                activeCandidate?.baseDefinition ??
                  basePreview.data.workspace?.boundSchema ??
                  basePreview.data.schema
              ),
              hash: activeCandidate?.baseDefinition
                ? String(activeCandidate.authoringDraft?.base.schemaHash)
                : basePreview.data.schemaHash,
              initial: structuredClone(initial),
            });
          yamlSavedRef.current = undefined;
          setYamlInitial(structuredClone(initial));
          setDefinitionOpen(true);
        }}
        onReview={() => void openReview()}
        onSave={() => void navigationRef.current?.save?.()}
        canSave={dataCanSave && !definitionOpen && !applying && !schemaEdit.pending}
        onPublish={() => {
          if (data) setPublishReview(data);
        }}
        canPublish={Boolean(
          data?.workspace &&
            !data.workspace.canBind &&
            savedCandidateRef &&
            data.impact?.canPublish &&
            data.report.valid &&
            data.adoption.allowed &&
            !dataDirty &&
            !editorInvalid &&
            !applying &&
            !preview.loading
        )}
        onRules={() => navigationRef.current?.openRules?.()}
        canOpenRules={editorActions.rules && !definitionOpen && !applying}
        onUndo={() => navigationRef.current?.undo?.()}
        canUndo={editorActions.undo && !definitionOpen && !applying}
        onDiscard={() => navigationRef.current?.discard?.()}
        canDiscard={editorActions.discard && !definitionOpen && !applying}
        onInspect={() => inspectDefinition()}
        canReview={canReview}
        hasUnsavedChanges={dataDirty}
      />
      {draftState.error ? (
        <p role="alert" className="px-4 py-2 text-sm">
          Could not determine Draft changes: {draftState.error}{' '}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void workspaces.refresh();
              void draftState.refresh();
            }}
          >
            Retry Draft status
          </Button>
        </p>
      ) : null}
      {reviewStatus.error ? (
        <p role="alert" className="px-4 py-2 text-sm">
          Could not determine Review status: {reviewStatus.error}{' '}
          <Button variant="ghost" size="sm" onClick={() => void reviewStatus.refresh()}>
            Retry Review status
          </Button>
        </p>
      ) : null}
      {sourceManager}
      <SchemaYamlEditor
        open={definitionOpen}
        onOpenChange={setDefinitionOpen}
        workspaceTitle={selectedWorkspaceTitle}
        initialDefinition={yamlInitial}
        initiallyDirty={dataDirty}
        onSave={async (definition, intent) => {
          const saved = await saveDefinition(
            definition,
            intent,
            pruneSchemaMappings(sourceMappings, definition)
          );
          yamlSavedRef.current = saved;
          setEditorBase((current) =>
            current ? { ...current, initial: structuredClone(definition) } : current
          );
          updateDataDirty(false);
          setEditorInvalid(false);
          setEditorReset((value) => value + 1);
        }}
        onReview={async () => {
          if (!yamlSavedRef.current) throw new Error('Save the Schema before reviewing.');
          await openReview(yamlSavedRef.current);
        }}
      />
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
