import {
  CalendarDays,
  GitCommitHorizontal,
  Link2,
  Pin,
  ShieldCheck,
  Split,
  UsersRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { SchemaVersionBadge } from '@/components/schemas/SchemaVersionBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { WorkspaceSchemaBindingScope } from '@/domain/workspaces/schemaBindings';
import type { SchemaRelease } from '@/types/schemas';

interface SchemaReleaseDetailProps {
  bindingTargetLabel?: string;
  currentWorkspaceBindingLabel?: string;
  onBindRelease?: (release: SchemaRelease, scope: WorkspaceSchemaBindingScope) => void;
  projectDefaultBindingLabel?: string;
  release: SchemaRelease;
}

export function SchemaReleaseDetail({
  bindingTargetLabel,
  currentWorkspaceBindingLabel,
  onBindRelease,
  projectDefaultBindingLabel,
  release,
}: SchemaReleaseDetailProps) {
  const isDraft = release.status === 'draft';

  return (
    <section
      aria-label="Schema release detail"
      className="min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)]"
    >
      <header className="border-b border-[var(--stroke-divider)] px-4 py-3">
        <div className="flex flex-col gap-2">
          <SchemaVersionBadge release={release} />
          <p className="text-sm leading-5 text-[var(--text-secondary)]">{release.description}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant={release.source === 'official' ? 'commit' : 'outline'}>
              {release.source}
            </Badge>
            <Badge variant="outline">{release.category}</Badge>
            <Badge variant="branch">root: {release.rootKey}</Badge>
          </div>
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
          <h4 className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">
            Required fields
          </h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {release.requiredFields.map((field) => (
              <Badge className="font-mono" key={field} variant="outline">
                {field}
              </Badge>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3">
          <h4 className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">
            Compatible with
          </h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {release.compatibleWith.map((target) => (
              <Badge key={target} variant="success">
                {target}
              </Badge>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              Version and migration
            </span>
            <Badge variant={isDraft ? 'pending' : 'commit'}>
              {isDraft ? 'Draft can be reviewed' : 'Published version is immutable'}
            </Badge>
          </div>
          <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">
            {release.migrationSummary}
          </p>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">
            Bind this version
          </h4>
          <div className="mt-2 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-1 font-medium text-[var(--text-primary)]">
                <Pin aria-hidden="true" className="h-3.5 w-3.5 text-[var(--accent-commit)]" />
                {bindingTargetLabel ?? 'Current workspace'}
              </span>
              <Badge variant="outline">
                Workspace: {currentWorkspaceBindingLabel ?? 'No pinned schema'}
              </Badge>
              <Badge variant="outline">
                Project default: {projectDefaultBindingLabel ?? 'No override'}
              </Badge>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              onClick={() => onBindRelease?.(release, 'current_workspace')}
              size="sm"
              type="button"
              variant="commit"
            >
              <Link2 aria-hidden="true" className="h-4 w-4" />
              Use this version
            </Button>
            <Button
              onClick={() => onBindRelease?.(release, 'project_default')}
              size="sm"
              type="button"
              variant="canvas-outline"
            >
              Set as project default
            </Button>
            <Button
              onClick={() => onBindRelease?.(release, 'current_workspace')}
              size="sm"
              type="button"
              variant="canvas-outline"
            >
              Use for current workspace
            </Button>
            <Button size="sm" type="button" variant="canvas-outline">
              Create workspace with template
            </Button>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">
            Review actions
          </h4>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" type="button" variant="canvas-outline">
              <Split aria-hidden="true" className="h-4 w-4" />
              Compare with current
            </Button>
            <Button size="sm" type="button" variant="canvas-outline">
              View workspace impact
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
