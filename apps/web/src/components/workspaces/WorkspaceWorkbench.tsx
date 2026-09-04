import { useCallback, useState } from 'react';
import { selectWorkspaceCandidate } from '@/domain/workspaces/selectors';
import type {
  WorkspaceDraftCommandName,
  WorkspacePreparationOptions,
} from '@/hooks/workspaces/useWorkspaceComposeReviewController';
import { useWorkspaceFlow } from '@/hooks/workspaces/useWorkspaceFlow';
import { useWorkspaceProposalGeneration } from '@/hooks/workspaces/useWorkspaceProposalGeneration';
import { usePinsStore } from '@/store/pinsStore';
import type {
  SourceBundleItem,
  WorkspaceCandidate,
  WorkspaceProposalGenerationView,
  WorkspaceProposalPosture,
  WorkspaceSourceArtifact,
} from '@/types/workspaces';
import type {
  ProposalGenerationAction,
  ProposalGenerationReviewState,
} from './ProposalGenerationReviewView';
import { type WorkspaceTabId, WorkspaceTabs } from './WorkspaceTabs';

type WorkspaceWorkbenchViewState = 'ready' | 'loading' | 'error';

interface WorkspaceFlowState {
  candidateId?: string;
  yopsDraftId?: string;
  commitHash?: string;
  sourceConversationId?: string;
  sourceParentCommitHash?: string;
  continuationBusy?: boolean;
  extracting?: boolean;
  sendingToYOps?: boolean;
  proposalPosture?: WorkspaceProposalPosture;
  proposalGeneration?: WorkspaceProposalGenerationView;
  proposalGenerationBusy?: boolean;
  proposalReviewState?: ProposalGenerationReviewState;
  validationGapCount?: number;
  error?: string;
}

interface WorkspaceWorkbenchProps {
  branchOptions?: string[];
  candidates: WorkspaceCandidate[];
  projectId: string;
  viewState?: WorkspaceWorkbenchViewState;
  errorMessage?: string;
  selectedWorkspaceId?: string | null;
  onSelectedWorkspaceChange?: (workspaceId: string) => void;
  onSourceMaterialUploaded?: () => Promise<void> | void;
  onViewCommitInState?: (commitHash: string, branch: string) => void;
  onWorkspacesRefresh?: () => Promise<void> | void;
  onWorkspaceBranchChange?: (branch: string) => Promise<void> | void;
}

export function WorkspaceWorkbench({
  branchOptions,
  candidates,
  errorMessage,
  onSourceMaterialUploaded,
  onSelectedWorkspaceChange,
  onViewCommitInState,
  onWorkspacesRefresh,
  onWorkspaceBranchChange,
  projectId,
  selectedWorkspaceId,
  viewState = 'ready',
}: WorkspaceWorkbenchProps) {
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<WorkspaceTabId>('chat');
  const [localSelectedWorkspaceId, setLocalSelectedWorkspaceId] = useState<string | null>(
    selectedWorkspaceId ?? candidates[0]?.id ?? null
  );
  const [flowByWorkspaceId, setFlowByWorkspaceId] = useState<Record<string, WorkspaceFlowState>>(
    {}
  );
  const [workspaceOverrides, setWorkspaceOverrides] = useState<Record<string, WorkspaceCandidate>>(
    {}
  );
  const pins = usePinsStore((state) => state.pins);
  const {
    extractCandidate,
    refreshWorkspaces,
    saveDraft: saveWorkspaceDraft,
    sendToYOps,
    startNextIteration,
  } = useWorkspaceFlow();
  const proposalGeneration = useWorkspaceProposalGeneration();

  const availableCandidates = [
    ...candidates.map((candidate) =>
      mergeWorkspaceOverride(candidate, workspaceOverrides[candidate.id])
    ),
    ...Object.values(workspaceOverrides).filter(
      (override) => !candidates.some((candidate) => candidate.id === override.id)
    ),
  ];
  const baseSelectedWorkspace = selectWorkspaceCandidate(
    availableCandidates,
    selectedWorkspaceId ?? localSelectedWorkspaceId
  );
  const selectedWorkspace = baseSelectedWorkspace
    ? mergeWorkspaceOverride(baseSelectedWorkspace, workspaceOverrides[baseSelectedWorkspace.id])
    : null;
  const selectedFlow = selectedWorkspace ? flowByWorkspaceId[selectedWorkspace.id] : undefined;
  const selectedWorkspaceWithFlow =
    selectedWorkspace && selectedFlow?.commitHash
      ? {
          ...selectedWorkspace,
          lastCommitHash: selectedFlow.commitHash,
          status: 'committed' as const,
        }
      : selectedWorkspace;

  const selectWorkspace = (workspaceId: string) => {
    setLocalSelectedWorkspaceId(workspaceId);
    onSelectedWorkspaceChange?.(workspaceId);
  };

  const updateSelectedFlow = (patch: WorkspaceFlowState, workspaceId = selectedWorkspace?.id) => {
    if (!workspaceId) return;
    setFlowByWorkspaceId((current) => ({
      ...current,
      [workspaceId]: {
        ...current[workspaceId],
        ...patch,
      },
    }));
  };

  const handleChatSourceEvidenceChange = useCallback(
    (sourceId: string, source: SourceBundleItem | null) => {
      if (!baseSelectedWorkspace) return;

      setWorkspaceOverrides((current) => {
        const existingOverride = current[baseSelectedWorkspace.id];
        const currentWorkspace = existingOverride
          ? mergeWorkspaceOverride(baseSelectedWorkspace, existingOverride)
          : baseSelectedWorkspace;
        const sourceBundle = upsertWorkspaceSourceBundle(
          currentWorkspace.sourceBundle,
          sourceId,
          source
        );

        if (sourceBundlesEqual(currentWorkspace.sourceBundle, sourceBundle)) return current;

        const removedSource = source
          ? null
          : currentWorkspace.sourceBundle.find((item) => item.id === sourceId);
        const nextWorkspace =
          source?.type === 'chat' || removedSource?.type === 'chat'
            ? resetWorkspaceProposalAfterSourceChange(currentWorkspace, sourceBundle)
            : {
                ...(existingOverride ?? baseSelectedWorkspace),
                sourceBundle,
              };

        return {
          ...current,
          [baseSelectedWorkspace.id]: nextWorkspace,
        };
      });
    },
    [baseSelectedWorkspace]
  );

  const handleExtractCandidate = async (options: WorkspacePreparationOptions = {}) => {
    if (!selectedWorkspace) return;

    updateSelectedFlow({ error: undefined, extracting: true });
    try {
      const result = await extractCandidate(selectWorkspaceSourceBundle(selectedWorkspace, pins), {
        provider: options.provider,
        model: options.model,
      });
      setWorkspaceOverrides((current) => ({
        ...current,
        [result.workspace.id]: result.workspace,
      }));
      updateSelectedFlow({
        candidateId: result.candidate_id,
        commitHash: undefined,
        error: undefined,
        extracting: false,
        validationGapCount: undefined,
      });
      setActiveWorkflowTab('ops');
    } catch (err) {
      updateSelectedFlow({
        error: err instanceof Error ? err.message : 'Candidate extraction failed.',
        extracting: false,
      });
    }
  };

  const handleSourceArtifactChange = (artifact: WorkspaceSourceArtifact | undefined) => {
    if (!selectedWorkspace) return;
    setWorkspaceOverrides((current) => ({
      ...current,
      [selectedWorkspace.id]: {
        ...(current[selectedWorkspace.id] ?? selectedWorkspace),
        sourceArtifact: artifact,
      },
    }));
    updateSelectedFlow({ commitHash: undefined, error: undefined });
  };

  const handleSendToYOps = async () => {
    if (!selectedWorkspace) return;

    updateSelectedFlow({ error: undefined, sendingToYOps: true });
    try {
      const result = await sendToYOps(selectedWorkspace);
      const hasOperations = hasYOpsOperations(result.workspace);
      setWorkspaceOverrides((current) => ({
        ...current,
        [result.workspace.id]: result.workspace,
      }));
      updateSelectedFlow({
        candidateId: result.candidate_id,
        commitHash: undefined,
        error: hasOperations
          ? undefined
          : 'No YOps operations were generated. Add source evidence, regenerate the candidate proposal, then send it to YOps.',
        sendingToYOps: false,
        validationGapCount: undefined,
        yopsDraftId: hasOperations
          ? (result.yops_draft_id ?? result.workspace.yopsDraft.id)
          : undefined,
      });
      setActiveWorkflowTab(hasOperations ? 'validation' : 'ops');
    } catch (err) {
      updateSelectedFlow({
        error: err instanceof Error ? err.message : 'YOps proposal generation failed.',
        sendingToYOps: false,
      });
    }
  };

  const handleProposalPostureChange = (posture: WorkspaceProposalPosture) => {
    updateSelectedFlow({ error: undefined, proposalPosture: posture });
  };

  const handleGenerateProposal = async (options: WorkspacePreparationOptions = {}) => {
    if (!selectedWorkspace) return;
    const posture = selectedFlow?.proposalPosture ?? 'guided';
    const sourceMaterialIds = [
      ...new Set(
        selectedWorkspace.sourceBundle.flatMap((source) =>
          source.materialId ? [source.materialId] : []
        )
      ),
    ];

    updateSelectedFlow({
      error: undefined,
      proposalGenerationBusy: true,
      proposalReviewState: 'undecided',
    });
    try {
      const generated = await proposalGeneration.generate({
        projectId: selectedWorkspace.projectId,
        workspaceId: selectedWorkspace.id,
        posture,
        instruction:
          options.instruction ??
          `Generate a schema-aligned proposal for ${selectedWorkspace.title} from the selected workspace evidence.`,
        sourceMaterialIds,
        provider: options.provider,
        model: options.model,
        ifRevision: selectedWorkspace.revision,
      });
      updateSelectedFlow({ proposalGeneration: generated.view });
      const verified = await proposalGeneration.verify(
        selectedWorkspace.projectId,
        generated.transition_id
      );
      updateSelectedFlow({
        error: undefined,
        proposalGeneration: verified.view,
        proposalGenerationBusy: false,
      });
    } catch (err) {
      updateSelectedFlow({
        error:
          err instanceof Error
            ? err.message
            : 'Governed proposal generation could not be completed.',
        proposalGenerationBusy: false,
      });
    }
  };

  const handleVerifyProposal = async () => {
    if (!selectedWorkspace || !selectedFlow?.proposalGeneration) return;
    updateSelectedFlow({ error: undefined, proposalGenerationBusy: true });
    try {
      const verified = await proposalGeneration.verify(
        selectedWorkspace.projectId,
        selectedFlow.proposalGeneration.transition_id
      );
      updateSelectedFlow({
        proposalGeneration: verified.view,
        proposalGenerationBusy: false,
      });
    } catch (err) {
      updateSelectedFlow({
        error: err instanceof Error ? err.message : 'Proposal verification failed.',
        proposalGenerationBusy: false,
      });
    }
  };

  const handleProposalAction = async (action: ProposalGenerationAction) => {
    if (!selectedWorkspace || !selectedFlow?.proposalGeneration) return;
    if (action === 'revision') {
      updateSelectedFlow({
        error: undefined,
        proposalReviewState: 'undecided',
      });
      setActiveWorkflowTab('chat');
      return;
    }

    updateSelectedFlow({
      error: undefined,
      proposalGenerationBusy: false,
      proposalReviewState: 'ready_for_changes',
    });
    setActiveWorkflowTab('validation');
  };

  const handleCommitted = (
    commitHash: string,
    _branch: string,
    committedWorkspace: WorkspaceCandidate
  ) => {
    setWorkspaceOverrides((current) => ({
      ...current,
      [committedWorkspace.id]: committedWorkspace,
    }));
    updateSelectedFlow({ commitHash });
    setActiveWorkflowTab('commit');
  };

  const handleContinueFromCommit = async (
    commitHash: string,
    targetBranch: string,
    createBranchFrom?: string
  ) => {
    if (!selectedWorkspace) return;

    updateSelectedFlow({ continuationBusy: true, error: undefined });
    try {
      const result = await startNextIteration({
        candidate: selectedWorkspace,
        createBranchFrom,
        parentCommitHash: commitHash,
        targetBranch,
      });
      setWorkspaceOverrides((current) => ({
        ...current,
        [result.workspace.id]: result.workspace,
      }));
      updateSelectedFlow(
        {
          candidateId: undefined,
          commitHash: undefined,
          continuationBusy: false,
          error: undefined,
          sourceConversationId: result.conversationId,
          sourceParentCommitHash: commitHash,
          validationGapCount: undefined,
          yopsDraftId: undefined,
        },
        result.workspace.id
      );
      setActiveWorkflowTab('chat');
      if (createBranchFrom) await onWorkspaceBranchChange?.(targetBranch);
    } catch (err) {
      updateSelectedFlow({
        continuationBusy: false,
        error: err instanceof Error ? err.message : 'Unable to start the next workspace iteration.',
      });
    }
  };

  const handleYOpsApplied = (validationGapCount: number) => {
    updateSelectedFlow({ validationGapCount });
    setActiveWorkflowTab('preview');
  };

  const handleYOpsScriptSave = async (workspace: WorkspaceCandidate) => {
    updateSelectedFlow({ error: undefined, validationGapCount: undefined }, workspace.id);
    try {
      const result = await saveWorkspaceDraft(workspace);
      setWorkspaceOverrides((current) => ({
        ...current,
        [result.workspace.id]: result.workspace,
      }));
      updateSelectedFlow(
        {
          commitHash: undefined,
          error: undefined,
          validationGapCount: undefined,
          yopsDraftId: result.yops_draft_id ?? result.workspace.yopsDraft.id,
        },
        result.workspace.id
      );
    } catch (err) {
      if (isWorkspaceRevisionConflict(err) && onWorkspacesRefresh) {
        await onWorkspacesRefresh();
        setWorkspaceOverrides((current) => {
          const next = { ...current };
          delete next[workspace.id];
          return next;
        });
        const message =
          'Workspace changed since it was loaded. I refreshed the latest workspace; review your edits and save again.';
        throw new Error(message);
      }

      const message = err instanceof Error ? err.message : 'Unable to save YOps changes.';
      throw new Error(message);
    }
  };

  const handleWorkspaceDraftCommand = async (
    workspace: WorkspaceCandidate,
    command: WorkspaceDraftCommandName
  ): Promise<WorkspaceCandidate> => {
    updateSelectedFlow({ error: undefined, validationGapCount: undefined }, workspace.id);
    try {
      const result = await saveWorkspaceDraft(workspace, command);
      setWorkspaceOverrides((current) => ({
        ...current,
        [result.workspace.id]: result.workspace,
      }));
      updateSelectedFlow(
        {
          commitHash: undefined,
          error: undefined,
          validationGapCount: undefined,
          yopsDraftId: result.yops_draft_id ?? result.workspace.yopsDraft.id,
        },
        result.workspace.id
      );
      return result.workspace;
    } catch (err) {
      if (isWorkspaceRevisionConflict(err) && onWorkspacesRefresh) {
        await onWorkspacesRefresh();
        setWorkspaceOverrides((current) => {
          const next = { ...current };
          delete next[workspace.id];
          return next;
        });
        throw new Error(
          'Workspace changed since it was loaded. The latest draft was refreshed; review the current evidence and retry.'
        );
      }
      throw err instanceof Error ? err : new Error('Unable to save the Workspace draft.');
    }
  };

  const handlePrepareDraft = async (
    workspace: WorkspaceCandidate,
    options: WorkspacePreparationOptions
  ): Promise<WorkspaceCandidate> => {
    updateSelectedFlow(
      {
        commitHash: undefined,
        error: undefined,
        extracting: workspace.yopsDraft.operations.length === 0,
        sendingToYOps: false,
        validationGapCount: undefined,
      },
      workspace.id
    );

    try {
      let prepared = selectWorkspaceSourceBundle(workspace, usePinsStore.getState().pins);
      let candidateId: string | undefined;
      if (prepared.yopsDraft.operations.length === 0) {
        const extracted = await extractCandidate(prepared, {
          provider: options.provider,
          model: options.model,
        });
        prepared = extracted.workspace;
        candidateId = extracted.candidate_id;
      }

      let yopsDraftId: string | undefined;
      if (prepared.yopsDraft.operations.length === 0) {
        updateSelectedFlow({ extracting: false, sendingToYOps: true }, workspace.id);
        const yops = await sendToYOps(prepared);
        prepared = yops.workspace;
        candidateId = yops.candidate_id;
        yopsDraftId = yops.yops_draft_id ?? yops.workspace.yopsDraft.id;
      }

      if (prepared.yopsDraft.operations.length === 0) {
        throw new Error(
          'No YOps operations were generated. Include at least one source turn or material, then retry.'
        );
      }

      setWorkspaceOverrides((current) => ({
        ...current,
        [prepared.id]: prepared,
      }));
      updateSelectedFlow(
        {
          candidateId,
          commitHash: undefined,
          error: undefined,
          extracting: false,
          sendingToYOps: false,
          validationGapCount: undefined,
          yopsDraftId: yopsDraftId ?? prepared.yopsDraft.id,
        },
        prepared.id
      );
      return prepared;
    } catch (err) {
      updateSelectedFlow(
        {
          error: err instanceof Error ? err.message : 'Workspace draft preparation failed.',
          extracting: false,
          sendingToYOps: false,
        },
        workspace.id
      );
      throw err;
    }
  };

  const handleScenarioCreate = async (name: string, duplicate: boolean) => {
    if (!selectedWorkspace) return;
    const scenarioId = `workspace_scenario:${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();
    const {
      commitOverride: _commitOverride,
      lastCommitHash: _lastCommitHash,
      revision: _revision,
      ...sourceWorkspace
    } = selectedWorkspace;
    const scenario: WorkspaceCandidate = {
      ...sourceWorkspace,
      id: scenarioId,
      title: name.trim() || (duplicate ? `${selectedWorkspace.title} copy` : 'New scenario'),
      status: 'draft',
      updatedAt: createdAt,
      scenario: {
        id: scenarioId,
        name: name.trim() || (duplicate ? `${selectedWorkspace.title} copy` : 'New scenario'),
        createdAt,
        sourceWorkspaceId: selectedWorkspace.id,
      },
      ...(duplicate
        ? {}
        : {
            schemaCandidate: {
              summary: 'Collect source evidence, then generate this scenario proposal.',
              fields: [],
            },
            schemaReview: {
              verdict: 'needs_review',
              summary: 'This scenario needs a source-backed candidate proposal.',
              gaps: ['Generate a candidate proposal from source evidence.'],
            },
            yopsDraft: { id: `draft:${scenarioId}`, operations: [] },
          }),
    };
    updateSelectedFlow({ continuationBusy: true, error: undefined });
    try {
      const saved = await saveWorkspaceDraft(
        scenario,
        duplicate ? 'scenario.duplicate' : 'scenario.create'
      );
      setWorkspaceOverrides((current) => ({
        ...current,
        [saved.workspace.id]: saved.workspace,
      }));
      selectWorkspace(saved.workspace.id);
      setActiveWorkflowTab('chat');
      await onWorkspacesRefresh?.();
      updateSelectedFlow({ continuationBusy: false, error: undefined }, saved.workspace.id);
    } catch (error) {
      updateSelectedFlow({
        continuationBusy: false,
        error: error instanceof Error ? error.message : 'Scenario creation failed.',
      });
      throw error;
    }
  };

  const handleScenarioRename = async (name: string) => {
    if (!selectedWorkspace?.scenario || !name.trim()) return;
    const next = {
      ...selectedWorkspace,
      title: name.trim(),
      scenario: {
        id: selectedWorkspace.scenario.id,
        name: name.trim(),
        createdAt: selectedWorkspace.scenario.createdAt,
        ...(selectedWorkspace.scenario.sourceWorkspaceId
          ? { sourceWorkspaceId: selectedWorkspace.scenario.sourceWorkspaceId }
          : {}),
      },
    };
    await handleWorkspaceDraftCommand(next, 'scenario.rename');
  };

  const handleScenarioArchive = async () => {
    if (!selectedWorkspace?.scenario) return;
    const next = {
      ...selectedWorkspace,
      scenario: { ...selectedWorkspace.scenario, archivedAt: new Date().toISOString() },
    };
    await handleWorkspaceDraftCommand(next, 'scenario.archive');
    const fallback = availableCandidates.find(
      (candidate) => candidate.id !== next.id && !candidate.scenario?.archivedAt
    );
    if (fallback) selectWorkspace(fallback.id);
  };

  const handleApplyAfterRefresh = async (
    localWorkspace: WorkspaceCandidate
  ): Promise<WorkspaceCandidate> => {
    const refreshed = await refreshWorkspaces(localWorkspace.projectId);
    const remote = refreshed.find((workspace) => workspace.id === localWorkspace.id);
    if (!remote?.revision) throw new Error('The latest remote Workspace could not be loaded.');
    const rebased = {
      ...localWorkspace,
      revision: remote.revision,
      updatedAt: remote.updatedAt,
    };
    return handleWorkspaceDraftCommand(rebased, 'collaboration.apply_after_refresh');
  };

  if (viewState === 'loading') {
    return (
      <section className="h-full overflow-auto p-4" data-project-id={projectId}>
        <output className="mx-auto flex min-h-64 w-full max-w-6xl items-center justify-center rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] text-sm text-[var(--text-secondary)]">
          Loading workspaces
        </output>
      </section>
    );
  }

  if (viewState === 'error') {
    return (
      <section className="h-full overflow-auto p-4" data-project-id={projectId}>
        <div
          className="mx-auto flex min-h-64 w-full max-w-6xl items-center justify-center rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error-muted)] px-4 text-sm text-[var(--status-error)]"
          role="alert"
        >
          {errorMessage ?? 'Unable to load workspaces.'}
        </div>
      </section>
    );
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-panel)]"
      data-project-id={projectId}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {candidates.length === 0 ? (
          <WorkspaceEmptyState message="No workspaces yet." />
        ) : (
          <WorkspaceDetail
            activeTab={activeWorkflowTab}
            branchOptions={branchOptions}
            candidate={selectedWorkspaceWithFlow}
            candidates={availableCandidates.filter((candidate) => !candidate.scenario?.archivedAt)}
            flowState={selectedFlow}
            onExtractCandidate={handleExtractCandidate}
            onGenerateProposal={handleGenerateProposal}
            onChatSourceEvidenceChange={handleChatSourceEvidenceChange}
            onContinueFromCommit={handleContinueFromCommit}
            onSendToYOps={handleSendToYOps}
            onProposalAction={handleProposalAction}
            onProposalPostureChange={handleProposalPostureChange}
            onVerifyProposal={handleVerifyProposal}
            onViewCommitInState={onViewCommitInState}
            onWorkflowTabChange={setActiveWorkflowTab}
            onYOpsApplied={handleYOpsApplied}
            onYOpsCommitted={handleCommitted}
            onYOpsScriptSave={handleYOpsScriptSave}
            onSourceMaterialUploaded={onSourceMaterialUploaded}
            onSourceArtifactChange={handleSourceArtifactChange}
            onDraftCommand={handleWorkspaceDraftCommand}
            onPrepareDraft={handlePrepareDraft}
            onApplyAfterRefresh={handleApplyAfterRefresh}
            onScenarioArchive={handleScenarioArchive}
            onScenarioCreate={handleScenarioCreate}
            onScenarioRename={handleScenarioRename}
            onScenarioSelect={selectWorkspace}
            onWorkspaceBranchChange={onWorkspaceBranchChange}
          />
        )}
      </div>
    </section>
  );
}

function WorkspaceDetail({
  activeTab,
  branchOptions,
  candidate,
  candidates,
  flowState,
  onApplyAfterRefresh,
  onExtractCandidate,
  onGenerateProposal,
  onChatSourceEvidenceChange,
  onContinueFromCommit,
  onProposalAction,
  onProposalPostureChange,
  onSendToYOps,
  onSourceMaterialUploaded,
  onSourceArtifactChange,
  onDraftCommand,
  onPrepareDraft,
  onScenarioArchive,
  onScenarioCreate,
  onScenarioRename,
  onScenarioSelect,
  onWorkflowTabChange,
  onWorkspaceBranchChange,
  onYOpsApplied,
  onYOpsCommitted,
  onYOpsScriptSave,
  onViewCommitInState,
  onVerifyProposal,
}: {
  activeTab: WorkspaceTabId;
  branchOptions?: string[];
  candidate: WorkspaceCandidate | null;
  candidates: WorkspaceCandidate[];
  flowState?: WorkspaceFlowState;
  onApplyAfterRefresh: (workspace: WorkspaceCandidate) => Promise<WorkspaceCandidate>;
  onExtractCandidate: (options?: WorkspacePreparationOptions) => void;
  onGenerateProposal: (options?: WorkspacePreparationOptions) => void;
  onChatSourceEvidenceChange?: (sourceId: string, source: SourceBundleItem | null) => void;
  onContinueFromCommit: (
    commitHash: string,
    targetBranch: string,
    createBranchFrom?: string
  ) => Promise<void>;
  onProposalAction: (action: ProposalGenerationAction) => void;
  onProposalPostureChange: (posture: WorkspaceProposalPosture) => void;
  onSendToYOps: () => void;
  onSourceMaterialUploaded?: () => Promise<void> | void;
  onSourceArtifactChange?: (artifact: WorkspaceSourceArtifact | undefined) => void;
  onDraftCommand: (
    workspace: WorkspaceCandidate,
    command: WorkspaceDraftCommandName
  ) => Promise<WorkspaceCandidate>;
  onPrepareDraft: (
    workspace: WorkspaceCandidate,
    options: WorkspacePreparationOptions
  ) => Promise<WorkspaceCandidate>;
  onScenarioArchive: () => Promise<void>;
  onScenarioCreate: (name: string, duplicate: boolean) => Promise<void>;
  onScenarioRename: (name: string) => Promise<void>;
  onScenarioSelect: (workspaceId: string) => void;
  onWorkflowTabChange: (tab: WorkspaceTabId) => void;
  onWorkspaceBranchChange?: (branch: string) => Promise<void> | void;
  onYOpsApplied: (remainingSchemaGapCount: number) => void;
  onYOpsCommitted: (commitHash: string, branch: string, workspace: WorkspaceCandidate) => void;
  onYOpsScriptSave: (workspace: WorkspaceCandidate) => Promise<void>;
  onViewCommitInState?: (commitHash: string, branch: string) => void;
  onVerifyProposal: () => void;
}) {
  if (!candidate) return null;

  return (
    <section
      aria-label="Workspace detail"
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface-panel)]"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <WorkspaceTabs
          activeTab={activeTab}
          branchOptions={branchOptions}
          candidate={candidate}
          scenarioOptions={candidates}
          candidateExtracted={Boolean(flowState?.candidateId)}
          extractingCandidate={Boolean(flowState?.extracting)}
          flowError={flowState?.error}
          continuationBusy={Boolean(flowState?.continuationBusy)}
          sourceConversationId={flowState?.sourceConversationId}
          sourceParentCommitHash={
            flowState?.sourceParentCommitHash ?? getWorkspaceSourceParentCommitHash(candidate)
          }
          onSourceMaterialUploaded={onSourceMaterialUploaded}
          onSourceArtifactChange={onSourceArtifactChange}
          onDraftCommand={onDraftCommand}
          onApplyAfterRefresh={onApplyAfterRefresh}
          onPrepareDraft={onPrepareDraft}
          onScenarioArchive={onScenarioArchive}
          onScenarioCreate={onScenarioCreate}
          onScenarioRename={onScenarioRename}
          onScenarioSelect={onScenarioSelect}
          onWorkspaceBranchChange={onWorkspaceBranchChange}
          onChatSourceEvidenceChange={onChatSourceEvidenceChange}
          onContinueFromCommit={onContinueFromCommit}
          onExtractCandidate={onExtractCandidate}
          onGenerateProposal={onGenerateProposal}
          onProposalAction={onProposalAction}
          onProposalPostureChange={onProposalPostureChange}
          onSendToYOps={onSendToYOps}
          onVerifyProposal={onVerifyProposal}
          onYOpsScriptSave={onYOpsScriptSave}
          onYOpsApplied={onYOpsApplied}
          onYOpsCommitted={onYOpsCommitted}
          onViewCommitInState={onViewCommitInState}
          onWorkflowTabChange={onWorkflowTabChange}
          sendingToYOps={Boolean(flowState?.sendingToYOps)}
          proposalReviewState={flowState?.proposalReviewState}
          proposalGeneration={flowState?.proposalGeneration}
          proposalGenerationBusy={Boolean(flowState?.proposalGenerationBusy)}
          proposalPosture={flowState?.proposalPosture ?? 'guided'}
          yopsDraftSent={Boolean(flowState?.yopsDraftId) && hasYOpsOperations(candidate)}
        />
      </div>
    </section>
  );
}

function hasYOpsOperations(candidate: WorkspaceCandidate | null | undefined): boolean {
  return Boolean(candidate?.yopsDraft.operations.length);
}

function getWorkspaceSourceParentCommitHash(candidate: WorkspaceCandidate): string | undefined {
  if (candidate.status !== 'draft') return undefined;
  return candidate.baseCommitHash ?? undefined;
}

function mergeWorkspaceOverride(
  candidate: WorkspaceCandidate,
  override?: WorkspaceCandidate
): WorkspaceCandidate {
  if (!override) return candidate;

  const merged = {
    ...candidate,
    ...override,
    outputTargets: candidate.outputTargets,
    schemaBindings: candidate.schemaBindings,
    sourceBundle: mergeWorkspaceSourceBundles(candidate.sourceBundle, override.sourceBundle),
  };

  if (override.status !== 'committed' && !override.lastCommitHash) {
    delete merged.lastCommitHash;
  }

  return merged;
}

function mergeWorkspaceSourceBundles(
  candidateSources: SourceBundleItem[],
  overrideSources: SourceBundleItem[]
): SourceBundleItem[] {
  const localSources = overrideSources.filter((source) => !source.materialId);
  const refreshedMaterials = candidateSources.filter((source) => Boolean(source.materialId));
  return [...localSources, ...refreshedMaterials];
}

function upsertWorkspaceSourceBundle(
  sourceBundle: SourceBundleItem[],
  sourceId: string,
  source: SourceBundleItem | null
): SourceBundleItem[] {
  const existingIndex = sourceBundle.findIndex((item) => item.id === sourceId);
  if (!source) {
    return existingIndex < 0
      ? sourceBundle
      : sourceBundle.filter((_, index) => index !== existingIndex);
  }

  if (existingIndex >= 0) {
    return sourceBundle.map((item, index) => (index === existingIndex ? source : item));
  }

  const firstMaterialIndex = sourceBundle.findIndex((item) => Boolean(item.materialId));
  if (firstMaterialIndex < 0) return [...sourceBundle, source];

  return [
    ...sourceBundle.slice(0, firstMaterialIndex),
    source,
    ...sourceBundle.slice(firstMaterialIndex),
  ];
}

function resetWorkspaceProposalAfterSourceChange(
  workspace: WorkspaceCandidate,
  sourceBundle: SourceBundleItem[]
): WorkspaceCandidate {
  const {
    commitOverride: _commitOverride,
    lastCommitHash: _lastCommitHash,
    ...editableWorkspace
  } = workspace;

  return {
    ...editableWorkspace,
    sourceBundle,
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
    yopsDraft: {
      id: workspace.yopsDraft.id,
      operations: [],
    },
  };
}

function sourceBundlesEqual(left: SourceBundleItem[], right: SourceBundleItem[]): boolean {
  if (left.length !== right.length) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

function selectWorkspaceSourceBundle(
  candidate: WorkspaceCandidate,
  pins: Array<{ type: string; ref_id: string }>
): WorkspaceCandidate {
  const importRefs = new Set(pins.filter((pin) => pin.type === 'import').map((pin) => pin.ref_id));
  const turnRefs = new Set(
    pins.filter((pin) => pin.type === 'conversation_turn').map((pin) => pin.ref_id)
  );

  const sourceBundle = candidate.sourceBundle.flatMap((source) => {
    if (source.materialId) return importRefs.has(source.materialId) ? [source] : [];
    if (source.type !== 'chat') return [];

    const previewTurns = source.previewTurns?.filter((turn) => turnRefs.has(turn.id)) ?? [];
    return previewTurns.length > 0 ? [{ ...source, previewTurns }] : [];
  });

  return { ...candidate, sourceBundle };
}

function isWorkspaceRevisionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === 'CONFLICT' &&
    /Workspace changed since it was loaded|revision|refresh and retry/i.test(message)
  );
}

function WorkspaceEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-card)] p-8 text-center text-sm text-[var(--text-secondary)]">
      {message}
    </div>
  );
}
