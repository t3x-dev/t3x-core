import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { selectWorkspaceCandidate } from '@/domain/workspaces/selectors';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { WorkspaceHeader as WorkspaceCandidateHeader } from './WorkspaceHeader';
import { WorkspaceSelector } from './WorkspaceSelector';
import { type WorkspaceTabId, WorkspaceTabs, WorkspaceWorkflowTabs } from './WorkspaceTabs';

type WorkspaceWorkbenchViewState = 'ready' | 'loading' | 'error';

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
  onSelectedWorkspaceChange,
  onSourceMaterialUploaded,
  projectId,
  selectedWorkspaceId,
  viewState = 'ready',
}: WorkspaceWorkbenchProps) {
  const [internalSelectedWorkspaceId, setInternalSelectedWorkspaceId] = useState<string | null>(
    selectedWorkspaceId ?? null
  );
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<WorkspaceTabId>('chat');

  useEffect(() => {
    setInternalSelectedWorkspaceId(selectedWorkspaceId ?? null);
  }, [selectedWorkspaceId]);

  const selectedWorkspace = selectWorkspaceCandidate(candidates, internalSelectedWorkspaceId);

  const handleSelectWorkspace = (workspaceId: string) => {
    setInternalSelectedWorkspaceId(workspaceId);
    onSelectedWorkspaceChange?.(workspaceId);
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
          selectedWorkspace={selectedWorkspace}
          onWorkflowTabChange={setActiveWorkflowTab}
        />

        {candidates.length === 0 ? (
          <WorkspaceEmptyState message="No workspaces yet." />
        ) : activeWorkflowTab === 'chat' ? (
          <WorkspaceDetail
            activeTab={activeWorkflowTab}
            candidate={selectedWorkspace}
            onSourceMaterialUploaded={onSourceMaterialUploaded}
          />
        ) : (
          <div className="grid min-h-0 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <WorkspaceCandidateList
              candidates={candidates}
              selectedWorkspaceId={selectedWorkspace?.id ?? null}
              onSelectWorkspace={handleSelectWorkspace}
            />
            <WorkspaceDetail
              activeTab={activeWorkflowTab}
              candidate={selectedWorkspace}
              onSourceMaterialUploaded={onSourceMaterialUploaded}
            />
          </div>
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
  onWorkflowTabChange,
  selectedWorkspace,
}: {
  activeWorkflowTab: WorkspaceTabId;
  onWorkflowTabChange: (tab: WorkspaceTabId) => void;
  selectedWorkspace: WorkspaceCandidate | null;
}) {
  return (
    <div className="border-y border-[var(--stroke-divider)] py-3">
      <WorkspaceWorkflowTabs
        activeTab={activeWorkflowTab}
        candidate={selectedWorkspace}
        onTabChange={onWorkflowTabChange}
      />
    </div>
  );
}

const WorkspaceCandidateList = WorkspaceSelector;

function WorkspaceDetail({
  activeTab,
  candidate,
  onSourceMaterialUploaded,
}: {
  activeTab: WorkspaceTabId;
  candidate: WorkspaceCandidate | null;
  onSourceMaterialUploaded?: () => Promise<void> | void;
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
          onSourceMaterialUploaded={onSourceMaterialUploaded}
        />
      </div>
    </section>
  );
}

function WorkspaceEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-card)] p-8 text-center text-sm text-[var(--text-secondary)]">
      {message}
    </div>
  );
}
