import Link from 'next/link';
import type { ReactNode } from 'react';
import { ProjectTabs } from '@/components/project/ProjectTabs';
import type { ProjectTabId } from '@/components/project/projectTabModel';
import { Badge } from '@/components/ui/badge';
import { DEFAULT_OWNER_SLUG, getProjectRepoPath } from '@/domain/project/repoPath';
import {
  getYSchemaValidationPrimaryLabel,
  type YSchemaValidationSummary,
} from '@/domain/project/yschemaValidation';

export interface ProjectShellProject {
  id?: string;
  name: string;
  description?: string;
  status?: 'draft' | 'active' | 'paused';
  drafts?: number;
  commitsCount?: number;
  branchesCount?: number;
  outputsCount?: number;
  yschemaValidation?: YSchemaValidationSummary | null;
}

export interface ProjectShellProps {
  activeTab: ProjectTabId;
  children: ReactNode;
  onTabChange: (tab: ProjectTabId) => void;
  project: ProjectShellProject;
}

export function ProjectShell({ activeTab, children, onTabChange, project }: ProjectShellProps) {
  const status = project.status ?? 'draft';
  const statusVariant =
    status === 'active' ? 'success' : status === 'paused' ? 'warning' : 'pending';
  const outputCount = Math.max(0, project.outputsCount ?? 0);
  const repoPath = getProjectRepoPath(project);
  const yschemaBadge = getYSchemaBadge(project.yschemaValidation);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-app)] text-[var(--text-primary)]">
      <header className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-4">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Link
              aria-label={`Back to ${DEFAULT_OWNER_SLUG}`}
              className="inline-flex h-9 shrink-0 items-center rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50"
              href="/"
            >
              {DEFAULT_OWNER_SLUG}
            </Link>
            <span
              aria-hidden="true"
              className="text-3xl font-semibold leading-none text-[var(--text-tertiary)]"
            >
              /
            </span>
            <h1 className="min-w-0 truncate text-2xl font-bold leading-tight text-[var(--text-primary)]">
              {project.name}
            </h1>
          </div>

          <p className="mt-2 max-w-3xl truncate text-sm font-semibold text-[var(--text-secondary)]">
            {project.description || 'Structured state repository'}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="commit">repo</Badge>
            <Badge className="font-mono" variant="outline">
              {repoPath}
            </Badge>
            <Badge variant={statusVariant}>{status}</Badge>
            <Badge variant={yschemaBadge.variant}>{yschemaBadge.label}</Badge>
            <Badge variant="outline">
              {outputCount} {outputCount === 1 ? 'output' : 'outputs'}
            </Badge>
          </div>
        </div>
      </header>
      <ProjectTabs activeTab={activeTab} onTabChange={onTabChange} />
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

function getYSchemaBadge(validation: YSchemaValidationSummary | null | undefined) {
  if (!validation) {
    return { label: 'YSchema pending', variant: 'pending' as const };
  }
  if (validation.status === 'verified') {
    return { label: getYSchemaValidationPrimaryLabel(validation), variant: 'success' as const };
  }
  if (validation.status === 'failed' || validation.status === 'stale') {
    return { label: getYSchemaValidationPrimaryLabel(validation), variant: 'warning' as const };
  }
  return { label: getYSchemaValidationPrimaryLabel(validation), variant: 'pending' as const };
}
