import { CalendarDays, GitCommitHorizontal, ShieldCheck, UsersRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { SchemaVersionBadge } from '@/components/schemas/SchemaVersionBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SchemaRelease } from '@/types/schemas';

interface SchemaReleaseDetailProps {
  release: SchemaRelease;
}

export function SchemaReleaseDetail({ release }: SchemaReleaseDetailProps) {
  const isDraft = release.status === 'draft';

  return (
    <section
      aria-label="Schema release detail"
      className="min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)]"
    >
      <header className="border-b border-[var(--stroke-divider)] px-4 py-3">
        <div className="flex flex-col gap-2">
          <SchemaVersionBadge release={release} />
          <p className="text-sm leading-5 text-[var(--text-secondary)]">
            Release versions are immutable once published. Workspaces bind to a version instead of
            editing released schema state in place.
          </p>
        </div>
      </header>

      <div className="space-y-4 p-4">
        <dl className="grid gap-2 sm:grid-cols-2">
          <DetailMetric
            icon={<GitCommitHorizontal aria-hidden="true" className="h-4 w-4" />}
            label="Used by commits"
            value={release.usedByCommitCount}
          />
          <DetailMetric
            icon={<UsersRound aria-hidden="true" className="h-4 w-4" />}
            label="Used by workspaces"
            value={release.usedByWorkspaceCount}
          />
          <DetailMetric
            icon={<ShieldCheck aria-hidden="true" className="h-4 w-4" />}
            label="Breaking level"
            value={release.breakingChangeLevel}
          />
          <DetailMetric
            icon={<CalendarDays aria-hidden="true" className="h-4 w-4" />}
            label="Released"
            value={release.releasedAt ? release.releasedAt.slice(0, 10) : 'Not released'}
          />
        </dl>

        <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Release policy</span>
            <Badge variant={isDraft ? 'pending' : 'commit'}>
              {isDraft ? 'Draft can be reviewed' : 'Published version is immutable'}
            </Badge>
          </div>
          <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">
            Published schema versions stay stable for old commits and existing workspace bindings.
            Changes move through a draft release before becoming a new project default.
          </p>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">
            Available actions
          </h4>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" type="button" variant="canvas-outline">
              Create draft from active
            </Button>
            <Button size="sm" type="button" variant="canvas-outline">
              Set as project default
            </Button>
            <Button size="sm" type="button" variant="canvas-outline">
              Deprecate version
            </Button>
            <Button size="sm" type="button" variant="canvas-outline">
              View impact
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function DetailMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2">
      <dt className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
        <span className="text-[var(--text-tertiary)]">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-sm text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
