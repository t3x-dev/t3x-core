import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  filterWorkspaceCandidates,
  selectWorkspaceCandidate,
  sortWorkspaceCandidates,
} from '@/domain/workspaces/selectors';
import type { WorkspaceCandidate, WorkspaceSortKey } from '@/types/workspaces';
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
}

const SORT_OPTIONS: { label: string; value: WorkspaceSortKey }[] = [
  { label: 'Recently updated', value: 'updated_desc' },
  { label: 'Title A-Z', value: 'title_asc' },
];

export function WorkspaceWorkbench({
  candidates,
  errorMessage,
  onSelectedWorkspaceChange,
  projectId,
  selectedWorkspaceId,
  viewState = 'ready',
}: WorkspaceWorkbenchProps) {
  const [query, setQuery] = useState('');
  const [internalSelectedWorkspaceId, setInternalSelectedWorkspaceId] = useState<string | null>(
    selectedWorkspaceId ?? null
  );
  const [sortKey, setSortKey] = useState<WorkspaceSortKey>('updated_desc');
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<WorkspaceTabId>('chat');

  useEffect(() => {
    setInternalSelectedWorkspaceId(selectedWorkspaceId ?? null);
  }, [selectedWorkspaceId]);

  const visibleCandidates = useMemo(
    () =>
      sortWorkspaceCandidates(
        filterWorkspaceCandidates(candidates, { query, status: 'all' }),
        sortKey
      ),
    [candidates, query, sortKey]
  );
  const selectedWorkspace = selectWorkspaceCandidate(
    visibleCandidates,
    internalSelectedWorkspaceId
  );

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
          query={query}
          sortKey={sortKey}
          onWorkflowTabChange={setActiveWorkflowTab}
          onQueryChange={setQuery}
          onSortKeyChange={setSortKey}
        />

        {candidates.length === 0 ? (
          <WorkspaceEmptyState message="No workspaces yet." />
        ) : visibleCandidates.length === 0 ? (
          <WorkspaceEmptyState message="No workspaces match the current filters." />
        ) : (
          <div className="grid min-h-0 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <WorkspaceCandidateList
              candidates={visibleCandidates}
              selectedWorkspaceId={selectedWorkspace?.id ?? null}
              onSelectWorkspace={handleSelectWorkspace}
            />
            <WorkspaceDetail activeTab={activeWorkflowTab} candidate={selectedWorkspace} />
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
  onQueryChange,
  onSortKeyChange,
  onWorkflowTabChange,
  query,
  selectedWorkspace,
  sortKey,
}: {
  activeWorkflowTab: WorkspaceTabId;
  onQueryChange: (query: string) => void;
  onSortKeyChange: (sortKey: WorkspaceSortKey) => void;
  onWorkflowTabChange: (tab: WorkspaceTabId) => void;
  query: string;
  selectedWorkspace: WorkspaceCandidate | null;
  sortKey: WorkspaceSortKey;
}) {
  return (
    <div className="flex flex-col gap-3 border-y border-[var(--stroke-divider)] py-3">
      <WorkspaceWorkflowTabs
        activeTab={activeWorkflowTab}
        candidate={selectedWorkspace}
        onTabChange={onWorkflowTabChange}
      />

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-secondary)]">
          <span>Search workspaces</span>
          <input
            className="h-9 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-branch)]"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Chat, document, schema"
            type="search"
            value={query}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-secondary)]">
          <span>Sort workspaces</span>
          <select
            className="h-9 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-branch)]"
            onChange={(event) => onSortKeyChange(event.target.value as WorkspaceSortKey)}
            value={sortKey}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

const WorkspaceCandidateList = WorkspaceSelector;

function WorkspaceDetail({
  activeTab,
  candidate,
}: {
  activeTab: WorkspaceTabId;
  candidate: WorkspaceCandidate | null;
}) {
  if (!candidate) return null;

  return (
    <section
      aria-label="Workspace detail"
      className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
    >
      <div className="flex flex-col gap-3">
        <WorkspaceCandidateHeader candidate={candidate} />
        <WorkspaceTabs activeTab={activeTab} candidate={candidate} />
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
