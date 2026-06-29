import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getSchemaReleasePreviews } from '@/data/schemaReleases';
import {
  formatSchemaReleaseName,
  getSchemaReleaseBadgeTone,
  groupSchemaReleasesByFamily,
} from '@/domain/schemas/selectors';

export function ProjectSchemasTab({ projectId }: { projectId: string }) {
  const families = groupSchemaReleasesByFamily(getSchemaReleasePreviews(projectId));

  return (
    <section className="h-full overflow-auto p-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-[var(--accent-commit)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Schema release preview
            </h2>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Releases are project-scoped and can be bound to workspaces or commits.
          </p>
        </div>

        <div className="grid gap-3">
          {families.map((family) => (
            <section
              className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)]"
              key={family.name}
            >
              <header className="border-b border-[var(--stroke-divider)] px-3 py-2">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{family.name}</h3>
              </header>
              <div className="divide-y divide-[var(--stroke-divider)]">
                {family.releases.map((release) => (
                  <div
                    className="flex flex-col gap-2 px-3 py-2 md:flex-row md:items-center md:justify-between"
                    key={release.id}
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-sm text-[var(--text-primary)]">
                        {formatSchemaReleaseName(release)}
                      </span>
                      <Badge variant={getSchemaReleaseBadgeTone(release)}>{release.status}</Badge>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {release.usedByWorkspaceCount} workspaces, {release.usedByCommitCount} commits
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
