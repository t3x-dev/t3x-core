import { useId } from 'react';
import { getSchemaStatusLabel, getSchemaStatusTone } from '@/components/schemas/SchemaVersionBadge';
import { Badge } from '@/components/ui/badge';
import type { SchemaReleasePreview } from '@/types/schemas';
import { cn } from '@/utils/cn';

interface SchemaReleaseListProps {
  currentRelease: SchemaReleasePreview | null;
  onSelectRelease: (releaseId: string) => void;
  releases: SchemaReleasePreview[];
  selectedReleaseId: string;
}

export function SchemaReleaseList({
  currentRelease,
  onSelectRelease,
  releases,
  selectedReleaseId,
}: SchemaReleaseListProps) {
  const radioGroupName = useId();
  const schemaName = currentRelease?.name ?? releases[0]?.name ?? 'Schema';

  return (
    <aside
      aria-label="Schema versions"
      className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-sm"
    >
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">Schema versions</legend>
        <header className="flex min-h-[58px] items-center justify-between gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-[14px] py-[11px]">
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-[1.35] text-[var(--text-primary)]">
              Versions
            </h3>
            <p className="mt-px truncate text-xs text-[var(--text-secondary)]">
              {schemaName} version history
            </p>
          </div>
          <Badge className="text-[11px]" variant="outline">
            {releases.length} {releases.length === 1 ? 'version' : 'versions'}
          </Badge>
        </header>
        <div className="grid grid-cols-[repeat(3,minmax(220px,1fr))] overflow-x-auto min-[961px]:grid-cols-1">
          {releases.map((release) => {
            const isCurrent = release.id === currentRelease?.id;
            const isSelected = release.id === selectedReleaseId;
            const statusLabel = isCurrent ? 'Current' : getSchemaStatusLabel(release.status);
            const descriptionId = `${radioGroupName}-${release.id}-description`;
            const metadataId = `${radioGroupName}-${release.id}-metadata`;

            return (
              <label className="block min-w-0 cursor-pointer" key={release.id}>
                <input
                  aria-describedby={`${descriptionId} ${metadataId}`}
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
                    'block h-full w-full border-0 border-r border-[var(--stroke-divider)] bg-transparent px-[14px] py-[13px] text-left text-[var(--text-primary)] transition-colors hover:bg-[var(--hover-bg)] peer-focus-visible:relative peer-focus-visible:z-10 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-[var(--ring)] min-[961px]:border-r-0 min-[961px]:border-b',
                    isSelected &&
                      'bg-[var(--accent-commit-soft)] shadow-[inset_3px_0_0_var(--accent-commit)]'
                  )}
                >
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="font-mono text-[13px] [font-weight:750]">
                      {release.version}
                    </span>
                    <Badge
                      className="text-[11px]"
                      variant={isCurrent ? 'commit' : getSchemaStatusTone(release.status)}
                    >
                      {statusLabel}
                    </Badge>
                  </span>
                  <span
                    className="mt-[7px] block text-xs leading-[1.55] text-[var(--text-secondary)]"
                    id={descriptionId}
                  >
                    {release.description}
                  </span>
                  <span
                    className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-[var(--text-tertiary)]"
                    id={metadataId}
                  >
                    <span>{release.updatedLabel}</span>
                    <span>
                      {release.usedByCommitCount}{' '}
                      {release.usedByCommitCount === 1 ? 'commit' : 'commits'}
                    </span>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="m-[14px] hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3 min-[961px]:block">
        <strong className="block text-xs font-semibold text-[var(--text-primary)]">
          Version behavior
        </strong>
        <p className="mt-1 text-xs leading-[1.55] text-[var(--text-secondary)]">
          {currentRelease ? (
            <>
              New workspaces use{' '}
              <span className="font-mono">
                {currentRelease.name} {currentRelease.version}
              </span>
              . A version change never rewrites existing commits.
            </>
          ) : (
            'No current published version is set. Existing commits still retain their recorded schema version.'
          )}
        </p>
      </div>
    </aside>
  );
}
