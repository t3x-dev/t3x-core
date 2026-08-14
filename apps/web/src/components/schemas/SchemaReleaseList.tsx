import { useId } from 'react';
import { getSchemaStatusLabel, getSchemaStatusTone } from '@/components/schemas/SchemaVersionBadge';
import { Badge } from '@/components/ui/badge';
import type { SchemaReleasePreview } from '@/types/schemas';
import { cn } from '@/utils/cn';

interface SchemaReleaseListProps {
  onSelectRelease: (releaseId: string) => void;
  releases: SchemaReleasePreview[];
  selectedReleaseId?: string;
}

export function SchemaReleaseList({
  onSelectRelease,
  releases,
  selectedReleaseId,
}: SchemaReleaseListProps) {
  const radioGroupName = useId();

  return (
    <aside
      aria-label="Schema versions"
      className="min-w-0 overflow-hidden rounded-none border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-sm"
    >
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">Schema versions</legend>
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-[14px] py-2.5">
          <h3 className="text-base font-semibold leading-[1.35] text-[var(--text-primary)]">
            Versions
          </h3>
          <Badge className="text-[11px]" variant="outline">
            {releases.length} {releases.length === 1 ? 'version' : 'versions'}
          </Badge>
        </header>
        <section
          aria-label="Schema version results"
          className="grid max-w-full grid-flow-col auto-cols-[minmax(220px,1fr)] overflow-x-auto overflow-y-hidden overscroll-x-contain [contain:inline-size_paint] [scrollbar-gutter:stable] min-[1101px]:max-h-[552px] min-[1101px]:grid-flow-row min-[1101px]:grid-cols-1 min-[1101px]:auto-cols-auto min-[1101px]:overflow-x-hidden min-[1101px]:overflow-y-auto min-[1101px]:overscroll-y-contain"
        >
          {releases.map((release) => {
            const isSelected = release.id === selectedReleaseId;
            const statusLabel = getSchemaStatusLabel(release.status);
            const metadataId = `${radioGroupName}-${release.id}-metadata`;

            return (
              <label className="block min-w-0 cursor-pointer" key={release.id}>
                <input
                  aria-describedby={metadataId}
                  aria-label={`${release.version} ${statusLabel}`}
                  checked={isSelected}
                  className="peer sr-only"
                  name={radioGroupName}
                  onChange={() => onSelectRelease(release.id)}
                  type="radio"
                  value={release.id}
                />
                <span
                  className={cn(
                    'flex min-h-[70px] w-full flex-col justify-center border-0 border-r border-[var(--stroke-divider)] bg-transparent px-[14px] py-[11px] text-left text-[var(--text-primary)] transition-colors hover:bg-[var(--hover-bg)] peer-focus-visible:relative peer-focus-visible:z-10 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-[var(--ring)] min-[1101px]:border-r-0 min-[1101px]:border-b',
                    isSelected &&
                      'bg-[var(--accent-commit-soft)] shadow-[inset_3px_0_0_var(--accent-commit)]'
                  )}
                >
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="font-mono text-[13px] [font-weight:750]">
                      {release.version}
                    </span>
                    <Badge className="text-[11px]" variant={getSchemaStatusTone(release.status)}>
                      {statusLabel}
                    </Badge>
                  </span>
                  <span
                    className="mt-1.5 flex min-h-4 flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-[var(--text-tertiary)]"
                    id={metadataId}
                  >
                    <span>{release.updatedLabel}</span>
                    {release.usedByCommitCount > 0 ? (
                      <span>
                        {release.usedByCommitCount}{' '}
                        {release.usedByCommitCount === 1 ? 'commit' : 'commits'}
                      </span>
                    ) : null}
                  </span>
                </span>
              </label>
            );
          })}
        </section>
      </fieldset>
    </aside>
  );
}
