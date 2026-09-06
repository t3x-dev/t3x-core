'use client';
import { ArrowRight, LockKeyhole, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getProjectIdRepoPath, getProjectIdWorkspacePath } from '@/domain/project/repoPath';
import { useSchemaCatalog } from '@/hooks/schemas/useSchemaCatalog';
import type { WorkspaceCandidate, WorkspaceSchemaBinding } from '@/types/workspaces';

export function ActiveSchemaBindings({
  projectId,
  workspaces,
  refresh,
  error,
}: {
  projectId: string;
  workspaces: WorkspaceCandidate[];
  refresh: () => Promise<void>;
  error: string | null;
}) {
  return (
    <section aria-label="Active schema bindings" className="p-4 sm:p-6">
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Your active definitions</h1>
        <Button variant="ghost" size="sm" onClick={() => void refresh()}>
          <RefreshCw className="mr-2 size-3.5" />
          Refresh
        </Button>
      </header>
      {error ? <p role="alert">{error}</p> : null}
      <div className="divide-y divide-[var(--stroke-divider)] rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)]">
        {workspaces
          .filter((workspace) => workspace.schemaBindings.length > 0)
          .map((workspace) => (
            <article key={workspace.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold">{workspace.title}</h2>
                  <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
                    {workspace.targetBranch} · revision {workspace.revision}
                  </p>
                </div>
                <Link
                  href={`${getProjectIdRepoPath(projectId)}?tab=schemas&schemaView=studio&workspace=${encodeURIComponent(workspace.id)}`}
                  className="text-sm text-[var(--status-info)]"
                >
                  Review a replacement <ArrowRight className="ml-1 inline size-3.5" />
                </Link>
              </div>
              {workspace.schemaBindings.map((binding, index) => (
                <div
                  key={`${binding.schemaHash}:${index}`}
                  className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
                >
                  <div>
                    <p className="flex items-center gap-2 text-sm">
                      <LockKeyhole className="size-4 text-[var(--status-info)]" />
                      {binding.schemaName}{' '}
                      <span className="font-mono text-xs">{binding.version}</span>
                    </p>
                    <p className="mt-2 break-all font-mono text-[10px] text-[var(--text-tertiary)]">
                      {binding.schemaHash ?? 'Hash not recorded'}
                    </p>
                    <ul className="mt-3 space-y-2">
                      {binding.studioSources?.map((source) => (
                        <li
                          key={source.artifactVersionId}
                          className="text-xs text-[var(--text-secondary)]"
                        >
                          {source.canonicalName} · {source.version}
                          <OtherReleases projectId={projectId} source={source} />
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="border-l-2 border-[var(--stroke-divider)] pl-4">
                    <p className="text-xs font-medium">
                      Workspace schema review ·{' '}
                      {workspace.schemaReview.verdict === 'ready' ? 'Ready' : 'Needs review'}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                      {workspace.schemaReview.summary || 'No review summary recorded.'}
                    </p>
                    <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                      {workspace.schemaReview.gaps.length} recorded gaps · execution results remain
                      in Workspace
                    </p>
                    <Link
                      href={`${getProjectIdWorkspacePath(projectId, { branch: workspace.targetBranch })}&workspace=${encodeURIComponent(workspace.id)}`}
                      className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--status-info)]"
                    >
                      Open Workspace review & history <ArrowRight className="size-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </article>
          ))}
      </div>
      {!workspaces.some((workspace) => workspace.schemaBindings.length) ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">
          No definitions bound yet. Choose a candidate in Studio.
        </p>
      ) : null}
    </section>
  );
}
function OtherReleases({
  projectId,
  source,
}: {
  projectId: string;
  source: NonNullable<WorkspaceSchemaBinding['studioSources']>[number];
}) {
  const query = new URLSearchParams({ q: source.canonicalName, limit: '24' });
  const catalog = useSchemaCatalog(projectId, query.toString());
  const others =
    catalog.data?.items.filter(
      (item) =>
        item.identity.canonicalName === source.canonicalName &&
        item.identity.ownerProjectId === source.projectId &&
        item.release.hash !== source.hash
    ) ?? [];
  return catalog.error ? (
    <span className="ml-2 text-[var(--text-tertiary)]">Release lookup unavailable</span>
  ) : others.length ? (
    <Link
      className="ml-2 text-[var(--status-info)]"
      href={`${getProjectIdRepoPath(projectId)}?tab=schemas&schemaView=browse&q=${encodeURIComponent(source.canonicalName)}`}
    >
      Other published releases · review before upgrading
    </Link>
  ) : null;
}
