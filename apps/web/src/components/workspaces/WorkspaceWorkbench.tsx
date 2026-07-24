import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { WorkspaceSourceView } from '@/domain/workspaces/navigation';
import { selectWorkspaceCandidate } from '@/domain/workspaces/selectors';
import { useWorkspaceFlow } from '@/hooks/workspaces/useWorkspaceFlow';
import { usePinsStore } from '@/store/pinsStore';
import type { SourceBundleItem, WorkspaceCandidate } from '@/types/workspaces';
import { cn } from '@/utils/cn';
import { type WorkspaceTabId, WorkspaceTabs, WorkspaceWorkflowTabs } from './WorkspaceTabs';

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
  validationGapCount?: number;
  error?: string;
}

interface WorkspaceWorkbenchProps {
  candidates: WorkspaceCandidate[];
  projectId: string;
  viewState?: WorkspaceWorkbenchViewState;
  errorMessage?: string;
  navigationConversationId?: string;
  selectedWorkspaceId?: string | null;
  onSelectedWorkspaceChange?: (workspaceId: string) => void;
  onSourceMaterialUploaded?: () => Promise<void> | void;
  onViewCommitInState?: (commitHash: string, branch: string) => void;
  restoreStoredConversation?: boolean;
  selectionRequiredReason?: string;
  sourceView?: WorkspaceSourceView;
}

export function WorkspaceWorkbench({
  candidates,
  errorMessage,
  navigationConversationId,
  onSelectedWorkspaceChange,
  onSourceMaterialUploaded,
  onViewCommitInState,
  projectId,
  restoreStoredConversation = true,
  selectedWorkspaceId,
  selectionRequiredReason,
  sourceView,
  viewState = 'ready',
}: WorkspaceWorkbenchProps) {
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<WorkspaceTabId>('chat');
  const [flowByWorkspaceId, setFlowByWorkspaceId] = useState<Record<string, WorkspaceFlowState>>(
    {}
  );
  const [workspaceOverrides, setWorkspaceOverrides] = useState<Record<string, WorkspaceCandidate>>(
    {}
  );
  const pins = usePinsStore((state) => state.pins);
  const { extractCandidate, sendToYOps, startNextIteration } = useWorkspaceFlow();

  useEffect(() => {
    if (sourceView || navigationConversationId) setActiveWorkflowTab('chat');
  }, [navigationConversationId, selectedWorkspaceId, sourceView]);

  const baseSelectedWorkspace = selectionRequiredReason
    ? null
    : selectWorkspaceCandidate(candidates, selectedWorkspaceId ?? null);
  const selectedWorkspace = baseSelectedWorkspace
    ? mergeWorkspaceOverride(baseSelectedWorkspace, workspaceOverrides[baseSelectedWorkspace.id])
    : null;
  const selectedFlow = baseSelectedWorkspace
    ? flowByWorkspaceId[baseSelectedWorkspace.id]
    : undefined;
  const selectedWorkspaceWithFlow =
    selectedWorkspace && selectedFlow?.commitHash
      ? {
          ...selectedWorkspace,
          lastCommitHash: selectedFlow.commitHash,
          status: 'committed' as const,
        }
      : selectedWorkspace;

  const updateSelectedFlow = (patch: WorkspaceFlowState) => {
    if (!baseSelectedWorkspace) return;
    setFlowByWorkspaceId((current) => ({
      ...current,
      [baseSelectedWorkspace.id]: {
        ...current[baseSelectedWorkspace.id],
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

        return {
          ...current,
          [baseSelectedWorkspace.id]: {
            ...(existingOverride ?? baseSelectedWorkspace),
            sourceBundle,
          },
        };
      });
    },
    [baseSelectedWorkspace]
  );

  const handleExtractCandidate = async () => {
    if (!selectedWorkspace || !baseSelectedWorkspace) return;

    updateSelectedFlow({ error: undefined, extracting: true });
    try {
      const result = await extractCandidate(selectWorkspaceSourceBundle(selectedWorkspace, pins));
      setWorkspaceOverrides((current) => ({
        ...current,
        [baseSelectedWorkspace.id]: result.workspace,
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

  const handleSendToYOps = async () => {
    if (!selectedWorkspace || !baseSelectedWorkspace) return;

    updateSelectedFlow({ error: undefined, sendingToYOps: true });
    try {
      const result = await sendToYOps(selectedWorkspace);
      const hasOperations = hasYOpsOperations(result.workspace);
      setWorkspaceOverrides((current) => ({
        ...current,
        [baseSelectedWorkspace.id]: result.workspace,
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

  const handleCommitted = (commitHash: string) => {
    updateSelectedFlow({ commitHash });
    setActiveWorkflowTab('commit');
  };

  const handleContinueFromCommit = async (
    commitHash: string,
    targetBranch: string,
    createBranchFrom?: string
  ) => {
    if (!selectedWorkspace || !baseSelectedWorkspace) return;

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
        [baseSelectedWorkspace.id]: result.workspace,
      }));
      updateSelectedFlow({
        candidateId: undefined,
        commitHash: undefined,
        continuationBusy: false,
        error: undefined,
        sourceConversationId: result.conversationId,
        sourceParentCommitHash: commitHash,
        validationGapCount: undefined,
        yopsDraftId: undefined,
      });
      setActiveWorkflowTab('chat');
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
    <section className="h-full overflow-auto p-3 sm:p-4" data-project-id={projectId}>
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3">
        <WorkspacesHeader />

        {selectionRequiredReason ? (
          <WorkspaceSelectionRequired
            candidates={candidates}
            onSelect={onSelectedWorkspaceChange}
            reason={selectionRequiredReason}
          />
        ) : (
          <>
            <WorkspaceToolbar
              activeWorkflowTab={activeWorkflowTab}
              selectedWorkspace={selectedWorkspaceWithFlow}
              onWorkflowTabChange={setActiveWorkflowTab}
              validationGapCount={selectedFlow?.validationGapCount}
            />

            {candidates.length === 0 ? (
              <WorkspaceEmptyState message="No workspaces yet." />
            ) : (
              <WorkspaceDetail
                activeTab={activeWorkflowTab}
                candidate={selectedWorkspaceWithFlow}
                flowState={selectedFlow}
                navigationConversationId={navigationConversationId}
                onExtractCandidate={handleExtractCandidate}
                onChatSourceEvidenceChange={handleChatSourceEvidenceChange}
                onContinueFromCommit={handleContinueFromCommit}
                onSendToYOps={handleSendToYOps}
                onViewCommitInState={onViewCommitInState}
                onWorkflowTabChange={setActiveWorkflowTab}
                onYOpsApplied={handleYOpsApplied}
                onYOpsCommitted={handleCommitted}
                onSourceMaterialUploaded={onSourceMaterialUploaded}
                restoreStoredConversation={restoreStoredConversation}
                sourceView={sourceView}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}

function WorkspacesHeader() {
  return (
    <div className="flex min-h-10 items-center">
      <h2 className="text-base font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
        T3X Workspace
      </h2>
    </div>
  );
}

function WorkspaceToolbar({
  activeWorkflowTab,
  onWorkflowTabChange,
  selectedWorkspace,
  validationGapCount,
}: {
  activeWorkflowTab: WorkspaceTabId;
  onWorkflowTabChange: (tab: WorkspaceTabId) => void;
  selectedWorkspace: WorkspaceCandidate | null;
  validationGapCount?: number;
}) {
  return (
    <div className="border-y border-[var(--stroke-divider)]">
      <WorkspaceWorkflowTabs
        activeTab={activeWorkflowTab}
        candidate={selectedWorkspace}
        onTabChange={onWorkflowTabChange}
        validationGapCount={validationGapCount}
      />
    </div>
  );
}

function WorkspaceDetail({
  activeTab,
  candidate,
  flowState,
  navigationConversationId,
  onExtractCandidate,
  onChatSourceEvidenceChange,
  onContinueFromCommit,
  onSendToYOps,
  onSourceMaterialUploaded,
  onWorkflowTabChange,
  onYOpsApplied,
  onYOpsCommitted,
  onViewCommitInState,
  restoreStoredConversation,
  sourceView,
}: {
  activeTab: WorkspaceTabId;
  candidate: WorkspaceCandidate | null;
  flowState?: WorkspaceFlowState;
  navigationConversationId?: string;
  onExtractCandidate: () => void;
  onChatSourceEvidenceChange?: (sourceId: string, source: SourceBundleItem | null) => void;
  onContinueFromCommit: (
    commitHash: string,
    targetBranch: string,
    createBranchFrom?: string
  ) => Promise<void>;
  onSendToYOps: () => void;
  onSourceMaterialUploaded?: () => Promise<void> | void;
  onWorkflowTabChange: (tab: WorkspaceTabId) => void;
  onYOpsApplied: (remainingSchemaGapCount: number) => void;
  onYOpsCommitted: (commitHash: string, branch: string) => void;
  onViewCommitInState?: (commitHash: string, branch: string) => void;
  restoreStoredConversation: boolean;
  sourceView?: WorkspaceSourceView;
}) {
  if (!candidate) return null;

  return (
    <section
      aria-label="Workspace detail"
      className={cn(
        'overflow-hidden rounded-md',
        activeTab === 'chat'
          ? 'border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4'
          : 'bg-transparent'
      )}
    >
      <div className={cn('flex flex-col', activeTab === 'chat' ? 'gap-3' : '')}>
        <WorkspaceTabs
          activeTab={activeTab}
          candidate={candidate}
          candidateExtracted={Boolean(flowState?.candidateId)}
          extractingCandidate={Boolean(flowState?.extracting)}
          flowError={flowState?.error}
          continuationBusy={Boolean(flowState?.continuationBusy)}
          sourceConversationId={flowState?.sourceConversationId ?? navigationConversationId}
          sourceParentCommitHash={flowState?.sourceParentCommitHash}
          restoreStoredConversation={
            flowState?.sourceParentCommitHash ? false : restoreStoredConversation
          }
          sourceView={sourceView}
          onSourceMaterialUploaded={onSourceMaterialUploaded}
          onChatSourceEvidenceChange={onChatSourceEvidenceChange}
          onContinueFromCommit={onContinueFromCommit}
          onExtractCandidate={onExtractCandidate}
          onSendToYOps={onSendToYOps}
          onYOpsApplied={onYOpsApplied}
          onYOpsCommitted={onYOpsCommitted}
          onViewCommitInState={onViewCommitInState}
          onWorkflowTabChange={onWorkflowTabChange}
          sendingToYOps={Boolean(flowState?.sendingToYOps)}
          yopsDraftSent={Boolean(flowState?.yopsDraftId) && hasYOpsOperations(candidate)}
        />
      </div>
    </section>
  );
}

function hasYOpsOperations(candidate: WorkspaceCandidate | null | undefined): boolean {
  return Boolean(candidate?.yopsDraft.operations.length);
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
  const next = sourceBundle.filter((item) => item.id !== sourceId);
  if (!source) return next;
  return [...next, source];
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

function WorkspaceEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-card)] p-8 text-center text-sm text-[var(--text-secondary)]">
      {message}
    </div>
  );
}

function WorkspaceSelectionRequired({
  candidates,
  onSelect,
  reason,
}: {
  candidates: WorkspaceCandidate[];
  onSelect?: (workspaceId: string) => void;
  reason: string;
}) {
  return (
    <section
      aria-label="Workspace selection required"
      className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
    >
      <h3 className="text-base font-semibold text-[var(--text-primary)]">Choose a workspace</h3>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{reason}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {candidates.map((candidate) => (
          <Button
            className="h-auto min-h-12 justify-start px-3 py-2 text-left"
            key={candidate.id}
            onClick={() => onSelect?.(candidate.id)}
            type="button"
            variant="canvas-outline"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold">{candidate.title}</span>
              <span className="mt-0.5 block truncate font-mono text-xs text-[var(--text-tertiary)]">
                {candidate.targetBranch}
              </span>
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}
