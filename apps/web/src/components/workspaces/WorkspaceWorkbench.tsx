import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { selectWorkspaceCandidate } from '@/domain/workspaces/selectors';
import { useWorkspaceFlow } from '@/hooks/workspaces/useWorkspaceFlow';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { cn } from '@/utils/cn';
import { WorkspaceHeader as WorkspaceCandidateHeader } from './WorkspaceHeader';
import { type WorkspaceTabId, WorkspaceTabs, WorkspaceWorkflowTabs } from './WorkspaceTabs';

type WorkspaceWorkbenchViewState = 'ready' | 'loading' | 'error';

interface WorkspaceFlowState {
  candidateId?: string;
  yopsDraftId?: string;
  commitHash?: string;
  extracting?: boolean;
  sendingToYOps?: boolean;
  error?: string;
}

interface WorkspaceWorkbenchProps {
  candidates: WorkspaceCandidate[];
  projectId: string;
  viewState?: WorkspaceWorkbenchViewState;
  errorMessage?: string;
  selectedWorkspaceId?: string | null;
  onSelectedWorkspaceChange?: (workspaceId: string) => void;
  onSourceMaterialUploaded?: () => Promise<void> | void;
}

export function WorkspaceWorkbench({
  candidates,
  errorMessage,
  onSourceMaterialUploaded,
  projectId,
  selectedWorkspaceId,
  viewState = 'ready',
}: WorkspaceWorkbenchProps) {
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<WorkspaceTabId>('chat');
  const [flowByWorkspaceId, setFlowByWorkspaceId] = useState<Record<string, WorkspaceFlowState>>(
    {}
  );
  const [workspaceOverrides, setWorkspaceOverrides] = useState<Record<string, WorkspaceCandidate>>(
    {}
  );
  const { extractCandidate, sendToYOps } = useWorkspaceFlow();

  const baseSelectedWorkspace = selectWorkspaceCandidate(candidates, selectedWorkspaceId ?? null);
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

  const updateSelectedFlow = (patch: WorkspaceFlowState) => {
    if (!selectedWorkspace) return;
    setFlowByWorkspaceId((current) => ({
      ...current,
      [selectedWorkspace.id]: {
        ...current[selectedWorkspace.id],
        ...patch,
      },
    }));
  };

  const handleExtractCandidate = async () => {
    if (!selectedWorkspace) return;

    updateSelectedFlow({ error: undefined, extracting: true });
    try {
      const result = await extractCandidate(selectedWorkspace);
      setWorkspaceOverrides((current) => ({
        ...current,
        [result.workspace.id]: result.workspace,
      }));
      updateSelectedFlow({
        candidateId: result.candidate_id,
        error: undefined,
        extracting: false,
      });
      setActiveWorkflowTab('yschema');
    } catch (err) {
      updateSelectedFlow({
        error: err instanceof Error ? err.message : 'Candidate extraction failed.',
        extracting: false,
      });
    }
  };

  const handleSendToYOps = async () => {
    if (!selectedWorkspace) return;

    updateSelectedFlow({ error: undefined, sendingToYOps: true });
    try {
      const result = await sendToYOps(selectedWorkspace);
      setWorkspaceOverrides((current) => ({
        ...current,
        [result.workspace.id]: result.workspace,
      }));
      updateSelectedFlow({
        candidateId: result.candidate_id,
        error: undefined,
        sendingToYOps: false,
        yopsDraftId: result.yops_draft_id ?? result.workspace.yopsDraft.id,
      });
      setActiveWorkflowTab('yops');
    } catch (err) {
      updateSelectedFlow({
        error: err instanceof Error ? err.message : 'YOps draft generation failed.',
        sendingToYOps: false,
      });
    }
  };

  const handleCommitted = (commitHash: string) => {
    updateSelectedFlow({ commitHash });
    setActiveWorkflowTab('leaf-config');
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
    <section className="h-full overflow-auto p-4" data-project-id={projectId}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <WorkspacesHeader count={candidates.length} />

        <WorkspaceToolbar
          activeWorkflowTab={activeWorkflowTab}
          flowState={selectedFlow}
          selectedWorkspace={selectedWorkspaceWithFlow}
          onWorkflowTabChange={setActiveWorkflowTab}
        />

        {candidates.length === 0 ? (
          <WorkspaceEmptyState message="No workspaces yet." />
        ) : (
          <WorkspaceDetail
            activeTab={activeWorkflowTab}
            candidate={selectedWorkspaceWithFlow}
            flowState={selectedFlow}
            onExtractCandidate={handleExtractCandidate}
            onSendToYOps={handleSendToYOps}
            onYOpsCommitted={handleCommitted}
            onSourceMaterialUploaded={onSourceMaterialUploaded}
          />
        )}
      </div>
    </section>
  );
}

function WorkspacesHeader({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Workspaces</h2>
        <Badge variant="branch">{count} total</Badge>
      </div>
    </div>
  );
}

function WorkspaceToolbar({
  activeWorkflowTab,
  flowState,
  onWorkflowTabChange,
  selectedWorkspace,
}: {
  activeWorkflowTab: WorkspaceTabId;
  flowState?: WorkspaceFlowState;
  onWorkflowTabChange: (tab: WorkspaceTabId) => void;
  selectedWorkspace: WorkspaceCandidate | null;
}) {
  return (
    <div className="flex flex-col gap-2 border-y border-[var(--stroke-divider)] py-3">
      <WorkspaceWorkflowTabs
        activeTab={activeWorkflowTab}
        candidate={selectedWorkspace}
        onTabChange={onWorkflowTabChange}
      />
      {selectedWorkspace ? (
        <WorkspaceFlowRail candidate={selectedWorkspace} flowState={flowState} />
      ) : null}
    </div>
  );
}

function WorkspaceFlowRail({
  candidate,
  flowState,
}: {
  candidate: WorkspaceCandidate;
  flowState?: WorkspaceFlowState;
}) {
  const steps = [
    { label: 'Source', done: candidate.sourceBundle.length > 0 },
    { label: 'Candidate', done: Boolean(flowState?.candidateId) },
    { label: 'YOps draft', done: Boolean(flowState?.yopsDraftId) },
    { label: 'Commit', done: Boolean(flowState?.commitHash ?? candidate.lastCommitHash) },
  ];

  return (
    <fieldset className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-secondary)]">
      <legend className="sr-only">Workspace flow status</legend>
      {steps.map((step, index) => (
        <span className="inline-flex items-center gap-1.5" key={step.label}>
          <span
            className={cn(
              'inline-flex h-6 items-center rounded-full border px-2 font-medium',
              step.done
                ? 'border-[var(--accent-commit)]/30 bg-[var(--accent-commit)]/10 text-[var(--accent-commit)]'
                : 'border-[var(--stroke-divider)] bg-[var(--surface-card)] text-[var(--text-tertiary)]'
            )}
          >
            {step.label}
          </span>
          {index < steps.length - 1 ? (
            <span className="text-[var(--text-quaternary)]" aria-hidden="true">
              /
            </span>
          ) : null}
        </span>
      ))}
    </fieldset>
  );
}

function WorkspaceDetail({
  activeTab,
  candidate,
  flowState,
  onExtractCandidate,
  onSendToYOps,
  onSourceMaterialUploaded,
  onYOpsCommitted,
}: {
  activeTab: WorkspaceTabId;
  candidate: WorkspaceCandidate | null;
  flowState?: WorkspaceFlowState;
  onExtractCandidate: () => void;
  onSendToYOps: () => void;
  onSourceMaterialUploaded?: () => Promise<void> | void;
  onYOpsCommitted: (commitHash: string) => void;
}) {
  if (!candidate) return null;

  return (
    <section
      aria-label="Workspace detail"
      className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
    >
      <div className="flex flex-col gap-3">
        {activeTab !== 'chat' ? <WorkspaceCandidateHeader candidate={candidate} /> : null}
        <WorkspaceTabs
          activeTab={activeTab}
          candidate={candidate}
          candidateExtracted={Boolean(flowState?.candidateId)}
          extractingCandidate={Boolean(flowState?.extracting)}
          flowError={flowState?.error}
          onSourceMaterialUploaded={onSourceMaterialUploaded}
          onExtractCandidate={onExtractCandidate}
          onSendToYOps={onSendToYOps}
          onYOpsCommitted={onYOpsCommitted}
          sendingToYOps={Boolean(flowState?.sendingToYOps)}
          yopsDraftSent={Boolean(flowState?.yopsDraftId)}
        />
      </div>
    </section>
  );
}

function mergeWorkspaceOverride(
  candidate: WorkspaceCandidate,
  override?: WorkspaceCandidate
): WorkspaceCandidate {
  if (!override) return candidate;

  return {
    ...candidate,
    ...override,
    outputTargets: candidate.outputTargets,
    schemaBindings: candidate.schemaBindings,
    sourceBundle: candidate.sourceBundle,
  };
}

function WorkspaceEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-card)] p-8 text-center text-sm text-[var(--text-secondary)]">
      {message}
    </div>
  );
}
