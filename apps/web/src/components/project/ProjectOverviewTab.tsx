import { Boxes, GitCommitHorizontal, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getProjectRepoPath } from '@/domain/project/repoPath';
import type { ProjectShellProject } from './ProjectShell';

interface ProjectOverviewTabProps {
  onOpenState: () => void;
  onOpenWorkspaces: () => void;
  project: ProjectShellProject;
}

function OverviewMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 py-3">
      <dt className="text-xs font-semibold text-[var(--text-tertiary)]">{label}</dt>
      <dd className="mt-1 text-base font-bold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function RegistrySection({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
      <div className="flex items-center gap-3 border-b border-[var(--stroke-divider)] px-4 py-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-[var(--surface-card)] text-[var(--text-secondary)]">
          {icon}
        </div>
        <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

export function ProjectOverviewTab({
  onOpenState,
  onOpenWorkspaces,
  project,
}: ProjectOverviewTabProps) {
  const repoPath = getProjectRepoPath(project);
  const commits = Math.max(0, project.commitsCount ?? 0);
  const branches = Math.max(0, project.branchesCount ?? 0);
  const outputs = Math.max(0, project.outputsCount ?? 0);

  return (
    <section className="h-full overflow-auto bg-[var(--surface-app)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-7">
        <div className="flex flex-col gap-4 border-b border-[var(--stroke-divider)] pb-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold text-[var(--text-tertiary)]">
              Structured State Repository
            </p>
            <h2 className="mt-2 text-2xl font-bold text-[var(--text-primary)]">
              Repository overview
            </h2>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-[var(--text-secondary)]">
              {project.description || 'Structured state repository.'}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button onClick={onOpenWorkspaces} type="button" variant="branch">
              <Boxes className="size-4" />
              Workspaces
            </Button>
            <Button onClick={onOpenState} type="button" variant="canvas-outline">
              <GitCommitHorizontal className="size-4" />
              State
            </Button>
            <Button disabled type="button" variant="canvas-outline">
              Use repository
            </Button>
          </div>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <OverviewMetric label="Path" value={repoPath} />
          <OverviewMetric label="Commits" value={commits} />
          <OverviewMetric label="Branches" value={branches} />
          <OverviewMetric label="Outputs" value={outputs} />
        </dl>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <RegistrySection
            icon={<ShieldCheck aria-hidden="true" className="size-4" />}
            title="Validation"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="pending">YSchema pending</Badge>
              <Badge variant="outline">No verified commit</Badge>
            </div>
          </RegistrySection>

          <RegistrySection
            icon={<GitCommitHorizontal aria-hidden="true" className="size-4" />}
            title="Use"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-[var(--text-secondary)]">
                Provision target
              </span>
              <Badge variant="outline">Requires validation</Badge>
            </div>
          </RegistrySection>
        </div>
      </div>
    </section>
  );
}
