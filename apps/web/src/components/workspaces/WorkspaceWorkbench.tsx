import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  countWorkspaceStatuses,
  filterWorkspaceCandidates,
  formatWorkspaceStatus,
  getPrimarySchemaBinding,
  getWorkspaceStatusBadgeTone,
  selectWorkspaceCandidate,
  sortWorkspaceCandidates,
  summarizeSourceBundle,
} from '@/domain/workspaces/selectors';
import type {
  SourceBundleItem,
  WorkspaceCandidate,
  WorkspaceSortKey,
  WorkspaceStatusFilter,
} from '@/types/workspaces';
import { cn } from '@/utils/cn';

type WorkspaceWorkbenchViewState = 'ready' | 'loading' | 'error';

interface WorkspaceWorkbenchProps {
  candidates: WorkspaceCandidate[];
  projectId: string;
  viewState?: WorkspaceWorkbenchViewState;
  errorMessage?: string;
}

const STATUS_FILTERS: { label: string; value: WorkspaceStatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Ready for YOps', value: 'ready_for_yops' },
  { label: 'Schema review', value: 'schema_review' },
  { label: 'Committed', value: 'committed' },
];

const SORT_OPTIONS: { label: string; value: WorkspaceSortKey }[] = [
  { label: 'Recently updated', value: 'updated_desc' },
  { label: 'Title A-Z', value: 'title_asc' },
];

export function WorkspaceWorkbench({
  candidates,
  errorMessage,
  projectId,
  viewState = 'ready',
}: WorkspaceWorkbenchProps) {
  const [query, setQuery] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<WorkspaceSortKey>('updated_desc');
  const [statusFilter, setStatusFilter] = useState<WorkspaceStatusFilter>('all');

  const statusCounts = useMemo(() => countWorkspaceStatuses(candidates), [candidates]);
  const visibleCandidates = useMemo(
    () =>
      sortWorkspaceCandidates(
        filterWorkspaceCandidates(candidates, { query, status: statusFilter }),
        sortKey
      ),
    [candidates, query, sortKey, statusFilter]
  );
  const selectedWorkspace = selectWorkspaceCandidate(visibleCandidates, selectedWorkspaceId);

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
        <WorkspaceHeader count={statusCounts.all} />

        <WorkspaceToolbar
          query={query}
          sortKey={sortKey}
          statusCounts={statusCounts}
          statusFilter={statusFilter}
          onQueryChange={setQuery}
          onSortKeyChange={setSortKey}
          onStatusFilterChange={setStatusFilter}
        />

        {candidates.length === 0 ? (
          <WorkspaceEmptyState message="No workspaces yet." />
        ) : visibleCandidates.length === 0 ? (
          <WorkspaceEmptyState message="No workspaces match the current filters." />
        ) : (
          <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <WorkspaceCandidateList
              candidates={visibleCandidates}
              selectedWorkspaceId={selectedWorkspace?.id ?? null}
              onSelectWorkspace={setSelectedWorkspaceId}
            />
            <WorkspaceDetail candidate={selectedWorkspace} />
          </div>
        )}
      </div>
    </section>
  );
}

function WorkspaceHeader({ count }: { count: number }) {
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
  onQueryChange,
  onSortKeyChange,
  onStatusFilterChange,
  query,
  sortKey,
  statusCounts,
  statusFilter,
}: {
  onQueryChange: (query: string) => void;
  onSortKeyChange: (sortKey: WorkspaceSortKey) => void;
  onStatusFilterChange: (statusFilter: WorkspaceStatusFilter) => void;
  query: string;
  sortKey: WorkspaceSortKey;
  statusCounts: Record<WorkspaceStatusFilter, number>;
  statusFilter: WorkspaceStatusFilter;
}) {
  return (
    <div className="flex flex-col gap-3 border-y border-[var(--stroke-divider)] py-3">
      <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
        <legend className="sr-only">Workspace status filters</legend>
        {STATUS_FILTERS.map((filter) => {
          const count = statusCounts[filter.value];
          const pressed = filter.value === statusFilter;

          return (
            <Button
              aria-label={`${filter.label} ${count}`}
              aria-pressed={pressed}
              className={cn(
                'h-8 px-3 text-xs',
                pressed
                  ? 'border-[var(--accent-branch)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)]'
              )}
              key={filter.value}
              onClick={() => onStatusFilterChange(filter.value)}
              size="sm"
              type="button"
              variant="canvas-outline"
            >
              <span>{filter.label}</span>
              <span>{count}</span>
            </Button>
          );
        })}
      </fieldset>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-secondary)]">
          <span>Search workspaces</span>
          <input
            className="h-9 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-branch)]"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Title, source, schema"
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

function WorkspaceCandidateList({
  candidates,
  onSelectWorkspace,
  selectedWorkspaceId,
}: {
  candidates: WorkspaceCandidate[];
  onSelectWorkspace: (workspaceId: string) => void;
  selectedWorkspaceId: string | null;
}) {
  return (
    <ul aria-label="Workspace candidates" className="flex min-w-0 flex-col gap-2">
      {candidates.map((candidate) => {
        const selected = candidate.id === selectedWorkspaceId;
        const schemaBinding = getPrimarySchemaBinding(candidate.schemaBindings);

        return (
          <li key={candidate.id}>
            <button
              aria-pressed={selected}
              className={cn(
                'w-full rounded-md border bg-[var(--surface-card)] p-3 text-left transition-colors',
                selected
                  ? 'border-[var(--accent-branch)] shadow-sm'
                  : 'border-[var(--stroke-divider)] hover:border-[var(--stroke-strong)]'
              )}
              onClick={() => onSelectWorkspace(candidate.id)}
              type="button"
            >
              <span className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      {candidate.title}
                    </span>
                    <Badge variant={getWorkspaceStatusBadgeTone(candidate.status)}>
                      {formatWorkspaceStatus(candidate.status)}
                    </Badge>
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-[var(--text-secondary)]">
                    {candidate.summary}
                  </span>
                </span>
                <span className="shrink-0 text-left text-xs text-[var(--text-secondary)] md:text-right">
                  <span className="block">{summarizeSourceBundle(candidate.sourceBundle)}</span>
                  {schemaBinding ? (
                    <span className="mt-1 block">
                      {schemaBinding.schemaName} {schemaBinding.version}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function WorkspaceDetail({ candidate }: { candidate: WorkspaceCandidate | null }) {
  if (!candidate) return null;

  const schemaBinding = getPrimarySchemaBinding(candidate.schemaBindings);

  return (
    <section
      aria-label="Workspace detail"
      className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{candidate.title}</h3>
          <Badge variant={getWorkspaceStatusBadgeTone(candidate.status)}>
            {formatWorkspaceStatus(candidate.status)}
          </Badge>
        </div>
        <p className="text-sm leading-5 text-[var(--text-secondary)]">{candidate.summary}</p>

        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase text-[var(--text-tertiary)]">
              Source bundle
            </dt>
            <dd className="mt-1 text-[var(--text-primary)]">
              {summarizeSourceBundle(candidate.sourceBundle)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-[var(--text-tertiary)]">
              Schema binding
            </dt>
            <dd className="mt-1 text-[var(--text-primary)]">
              {schemaBinding ? `${schemaBinding.schemaName} ${schemaBinding.version}` : 'No schema'}
            </dd>
          </div>
        </dl>

        <SourceList sources={candidate.sourceBundle} />
      </div>
    </section>
  );
}

function SourceList({ sources }: { sources: SourceBundleItem[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-medium uppercase text-[var(--text-tertiary)]">Sources</h4>
      <ul className="flex flex-col gap-2">
        {sources.map((source) => (
          <li
            className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-subtle)] px-3 py-2"
            key={source.id}
          >
            <p className="text-sm font-medium text-[var(--text-primary)]">{source.title}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{source.type}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WorkspaceEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-card)] p-8 text-center text-sm text-[var(--text-secondary)]">
      {message}
    </div>
  );
}
