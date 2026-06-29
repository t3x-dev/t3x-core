import type { ReactNode } from 'react';
import { ProjectTabs } from '@/components/project/ProjectTabs';
import type { ProjectTabId } from '@/components/project/projectTabModel';
import { Badge } from '@/components/ui/badge';

export interface ProjectShellProject {
  name: string;
  description?: string;
  status?: 'draft' | 'active' | 'paused';
  drafts?: number;
  commitsCount?: number;
  branchesCount?: number;
}

export interface ProjectShellProps {
  activeTab: ProjectTabId;
  children: ReactNode;
  onTabChange: (tab: ProjectTabId) => void;
  project: ProjectShellProject;
}

export function ProjectShell({ activeTab, children, onTabChange, project }: ProjectShellProps) {
  const status = project.status ?? 'draft';
  const statusTone = status === 'active' ? 'commit' : 'pending';

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-app)] text-[var(--text-primary)]">
      <header className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-semibold">{project.name}</h1>
              <Badge variant={statusTone}>{status}</Badge>
            </div>
            <p className="mt-1 max-w-3xl truncate text-xs text-[var(--text-secondary)]">
              {project.description || 'Project workbench'}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-xs sm:min-w-[320px]">
            <ProjectStat label="Sources" value={project.drafts ?? 0} />
            <ProjectStat label="Commits" value={project.commitsCount ?? 0} />
            <ProjectStat label="Branches" value={project.branchesCount ?? 0} />
          </dl>
        </div>
      </header>
      <ProjectTabs activeTab={activeTab} onTabChange={onTabChange} />
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

function ProjectStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2 py-1.5">
      <dt className="text-[10px] uppercase text-[var(--text-tertiary)]">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
