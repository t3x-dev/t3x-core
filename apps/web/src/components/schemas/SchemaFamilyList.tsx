import { DatabaseZap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatSchemaReleaseName } from '@/domain/schemas/selectors';
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
      aria-label="Schema families"
      className="min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)]"
    >
      <header className="border-b border-[var(--stroke-divider)] px-3 py-2">
        <div className="flex items-center gap-2">
          <DatabaseZap aria-hidden="true" className="h-4 w-4 text-[var(--accent-commit)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Schema families</h3>
        </div>
      </header>
      <div className="p-2">
        {families.map((family) => {
          const activeRelease = family.releases.find((release) => release.status === 'active');
          const isSelected = family.name === selectedFamilyName;

          return (
            <button
              aria-current={isSelected ? 'true' : undefined}
              className={cn(
                'flex min-h-16 w-full flex-col items-start justify-center gap-1 rounded-md border px-3 py-2 text-left transition-colors',
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
                  {family.name}
                </span>
                <Badge variant={isSelected ? 'commit' : 'outline'}>
                  {family.releases.length} releases
                </Badge>
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                {activeRelease
                  ? `Active ${formatSchemaReleaseName(activeRelease)}`
                  : 'No active release'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
