import { Badge } from '@/components/ui/badge';
import { getPrimarySchemaBinding } from '@/domain/workspaces/selectors';
import type { WorkspaceCandidate } from '@/types/workspaces';

export function SchemaReviewTab({ candidate }: { candidate: WorkspaceCandidate }) {
  const schemaBinding = getPrimarySchemaBinding(candidate.schemaBindings);
  const verdictLabel = candidate.schemaReview.verdict === 'ready' ? 'Ready' : 'Needs review';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={candidate.schemaReview.verdict === 'ready' ? 'success' : 'warning'}>
          {verdictLabel}
        </Badge>
        <span className="text-sm text-[var(--text-primary)]">
          {schemaBinding ? `${schemaBinding.schemaName} ${schemaBinding.version}` : 'No schema'}
        </span>
      </div>
      <p className="text-sm leading-5 text-[var(--text-secondary)]">
        {candidate.schemaReview.summary}
      </p>
      {candidate.schemaReview.gaps.length > 0 ? (
        <ul className="flex flex-col gap-2 text-sm text-[var(--text-primary)]">
          {candidate.schemaReview.gaps.map((gap) => (
            <li className="rounded-md border border-[var(--stroke-divider)] px-3 py-2" key={gap}>
              {gap}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">No schema gaps detected.</p>
      )}
    </div>
  );
}
