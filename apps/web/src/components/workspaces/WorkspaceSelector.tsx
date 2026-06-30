import type { KeyboardEvent } from 'react';
import { getPrimarySchemaBinding, summarizeSourceBundle } from '@/domain/workspaces/selectors';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { cn } from '@/utils/cn';
import { WorkspaceStatusBadge } from './WorkspaceStatusBadge';

export function WorkspaceSelector({
  candidates,
  onSelectWorkspace,
  selectedWorkspaceId,
}: {
  candidates: WorkspaceCandidate[];
  onSelectWorkspace: (workspaceId: string) => void;
  selectedWorkspaceId: string | null;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const offset = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (index + offset + candidates.length) % candidates.length;
    const nextCandidate = candidates[nextIndex];
    if (nextCandidate) onSelectWorkspace(nextCandidate.id);
  };

  return (
    <ul aria-label="Workspace candidates" className="flex min-w-0 flex-col gap-2">
      {candidates.map((candidate, index) => {
        const selected = candidate.id === selectedWorkspaceId;
        const schemaBinding = getPrimarySchemaBinding(candidate.schemaBindings);

        return (
          <li key={candidate.id}>
            <button
              aria-pressed={selected}
              className={cn(
                'min-h-24 w-full rounded-md border bg-[var(--surface-card)] p-3 text-left transition-colors',
                selected
                  ? 'border-[var(--accent-branch)] shadow-sm'
                  : 'border-[var(--stroke-divider)] hover:border-[var(--stroke-strong)]'
              )}
              onClick={() => onSelectWorkspace(candidate.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              type="button"
            >
              <span className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      {candidate.title}
                    </span>
                    <WorkspaceStatusBadge status={candidate.status} />
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
