import { GitBranch } from 'lucide-react';
import { getSchemaStatusLabel } from '@/components/schemas/SchemaVersionBadge';
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
      aria-label="Versions"
      className="min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)]"
    >
      <header className="border-b border-[var(--stroke-divider)] px-3 py-2">
        <div className="flex items-center gap-2">
          <GitBranch aria-hidden="true" className="h-4 w-4 text-[var(--accent-branch)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Versions</h3>
        </div>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          Select the exact version a workspace will validate against.
        </p>
      </header>
      <div className="space-y-4 p-3">
        {STATUS_GROUPS.map((status) => {
          const group = releases.filter((release) => release.status === status);
          if (group.length === 0) return null;

          return (
            <section className="space-y-1" key={status}>
              <div className="px-1 text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
                {getSchemaStatusLabel(status)}
              </div>
              <div className="flex flex-wrap gap-2">
                {group.map((release) => {
                  const isSelected = release.id === selectedReleaseId;

                  return (
                    <button
                      aria-current={isSelected ? 'true' : undefined}
                      className={cn(
                        'inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-left transition-colors',
                        isSelected
                          ? 'border-[var(--accent-commit)] bg-[var(--accent-commit)]/10 text-[var(--accent-commit)]'
                          : 'border-[var(--stroke-divider)] bg-[var(--surface-card)] hover:border-[var(--stroke-default)] hover:bg-[var(--hover-bg)]'
                      )}
                      key={release.id}
                      onClick={() => onSelectRelease(release.id)}
                      type="button"
                    >
                      <span className="font-mono text-sm font-semibold">{release.version}</span>
                      {release.status === 'active' ? <Badge variant="commit">Current</Badge> : null}
                      {release.breakingChangeLevel === 'breaking' ? (
                        <Badge variant="warning">Breaking</Badge>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
          Versions behave like pinned revisions: old workspaces can stay on their current version,
          while new workspaces can follow the project default.
        </div>
      </div>
    </section>
  );
}
