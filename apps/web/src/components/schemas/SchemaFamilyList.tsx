import { LayoutTemplate } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SchemaReleaseFamily } from '@/types/schemas';
import { cn } from '@/utils/cn';

interface SchemaFamilyListProps {
  families: SchemaReleaseFamily[];
  selectedFamilyName: string;
  onSelectFamily: (familyName: string) => void;
}

export function SchemaFamilyList({
  families,
  onSelectFamily,
  selectedFamilyName,
}: SchemaFamilyListProps) {
  return (
    <section
      aria-label="Templates"
      className="min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)]"
    >
      <header className="border-b border-[var(--stroke-divider)] px-3 py-2">
        <div className="flex items-center gap-2">
          <LayoutTemplate aria-hidden="true" className="h-4 w-4 text-[var(--accent-commit)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Templates</h3>
        </div>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          Pick the contract family before choosing a version.
        </p>
      </header>
      <div className="p-2">
        {families.map((family) => {
          const latestRelease = family.releases[0];
          const isSelected = family.name === selectedFamilyName;

          return (
            <button
              aria-current={isSelected ? 'true' : undefined}
              className={cn(
                'flex min-h-24 w-full flex-col items-start justify-center gap-2 rounded-md border px-3 py-2 text-left transition-colors',
                isSelected
                  ? 'border-[var(--accent-commit)] bg-[var(--accent-commit)]/10'
                  : 'border-transparent hover:border-[var(--stroke-default)] hover:bg-[var(--hover-bg)]'
              )}
              key={family.name}
              onClick={() => onSelectFamily(family.name)}
              type="button"
            >
              <span className="flex w-full min-w-0 items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {formatTemplateName(family.name)}
                </span>
                <Badge
                  variant={isSelected ? 'commit' : getSourceBadgeVariant(latestRelease.source)}
                >
                  {latestRelease.source}
                </Badge>
              </span>
              <span className="line-clamp-2 text-xs leading-4 text-[var(--text-secondary)]">
                {latestRelease.description}
              </span>
              <span className="flex w-full flex-wrap items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                <Badge variant="outline">{latestRelease.category}</Badge>
                <span>{formatVersionCount(family.releases.length)}</span>
                <span>Applied per Workspace</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function formatTemplateName(name: string) {
  return name.replace(/\s+Schema$/, '');
}

function formatVersionCount(count: number) {
  return `${count} ${count === 1 ? 'version' : 'versions'}`;
}

function getSourceBadgeVariant(source: SchemaReleaseFamily['releases'][number]['source']) {
  if (source === 'official') return 'commit';
  if (source === 'team') return 'branch';
  return 'outline';
}
