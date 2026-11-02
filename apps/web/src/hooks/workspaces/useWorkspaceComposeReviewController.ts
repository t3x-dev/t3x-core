import type {
  ChangeProjectionV1,
  ReviewSnapshotV1,
  WorkspaceAuthoringView,
  WorkspaceFullSchemaReview,
} from '@t3x-dev/api-client';
import type { TransitionViewV1 } from '@t3x-dev/core';
import * as yaml from 'js-yaml';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatUserFacingError } from '@/domain/format/errors';
import {
  authoringDeterministicValidation,
  authoringReviewDocuments,
} from '@/domain/workspaces/authoringReview';
import { EMPTY_WORKSPACE_REVIEW } from '@/domain/workspaces/changeDecision';
import {
  DEFAULT_WORKSPACE_SCHEMA_BINDING,
  rebindWorkspaceCandidate,
  workspaceSchemaBindingsEqual,
} from '@/domain/workspaces/schemaBindings';
import { useMaterialUpload } from '@/hooks/materials/useMaterialUpload';
import { usePinsCrud } from '@/hooks/pins/usePinsCrud';
import { validateWorkspaceCandidateYOps } from '@/hooks/workspaces/useWorkspaceYOps';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';
import type {
  WorkspaceTransitionContent,
  WorkspaceTransitionOutcome,
  WorkspaceTransitionPrecondition,
} from '@/infrastructure/workspaces';
import { decideWorkspaceTransition, reviewWorkspaceTransition } from '@/queries/workspaces';
import { usePinsStore } from '@/store/pinsStore';
import { useProjectWorkspaceSchemaBindingsStore } from '@/store/projectWorkspaceSchemaBindingsStore';
import type { Material } from '@/types/api';
import type {
  SourceBundleItem,
  WorkspaceCandidate,
  WorkspaceSchemaBinding,
  WorkspaceSourceArtifact,
} from '@/types/workspaces';
import type { WorkspaceYOpsValidationResult } from '@/types/workspaceYops';

export interface WorkspacePreparationOptions {
  instruction?: string;
  provider?: string;
  model?: string;
}

type WorkspaceDraftCommand = string;
export type WorkspaceDraftCommandName = WorkspaceDraftCommand;

export interface WorkspaceReviewSessionState {
  changeProjection: ChangeProjectionV1 | null;
  content: WorkspaceTransitionContent | null;
  deterministicValidation: WorkspaceYOpsValidationResult | null;
  precondition: WorkspaceTransitionPrecondition | null;
  reviewSnapshot: ReviewSnapshotV1 | null;
  transitionId: string | null;
  view: TransitionViewV1 | null;
  schemaReview?: WorkspaceFullSchemaReview | null;
}

export interface WorkspaceComposeReviewControllerOptions {
  candidate: WorkspaceCandidate;
  flowError?: string;
  onApplyAfterRefresh?: (workspace: WorkspaceCandidate) => Promise<WorkspaceCandidate>;
  onDraftCommand?: (
    workspace: WorkspaceCandidate,
    command: WorkspaceDraftCommand
  ) => Promise<WorkspaceCandidate>;
  onPrepareDraft?: (
    workspace: WorkspaceCandidate,
    options: WorkspacePreparationOptions
  ) => Promise<WorkspaceCandidate>;
  onScenarioArchive?: () => Promise<void>;
  onScenarioCreate?: (name: string, duplicate: boolean) => Promise<void>;
  onScenarioRename?: (name: string) => Promise<void>;
  onScenarioSelect?: (workspaceId: string) => void;
  onSourceMaterialUploaded?: () => Promise<void> | void;
  onViewCommitInState?: (commitHash: string, branch: string) => void;
  onYOpsCommitted?: (commitHash: string, branch: string, workspace: WorkspaceCandidate) => void;
  scenarioOptions?: WorkspaceCandidate[];
}

const EMPTY_REVIEW: WorkspaceReviewSessionState = {
  changeProjection: null,
  content: null,
  deterministicValidation: null,
  precondition: null,
  reviewSnapshot: null,
  transitionId: null,
  view: null,
  schemaReview: null,
};

export function useWorkspaceComposeReviewController({
  candidate,
  flowError,
  onApplyAfterRefresh,
  onDraftCommand,
  onPrepareDraft,
  onScenarioArchive,
  onScenarioCreate,
  onScenarioRename,
  onScenarioSelect,
  onSourceMaterialUploaded,
  onViewCommitInState,
  onYOpsCommitted,
  scenarioOptions = [],
}: WorkspaceComposeReviewControllerOptions) {
  const [workingCandidate, setWorkingCandidate] = useState(candidate);
  const [busyAction, setBusyActionState] = useState<string | null>(null);
  const busyActionRef = useRef<string | null>(null);
  const scopeKey = JSON.stringify([candidate.projectId, candidate.id]);
  const scope = useMemo(() => ({ key: scopeKey, active: true, epoch: 0 }), [scopeKey]);
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const captureScope = useCallback(() => {
    const epoch = scope.epoch;
    return () => scope.active && activeScope.current === scope && scope.epoch === epoch;
  }, [scope]);
  const assertActive = useCallback(() => {
    if (!scope.active || activeScope.current !== scope)
      throw new Error('Workspace context changed. Reopen the current Draft.');
  }, [scope]);
  const setBusyAction = useCallback(
    (action: string | null) => {
      if (!scope.active || activeScope.current !== scope) return;
      busyActionRef.current = action;
      setBusyActionState(action);
    },
    [scope]
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState<WorkspaceReviewSessionState>(EMPTY_REVIEW);
  const [decisionReason, setDecisionReason] = useState('');
  const [hasCollaborationConflict, setHasCollaborationConflict] = useState(false);
  const [assistantPrefill, setAssistantPrefill] = useState<string | null>(null);
  const reviewGenerationRef = useRef(0);
  const activeCandidateIdRef = useRef(scopeKey);
  const candidateVersion = JSON.stringify([
    candidate.projectId,
    candidate.id,
    candidate.revision,
    candidate.schemaBindings,
    candidate.authoringLedger,
  ]);
  const candidateVersionRef = useRef(candidateVersion);
  const materialUpload = useMaterialUpload();
  const pinsCrud = usePinsCrud();
  const { fetch: refreshPins } = pinsCrud;
  const pins = usePinsStore((state) => state.pins);

  useEffect(() => {
    scope.active = true;
    busyActionRef.current = null;
    setBusyActionState(null);
    return () => {
      scope.active = false;
      ++scope.epoch;
      ++reviewGenerationRef.current;
    };
  }, [scope]);

  useEffect(() => {
    const candidateChanged = activeCandidateIdRef.current !== scopeKey;
    const versionChanged = candidateVersionRef.current !== candidateVersion;
    candidateVersionRef.current = candidateVersion;
    activeCandidateIdRef.current = scopeKey;
    if (candidateChanged) {
      reviewGenerationRef.current += 1;
      setWorkingCandidate(candidate);
      setReview(EMPTY_REVIEW);
      setDecisionReason('');
      setHasCollaborationConflict(false);
      setLocalError(null);
      setNotice(null);
      setAssistantPrefill(null);
      return;
    }
    if (versionChanged) {
      // The legacy preparation path performs its own save; that acknowledgement
      // is not a concurrent edit. Managed authoring Review itself is read-only.
      if (candidate.authoringLedger || busyAction !== 'review.prepare')
        reviewGenerationRef.current += 1;
      setReview(EMPTY_REVIEW);
      setDecisionReason('');
      if (busyAction !== 'review.prepare' && review.transitionId)
        setNotice('Draft changed; prepare a complete Review again.');
    }
    setWorkingCandidate((current) =>
      candidate.revision === undefined || (current.revision ?? -1) <= candidate.revision
        ? candidate
        : current
    );
  }, [candidate, candidateVersion, busyAction, review.transitionId, scopeKey]);

  useEffect(() => {
    void refreshPins(candidate.projectId);
  }, [candidate.projectId, refreshPins]);

  const materialSources = useMemo(
    () =>
      workingCandidate.sourceBundle
        .filter((source) => Boolean(source.materialId))
        .map((source) => ({
          id: source.id,
          included: pins.some((pin) => pin.type === 'import' && pin.ref_id === source.materialId),
          materialId: source.materialId as string,
          title: source.title,
        })),
    [pins, workingCandidate.sourceBundle]
  );

  const persistCandidate = useCallback(
    async (nextCandidate: WorkspaceCandidate, command: WorkspaceDraftCommand) => {
      assertActive();
      const isCurrent = captureScope();
      setWorkingCandidate(nextCandidate);
      if (command !== 'review.prepare') {
        reviewGenerationRef.current += 1;
        setReview(EMPTY_REVIEW);
      }
      if (!onDraftCommand) return nextCandidate;
      try {
        const saved = await onDraftCommand(nextCandidate, command);
        if (!isCurrent()) throw new Error('Workspace context changed. Reopen the current Draft.');
        setWorkingCandidate(saved);
        setHasCollaborationConflict(false);
        return saved;
      } catch (error) {
        if (isCurrent() && /changed since it was loaded|revision|conflict/i.test(String(error))) {
          setHasCollaborationConflict(true);
        }
        throw error;
      }
    },
    [onDraftCommand, assertActive, captureScope]
  );

  const updateSourceArtifact = useCallback(
    async (artifact: WorkspaceSourceArtifact | undefined) => {
      if (!onDraftCommand) throw new Error('Workspace saving is unavailable.');
      return persistCandidate({ ...workingCandidate, sourceArtifact: artifact }, 'source.artifact');
    },
    [onDraftCommand, workingCandidate, persistCandidate]
  );

  const ensureSaved = useCallback(async () => {
    const needsSchema = workingCandidate.schemaBindings.length === 0;
    if (
      workingCandidate.authoringLedger ||
      (workingCandidate.revision !== undefined && !needsSchema)
    )
      return workingCandidate;
    if (!onDraftCommand) throw new Error('Workspace saving is unavailable.');
    return persistCandidate(
      needsSchema
        ? {
            ...workingCandidate,
            schemaBindings: [DEFAULT_WORKSPACE_SCHEMA_BINDING],
          }
        : workingCandidate,
      'authoring.initialize'
    );
  }, [workingCandidate, onDraftCommand, persistCandidate]);

  const resolveCollaborationConflict = useCallback(async () => {
    const isCurrent = captureScope();
    if (!isCurrent() || !onApplyAfterRefresh || busyActionRef.current) return false;
    setBusyAction('collaboration.apply_after_refresh');
    setLocalError(null);
    try {
      const saved = await onApplyAfterRefresh(workingCandidate);
      if (!isCurrent()) return false;
      setWorkingCandidate(saved);
      setHasCollaborationConflict(false);
      setNotice('Remote revision refreshed and the local draft was applied with CAS.');
      return true;
    } catch (error) {
      if (isCurrent())
        setLocalError(formatUserFacingError(error, 'Unable to apply after refresh.'));
      return false;
    } finally {
      if (isCurrent()) setBusyAction(null);
    }
  }, [onApplyAfterRefresh, workingCandidate, captureScope, setBusyAction]);

  const runScenarioAction = useCallback(
    async (action: string, callback: () => Promise<void>) => {
      const isCurrent = captureScope();
      if (!isCurrent() || busyActionRef.current) return false;
      setBusyAction(action);
      setLocalError(null);
      try {
        await callback();
        if (!isCurrent()) return false;
        setNotice('Scenario updated.');
        return true;
      } catch (error) {
        if (isCurrent()) setLocalError(formatUserFacingError(error, 'Scenario update failed.'));
        return false;
      } finally {
        if (isCurrent()) setBusyAction(null);
      }
    },
    [captureScope, setBusyAction]
  );

  const addMaterial = useCallback(
    async (material: Material) => {
      assertActive();
      const isIncluded = () =>
        usePinsStore
          .getState()
          .pins.some((pin) => pin.type === 'import' && pin.ref_id === material.id);
      if (!isIncluded()) await pinsCrud.add(candidate.projectId, 'import', material.id);
      assertActive();
      if (!isIncluded()) throw new Error('Uploaded material could not be included.');
      const source = materialToSourceBundleItem(material);
      const withSource = {
        ...workingCandidate,
        sourceBundle: upsertSource(workingCandidate.sourceBundle, source.id, source),
      };
      await persistCandidate(
        workingCandidate.authoringLedger ? withSource : invalidateWorkspaceProposal(withSource),
        'source.add'
      );
      assertActive();
      await onSourceMaterialUploaded?.();
      assertActive();
      setNotice(`${material.title} added as source evidence.`);
    },
    [
      candidate.projectId,
      onSourceMaterialUploaded,
      persistCandidate,
      pinsCrud,
      workingCandidate,
      assertActive,
    ]
  );

  const toggleMaterialSource = useCallback(
    async (materialId: string) => {
      const isCurrent = captureScope();
      if (!isCurrent() || busyActionRef.current) return;
      setBusyAction(`source:material:${materialId}`);
      setLocalError(null);
      try {
        const existing = usePinsStore
          .getState()
          .pins.find((pin) => pin.type === 'import' && pin.ref_id === materialId);
        if (existing) await pinsCrud.remove(existing.id);
        else await pinsCrud.add(candidate.projectId, 'import', materialId);
        if (!isCurrent()) return;
        const included = usePinsStore
          .getState()
          .pins.some((pin) => pin.type === 'import' && pin.ref_id === materialId);
        if ((!existing && !included) || (existing && included)) {
          throw new Error(
            existing ? 'Material could not be excluded.' : 'Material could not be included.'
          );
        }
        if (!workingCandidate.authoringLedger)
          await persistCandidate(invalidateWorkspaceProposal(workingCandidate), 'source.include');
        if (!isCurrent()) return;
        setNotice(included ? 'Material included as source evidence.' : 'Material excluded.');
      } catch (error) {
        if (isCurrent())
          setLocalError(formatUserFacingError(error, 'Material source update failed.'));
      } finally {
        if (isCurrent()) setBusyAction(null);
      }
    },
    [candidate.projectId, persistCandidate, pinsCrud, workingCandidate, captureScope, setBusyAction]
  );

  const uploadFile = useCallback(
    async (file: File) => {
      const isCurrent = captureScope();
      if (!isCurrent() || busyActionRef.current) return false;
      const unsupported = unsupportedWorkspaceMaterialMessage(file);
      if (unsupported) {
        setLocalError(unsupported);
        return false;
      }
      setBusyAction('source:file');
      setLocalError(null);
      let uploaded = false;
      try {
        const material = await materialUpload.upload(candidate.projectId, file);
        if (!isCurrent()) return false;
        uploaded = true;
        await addMaterial(material);
        return isCurrent();
      } catch (error) {
        if (!isCurrent()) return false;
        setLocalError(
          `${uploaded ? 'Material saved, but Workspace inclusion failed. ' : ''}${formatUserFacingError(error, 'Material upload failed.')}`
        );
        return false;
      } finally {
        if (isCurrent()) setBusyAction(null);
      }
    },
    [addMaterial, candidate.projectId, materialUpload, captureScope, setBusyAction]
  );

  const prepareReview = useCallback(
    async (onPrepared?: (snapshot: ReviewSnapshotV1) => void) => {
      const isCurrent = captureScope();
      if (!isCurrent() || busyActionRef.current) return false;
      const generation = reviewGenerationRef.current + 1;
      reviewGenerationRef.current = generation;
      setReview(EMPTY_REVIEW);
      setBusyAction('review.prepare');
      setLocalError(null);
      setNotice('Preparing the exact deterministic result…');
      try {
        let authoringView: WorkspaceAuthoringView | null = null;
        try {
          authoringView = await getSharedApiClient().workspaces.authoring.read(
            workingCandidate.projectId,
            workingCandidate.id
          );
        } catch (error) {
          if (workingCandidate.authoringLedger) throw error;
          authoringView = null;
        }
        if (!isCurrent() || generation !== reviewGenerationRef.current) return false;
        if (authoringView?.hasChanges === false) {
          throw new Error(EMPTY_WORKSPACE_REVIEW);
        }
        const documents = authoringReviewDocuments(
          authoringView ? { ...authoringView, selected: null } : null
        );
        if (workingCandidate.authoringLedger && !documents) {
          throw new Error('The complete Authoring Draft is unavailable. Retry Workspace Review.');
        }
        if (authoringView && documents) {
          const reviewed = await getSharedApiClient().workspaces.authoring.prepareReview(
            workingCandidate.projectId,
            workingCandidate.id,
            {
              request_id: crypto.randomUUID(),
              expected_workspace_revision: authoringView.workspaceRevision,
              expected_revision: authoringView.compositionRevision,
              expected_ref_head: authoringView.basis.refHead,
              reason: `Review ${authoringView.netDiff.length} authoring Workspace changes.`,
            }
          );
          if (!isCurrent() || generation !== reviewGenerationRef.current) return false;
          const latest = await getSharedApiClient().workspaces.getLatestReviewSnapshot(
            workingCandidate.projectId,
            workingCandidate.id,
            {
              transition_id: reviewed.view.transition_id,
            }
          );
          if (!isCurrent() || generation !== reviewGenerationRef.current) return false;
          if (!latest?.snapshot)
            throw new Error('The saved review snapshot is unavailable. Prepare Review again.');
          setReview({
            changeProjection: latest?.change_projection ?? null,
            content: documents.current,
            deterministicValidation: authoringDeterministicValidation(
              documents,
              authoringView.netDiff.length
            ),
            precondition: {
              workspace_revision: reviewed.view.precondition.workspace_revision,
              ref_head: reviewed.view.precondition.ref_head,
              effect_digest: reviewed.view.precondition.effect_digest,
              proposal_digest: reviewed.view.precondition.proposal_digest,
              statement_digests: reviewed.view.precondition.statement_digests,
              policy_digest: reviewed.view.precondition.policy_digest ?? '',
            },
            reviewSnapshot: latest?.snapshot ?? null,
            transitionId: reviewed.view.transition_id,
            view: reviewed.view.transition,
            schemaReview: reviewed.schemaReview ?? latest?.schema_review ?? null,
          });
          setNotice('Immutable review prepared from the current draft.');
          onPrepared?.(latest.snapshot);
          return true;
        }

        if (!onPrepareDraft) {
          throw new Error('Prepare the current Compose draft before Review.');
        }
        const prepared = await onPrepareDraft(workingCandidate, {});
        if (!isCurrent() || generation !== reviewGenerationRef.current) return false;
        setWorkingCandidate(prepared);
        if (prepared.yopsDraft.operations.length === 0) {
          throw new Error('No YOps operations were generated from the selected source evidence.');
        }

        const deterministicValidation = await validateWorkspaceCandidateYOps(prepared);
        if (!isCurrent() || generation !== reviewGenerationRef.current) return false;
        if (!deterministicValidation.ok) {
          throw new Error(
            deterministicValidation.error?.message ?? 'Deterministic YOps validation failed.'
          );
        }
        const content = {
          trees: deterministicValidation.previewTrees ?? deterministicValidation.baselineTrees,
          relations:
            deterministicValidation.previewRelations ?? deterministicValidation.baselineRelations,
        };
        const saved = await persistCandidate(prepared, 'review.prepare');
        if (!isCurrent() || generation !== reviewGenerationRef.current) return false;
        if (saved.revision === undefined) {
          throw new Error('Saved Workspace did not return a review revision.');
        }
        const reviewed = await reviewWorkspaceTransition(
          saved.projectId,
          saved.id,
          content,
          `Review ${saved.yopsDraft.operations.length} structured Workspace changes.`,
          saved.revision
        );
        if (!isCurrent() || generation !== reviewGenerationRef.current) return false;
        setReview({
          changeProjection: reviewed.change_projection,
          content,
          deterministicValidation,
          precondition: reviewed.precondition,
          reviewSnapshot: reviewed.review_snapshot,
          transitionId: reviewed.transition_id,
          view: reviewed.transition,
        });
        setNotice('Immutable review prepared from the current draft.');
        onPrepared?.(reviewed.review_snapshot);
        return true;
      } catch (error) {
        if (!isCurrent() || generation !== reviewGenerationRef.current) return false;
        setReview(EMPTY_REVIEW);
        setLocalError(formatUserFacingError(error, 'Workspace review preparation failed.'));
        setNotice(null);
        return false;
      } finally {
        if (isCurrent()) setBusyAction(null);
      }
    },
    [onPrepareDraft, persistCandidate, workingCandidate, captureScope, setBusyAction]
  );

  const decide = useCallback(
    async (outcome: WorkspaceTransitionOutcome, reason?: string) => {
      const isActive = captureScope();
      if (!isActive() || busyActionRef.current) return null;
      if (!review.transitionId || !review.content || !review.precondition) {
        setLocalError('Prepare the current draft for review before making a decision.');
        return null;
      }
      if (
        workingCandidate.authoringLedger &&
        outcome !== 'rejected' &&
        (!review.schemaReview || review.schemaReview.base.status === 'unknown')
      ) {
        setLocalError(
          'A complete Workspace Schema Review with a verified Base is required. Prepare Review again.'
        );
        return null;
      }
      const normalizedReason = reason?.trim();
      if (outcome === 'overridden' && !normalizedReason) {
        setLocalError('Explain why this change should continue despite the failed check.');
        return null;
      }
      const generation = reviewGenerationRef.current;
      const isCurrent = () => isActive() && generation === reviewGenerationRef.current;
      setBusyAction(`decision:${outcome}`);
      setLocalError(null);
      try {
        const decided = await decideWorkspaceTransition(candidate.projectId, candidate.id, {
          transitionId: review.transitionId,
          content: review.content,
          outcome,
          ...(normalizedReason ? { decisionReason: normalizedReason } : {}),
          precondition: review.precondition,
        });
        if (!isCurrent()) return null;
        setReview((current) => ({
          ...current,
          changeProjection: decided.change_projection,
          precondition: decided.precondition,
          reviewSnapshot: decided.review_snapshot,
          view: decided.transition,
        }));
        const commitId = committedTransitionId(decided.transition);
        if (commitId && decided.workspace) {
          setWorkingCandidate(decided.workspace);
          onYOpsCommitted?.(commitId, decided.workspace.targetBranch, decided.workspace);
          setNotice(`Committed ${decided.workspace.yopsDraft.operations.length} changes.`);
          return { commitId, workspace: decided.workspace };
        }
        setNotice('Decision recorded without advancing branch history.');
        return null;
      } catch (error) {
        if (!isCurrent()) return null;
        if (/changed|revision|conflict|stale/i.test(String(error))) setReview(EMPTY_REVIEW);
        setLocalError(formatUserFacingError(error, 'Workspace decision failed.'));
        return null;
      } finally {
        if (isActive()) setBusyAction(null);
      }
    },
    [
      captureScope,
      setBusyAction,
      candidate.id,
      candidate.projectId,
      onYOpsCommitted,
      review,
      workingCandidate.authoringLedger,
    ]
  );

  const copyReceipt = useCallback(async () => {
    const isCurrent = captureScope();
    const receipt = review.reviewSnapshot;
    if (!receipt || !isCurrent()) return false;
    try {
      await navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
      if (!isCurrent()) return false;
      setNotice('Receipt copied.');
      return true;
    } catch (error) {
      if (isCurrent()) setLocalError(formatUserFacingError(error, 'Unable to copy the receipt.'));
      return false;
    }
  }, [review.reviewSnapshot, captureScope]);

  const bindSchema = useCallback(
    async (binding: WorkspaceSchemaBinding) => {
      if (workspaceSchemaBindingsEqual(workingCandidate.schemaBindings[0], binding)) {
        return workingCandidate;
      }
      const next = rebindWorkspaceCandidate(workingCandidate, binding, new Date().toISOString());
      const saved = await persistCandidate(next, 'schema.bind');
      useProjectWorkspaceSchemaBindingsStore.getState().bindSchema({
        binding: saved.schemaBindings[0] ?? binding,
        projectId: saved.projectId,
        workspaceId: saved.id,
      });
      return saved;
    },
    [persistCandidate, workingCandidate]
  );

  const viewCommit = useCallback(() => {
    const commitId =
      committedTransitionId(review.view) ??
      (workingCandidate.status === 'committed' ? workingCandidate.lastCommitHash : undefined);
    if (commitId) onViewCommitInState?.(commitId, workingCandidate.targetBranch);
  }, [onViewCommitInState, review.view, workingCandidate]);

  const viewBaseCommit = useCallback(() => {
    if (workingCandidate.baseCommitHash) {
      onViewCommitInState?.(workingCandidate.baseCommitHash, workingCandidate.targetBranch);
    }
  }, [onViewCommitInState, workingCandidate.baseCommitHash, workingCandidate.targetBranch]);

  const renderedYaml = useMemo(() => {
    if (!review.content) return '';
    return yaml.dump(
      { trees: review.content.trees, relations: review.content.relations },
      { lineWidth: -1, noRefs: true, sortKeys: true }
    );
  }, [review.content]);

  const scenarioSummaries = useMemo(
    () =>
      scenarioOptions.map((workspace) => ({
        changedPaths: workspace.yopsDraft.operations.map((operation) => operation.path),
        id: workspace.id,
        label: workspace.title,
        operationCount: workspace.yopsDraft.operations.length,
        operations: workspace.yopsDraft.operations,
      })),
    [scenarioOptions]
  );

  const refreshFromServer = useCallback(async () => {
    const isCurrent = captureScope();
    if (!isCurrent()) return;
    const workspaceId = workingCandidate.id;
    const saved = await getSharedApiClient().workspaces.get(
      workingCandidate.projectId,
      workspaceId
    );
    if (!isCurrent()) return;
    reviewGenerationRef.current += 1;
    setWorkingCandidate(saved.workspace as unknown as WorkspaceCandidate);
    setReview(EMPTY_REVIEW);
  }, [workingCandidate.projectId, workingCandidate.id, captureScope]);

  return {
    refreshFromServer,
    bindSchema,
    busyAction,
    assistantPrefill,
    candidate: workingCandidate,
    clearAssistantPrefill: () => setAssistantPrefill(null),
    copyReceipt,
    ensureSaved,
    decide,
    decisionReason,
    error: localError ?? flowError,
    hasCollaborationConflict,
    isBusy: Boolean(busyAction),
    materialSources,
    notice,
    prefillAssistant: (text: string) => setAssistantPrefill(text),
    prepareReview,
    renderedYaml,
    review,
    resolveCollaborationConflict,
    scenarios: {
      archive: () =>
        runScenarioAction('scenario.archive', async () => {
          if (!onScenarioArchive) throw new Error('Scenario archive is unavailable.');
          await onScenarioArchive();
        }),
      create: (name: string) =>
        runScenarioAction('scenario.create', async () => {
          if (!onScenarioCreate) throw new Error('Scenario creation is unavailable.');
          await onScenarioCreate(name, false);
        }),
      duplicate: (name: string) =>
        runScenarioAction('scenario.duplicate', async () => {
          if (!onScenarioCreate) throw new Error('Scenario duplication is unavailable.');
          await onScenarioCreate(name, true);
        }),
      options: scenarioSummaries,
      rename: (name: string) =>
        runScenarioAction('scenario.rename', async () => {
          if (!onScenarioRename) throw new Error('Scenario rename is unavailable.');
          await onScenarioRename(name);
        }),
      select: (workspaceId: string) => onScenarioSelect?.(workspaceId),
      selectedId: workingCandidate.id,
    },
    setDecisionReason,
    sourceBusy: materialUpload.uploading || busyAction?.startsWith('source:') === true,
    toggleMaterialSource,
    updateSourceArtifact,
    uploadFile,
    viewBaseCommit,
    viewCommit,
  };
}

export type WorkspaceComposeReviewController = ReturnType<
  typeof useWorkspaceComposeReviewController
>;

function materialToSourceBundleItem(material: Material): SourceBundleItem {
  const filename = material.filename?.toLowerCase() ?? '';
  const mimeType = material.mime_type?.toLowerCase() ?? '';
  const format =
    filename.endsWith('.yaml') || filename.endsWith('.yml') || mimeType.includes('yaml')
      ? ('yaml' as const)
      : mimeType.startsWith('text/')
        ? ('text' as const)
        : undefined;
  return {
    id: `material:${material.id}`,
    type: material.source_type === 'url' ? 'import' : 'document',
    title: material.title,
    description: material.content_excerpt,
    materialId: material.id,
    contentHash: material.content_hash,
    tokenEstimate: material.token_estimate,
    fileName: material.filename ?? undefined,
    ...(format ? { format } : {}),
    previewText: material.content_excerpt,
  };
}

function upsertSource(
  sourceBundle: SourceBundleItem[],
  sourceId: string,
  source: SourceBundleItem | null
): SourceBundleItem[] {
  const existingIndex = sourceBundle.findIndex((item) => item.id === sourceId);
  if (!source) return sourceBundle.filter((item) => item.id !== sourceId);
  if (existingIndex < 0) return [...sourceBundle, source];
  return sourceBundle.map((item, index) => (index === existingIndex ? source : item));
}

function invalidateWorkspaceProposal(candidate: WorkspaceCandidate): WorkspaceCandidate {
  const {
    commitOverride: _commitOverride,
    lastCommitHash: _lastCommitHash,
    ...editableCandidate
  } = candidate;
  return {
    ...editableCandidate,
    status: 'draft',
    schemaCandidate: {
      summary: 'Source evidence changed. Generate a new candidate proposal.',
      fields: [],
    },
    schemaReview: {
      verdict: 'needs_review',
      summary: 'The candidate proposal must be regenerated after its source evidence changed.',
      gaps: ['Generate a candidate proposal from the current source evidence.'],
    },
    yopsDraft: { ...candidate.yopsDraft, operations: [] },
  };
}

function committedTransitionId(view: TransitionViewV1 | null): string | null {
  if (!view || view.mode !== 'transition' || view.history.observation !== 'committed') return null;
  return view.history.commit.id;
}

function unsupportedWorkspaceMaterialMessage(file: File): string | null {
  if (file.size > 5 * 1024 * 1024) {
    return 'File is too large. Workspace chat materials support files up to 5MB.';
  }
  const extension = file.name.toLowerCase().split('.').at(-1) ?? '';
  if (extension === 'doc') return 'Legacy .doc files are not supported. Export as DOCX or PDF.';
  if (extension === 'xls') return 'Legacy .xls files are not supported. Export as XLSX or CSV.';
  return null;
}
