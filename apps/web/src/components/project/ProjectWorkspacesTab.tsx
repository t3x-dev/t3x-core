import { Boxes } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getWorkspacePreviewCandidates } from '@/data/workspaceCandidates';
import {
  formatWorkspaceStatus,
  getPrimarySchemaBinding,
  getWorkspaceStatusBadgeTone,
  summarizeSourceBundle,
} from '@/domain/workspaces/selectors';

export function ProjectWorkspacesTab({ projectId }: { projectId: string }) {
  const candidates = getWorkspacePreviewCandidates(projectId);

  return (
    <section className="h-full overflow-auto p-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Boxes aria-hidden="true" className="h-4 w-4 text-[var(--accent-branch)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Workspace foundation preview
            </h2>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Source bundles stay explicit before deterministic YOps apply.
          </p>
        </div>

        <div className="grid gap-2">
          {candidates.map((candidate) => {
            const schemaBinding = getPrimarySchemaBinding(candidate.schemaBindings);

            return (
              <article
                className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3"
                key={candidate.id}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        {candidate.title}
                      </h3>
                      <Badge variant={getWorkspaceStatusBadgeTone(candidate.status)}>
                        {formatWorkspaceStatus(candidate.status)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
                      {candidate.summary}
                    </p>
                  </div>
                  <div className="shrink-0 text-left text-xs text-[var(--text-secondary)] md:text-right">
                    <p>{summarizeSourceBundle(candidate.sourceBundle)}</p>
                    {schemaBinding ? (
                      <p className="mt-1">
                        {schemaBinding.schemaName} {schemaBinding.version}
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
