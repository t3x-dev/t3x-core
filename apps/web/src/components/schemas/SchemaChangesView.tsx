import { Badge } from '@/components/ui/badge';
import type { SchemaContractChangeKind, SchemaReleasePreview } from '@/types/schemas';

interface SchemaChangesViewProps {
  comparisonBaseRelease: SchemaReleasePreview | null;
  release: SchemaReleasePreview;
}

export function SchemaChangesView({ comparisonBaseRelease, release }: SchemaChangesViewProps) {
  const comparisonAvailable = comparisonBaseRelease !== null;
  const changes = comparisonAvailable ? release.changes : [];

  return (
    <section className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
      <header className="flex min-h-[46px] items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-3 py-2.5">
        <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">
          {comparisonBaseRelease
            ? `${release.version} compared with ${comparisonBaseRelease.version}`
            : 'Comparison unavailable'}
        </h4>
        <Badge className="text-[11px]" variant="outline">
          {comparisonAvailable
            ? `${changes.length} ${changes.length === 1 ? 'change' : 'changes'}`
            : 'No matching baseline'}
        </Badge>
      </header>

      {!comparisonAvailable ? (
        <div className="grid min-h-[350px] place-items-center p-6 text-center text-[13px] text-[var(--text-secondary)]">
          This version does not record a comparison baseline that is available in this Schema
          history.
        </div>
      ) : changes.length === 0 ? (
        <div className="grid min-h-[350px] place-items-center p-6 text-center text-[13px] text-[var(--text-secondary)]">
          No recorded changes against {comparisonBaseRelease?.version}.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <ul aria-label={`${release.version} schema changes`} className="m-0 list-none p-0">
            {changes.map((change) => (
              <li
                className="grid items-start gap-3 border-t border-[var(--stroke-divider)] p-3 first:border-t-0 min-[721px]:min-w-[584px] min-[721px]:grid-cols-[76px_minmax(200px,0.75fr)_minmax(260px,1.25fr)]"
                key={`${change.kind}-${change.path}`}
              >
                <Badge className="text-[11px]" variant={getChangeTone(change.kind)}>
                  {change.kind}
                </Badge>
                <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                  {change.path}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">{change.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function getChangeTone(kind: SchemaContractChangeKind): 'pending' | 'success' | 'warning' {
  if (kind === 'ADD' || kind === 'KEEP') return 'success';
  if (kind === 'CHANGE') return 'pending';
  return 'warning';
}
