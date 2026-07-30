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
import { cn } from '@/utils/cn';

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
  project: ProjectShellProject;
}

export function ProjectShell({ activeTab, children, project }: ProjectShellProps) {
  const status = project.status ?? 'draft';
  const statusVariant =
    status === 'active' ? 'success' : status === 'paused' ? 'warning' : 'pending';
  const outputCount = Math.max(0, project.outputsCount ?? 0);
  const repoPath = getProjectRepoPath(project);
  const yschemaBadge = getYSchemaBadge(project.yschemaValidation);
  const isStateView = activeTab === 'state';

  return (
    <div className="flex h-dvh min-h-[680px] flex-col overflow-hidden bg-[var(--surface-app)] text-[var(--text-primary)]">
      <header
        className={cn(
          'shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)]',
          isStateView ? 'h-9 px-2.5' : 'px-4 py-2'
        )}
      >
        <div
          className={cn(
            'flex min-w-0 items-center gap-2',
            isStateView ? 'h-full' : 'min-h-9 flex-wrap'
          )}
        >
          <Link
            aria-label={`Back to ${DEFAULT_OWNER_SLUG}`}
            className={cn(
              'inline-flex shrink-0 items-center rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50',
              isStateView ? 'h-6 px-2 text-[10px]' : 'h-8 px-2.5 text-sm'
            )}
            href="/"
          >
            {DEFAULT_OWNER_SLUG}
          </Link>
          <span
            aria-hidden="true"
            className={cn(
              'font-semibold leading-none text-[var(--text-tertiary)]',
              isStateView ? 'text-sm' : 'text-xl'
            )}
          >
            /
          </span>
          <h1
            className={cn(
              'min-w-0 truncate font-bold leading-tight text-[var(--text-primary)]',
              isStateView ? 'max-w-[min(720px,58vw)] text-[13px]' : 'text-lg'
            )}
          >
            {project.name}
          </h1>
          <p className="sr-only">{project.description || 'Structured state repository'}</p>
          {isStateView ? (
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 text-[10px] font-bold',
                status === 'active'
                  ? 'text-[var(--status-success)]'
                  : status === 'paused'
                    ? 'text-[var(--status-warning)]'
                    : 'text-[var(--text-tertiary)]'
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  status === 'active'
                    ? 'bg-[var(--status-success)]'
                    : status === 'paused'
                      ? 'bg-[var(--status-warning)]'
                      : 'bg-[var(--text-tertiary)]'
                )}
              />
              {status}
            </span>
          ) : (
            <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Badge variant={statusVariant}>{status}</Badge>
              <Badge variant={yschemaBadge.variant}>{yschemaBadge.label}</Badge>
              <Badge variant="outline">
                {outputCount} {outputCount === 1 ? 'output' : 'outputs'}
              </Badge>
            </div>
          )}
        </div>
      </header>
      <ProjectTabs activeTab={activeTab} outputCount={outputCount} repoPath={repoPath} />
      <main
        className={
          activeTab === 'state' ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-0 flex-1 overflow-auto'
        }
      >
        {children}
      </main>
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
