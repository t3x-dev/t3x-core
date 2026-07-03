import { getPrimarySchemaBinding, summarizeSourceBundle } from '@/domain/workspaces/selectors';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { WorkspaceStatusBadge } from './WorkspaceStatusBadge';

export function WorkspaceHeader({ candidate }: { candidate: WorkspaceCandidate }) {
  const schemaBinding = getPrimarySchemaBinding(candidate.schemaBindings);
  const schemaLabel = schemaBinding
    ? `${schemaBinding.schemaName} ${schemaBinding.version}`
    : 'No schema';

  return (
    <header className="flex flex-col gap-2 border-b border-[var(--stroke-divider)] pb-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="min-w-0 truncate text-sm font-semibold text-[var(--text-primary)]">
          {candidate.title}
        </h3>
        <WorkspaceStatusBadge status={candidate.status} />
      </div>

      <p className="text-sm leading-5 text-[var(--text-secondary)]">{candidate.summary}</p>

      <dl className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
        <WorkspaceMeta label="Schema" value={schemaLabel} />
        <WorkspaceMeta label="Sources" value={summarizeSourceBundle(candidate.sourceBundle)} />
        <WorkspaceMeta label="Base" value={candidate.baseCommitHash ?? 'No base commit'} mono />
        <WorkspaceMeta label="Branch" value={candidate.targetBranch} mono />
      </dl>
    </header>
  );
}

function WorkspaceMeta({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <dt className="text-[var(--text-tertiary)]">{label}</dt>
      <dd
        className={`max-w-56 truncate font-medium text-[var(--text-primary)] ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
