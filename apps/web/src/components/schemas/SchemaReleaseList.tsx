import { GitBranch } from 'lucide-react';
import { getSchemaStatusLabel, SchemaVersionBadge } from '@/components/schemas/SchemaVersionBadge';
import { Badge } from '@/components/ui/badge';
import type { SchemaRelease, SchemaReleaseStatus } from '@/types/schemas';
import { cn } from '@/utils/cn';

const STATUS_GROUPS: SchemaReleaseStatus[] = ['draft', 'active', 'deprecated'];

interface SchemaReleaseListProps {
  releases: SchemaRelease[];
  selectedReleaseId: string;
  onSelectRelease: (releaseId: string) => void;
}

export function SchemaReleaseList({
  onSelectRelease,
  releases,
  selectedReleaseId,
}: SchemaReleaseListProps) {
  return (
    <section
      aria-label="Schema releases"
      className="min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)]"
    >
      <header className="border-b border-[var(--stroke-divider)] px-3 py-2">
        <div className="flex items-center gap-2">
          <GitBranch aria-hidden="true" className="h-4 w-4 text-[var(--accent-branch)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Releases</h3>
        </div>
      </header>
      <div className="space-y-3 p-2">
        {STATUS_GROUPS.map((status) => {
          const group = releases.filter((release) => release.status === status);
          if (group.length === 0) return null;

          return (
            <section className="space-y-1" key={status}>
              <div className="px-1 text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
                {getSchemaStatusLabel(status)}
              </div>
              <div className="space-y-1">
                {group.map((release) => {
                  const isSelected = release.id === selectedReleaseId;

                  return (
                    <button
                      aria-current={isSelected ? 'true' : undefined}
                      className={cn(
                        'flex min-h-20 w-full flex-col gap-2 rounded-md border px-3 py-2 text-left transition-colors',
                        isSelected
                          ? 'border-[var(--accent-commit)] bg-[var(--accent-commit)]/10'
                          : 'border-[var(--stroke-divider)] bg-[var(--surface-card)] hover:border-[var(--stroke-default)] hover:bg-[var(--hover-bg)]'
                      )}
                      key={release.id}
                      onClick={() => onSelectRelease(release.id)}
                      type="button"
                    >
                      <SchemaVersionBadge release={release} />
                      <span className="flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
                        <span>{release.usedByCommitCount} commits</span>
                        <span>{release.usedByWorkspaceCount} workspaces</span>
                        <Badge
                          variant={
                            release.breakingChangeLevel === 'breaking' ? 'warning' : 'outline'
                          }
                        >
                          {release.breakingChangeLevel} change
                        </Badge>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
