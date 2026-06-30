import { Badge } from '@/components/ui/badge';
import {
  formatSourceCount,
  getPrimarySchemaBinding,
  summarizeSourceBundle,
} from '@/domain/workspaces/selectors';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { WorkspaceStatusBadge } from './WorkspaceStatusBadge';

export function WorkspaceHeader({ candidate }: { candidate: WorkspaceCandidate }) {
  const schemaBinding = getPrimarySchemaBinding(candidate.schemaBindings);

  return (
    <header className="flex flex-col gap-3 border-b border-[var(--stroke-divider)] pb-3">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 truncate text-sm font-semibold text-[var(--text-primary)]">
            {candidate.title}
          </h3>
          <WorkspaceStatusBadge status={candidate.status} />
        </div>
        <p className="text-sm leading-5 text-[var(--text-secondary)]">{candidate.summary}</p>
      </div>

      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <WorkspaceMeta label="Base commit" value={candidate.baseCommitHash ?? 'No base commit'} />
        <WorkspaceMeta label="Target branch" value={candidate.targetBranch} />
        <WorkspaceMeta
          label="Schema version"
          value={
            schemaBinding ? `${schemaBinding.schemaName} ${schemaBinding.version}` : 'No schema'
          }
        />
        <WorkspaceMeta label="Source count" value={formatSourceCount(candidate.sourceBundle)} />
      </dl>

      <Badge variant="branch" className="w-fit">
        {summarizeSourceBundle(candidate.sourceBundle)}
      </Badge>
    </header>
  );
}

function WorkspaceMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--stroke-divider)] px-3 py-2">
      <dt className="text-[var(--text-tertiary)]">{label}</dt>
      <dd className="mt-1 truncate font-medium text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
