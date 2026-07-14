import { Badge } from '@/components/ui/badge';
import type { SchemaContractChangeKind, SchemaReleasePreview } from '@/types/schemas';

interface SchemaChangesViewProps {
  currentRelease: SchemaReleasePreview | null;
  release: SchemaReleasePreview;
}

export function SchemaChangesView({ currentRelease, release }: SchemaChangesViewProps) {
  const isCurrent = release.id === currentRelease?.id;
  const comparisonAvailable =
    isCurrent || (currentRelease !== null && release.changesBaseReleaseId === currentRelease.id);
  const changes = comparisonAvailable ? release.changes : [];

  return (
    <section className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
      <header className="flex min-h-[46px] items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-3 py-2.5">
        <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">
          {isCurrent
            ? 'Changes from current'
            : comparisonAvailable && currentRelease
              ? `${release.version} compared with current ${currentRelease.version}`
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
          {currentRelease
            ? `This comparison was recorded against a different baseline, not current ${currentRelease.version}.`
            : 'Set a current published version before comparing schema contracts.'}
        </div>
      ) : changes.length === 0 ? (
        <div className="grid min-h-[350px] place-items-center p-6 text-center text-[13px] text-[var(--text-secondary)]">
          {isCurrent
            ? `This is the current version. Select another version to compare its contract with ${release.version}.`
            : `No recorded changes against current ${currentRelease?.version}.`}
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
