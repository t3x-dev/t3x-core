import { Boxes, GitCommitHorizontal, RotateCw, ShieldCheck } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getProjectRepoPath } from '@/domain/project/repoPath';
import {
  getYSchemaValidationCommitLabel,
  getYSchemaValidationPrimaryLabel,
} from '@/domain/project/yschemaValidation';
import type { ProjectShellProject } from './ProjectShell';

interface ProjectOverviewTabProps {
  onOpenState: () => void;
  onOpenWorkspaces: () => void;
  onRunValidation?: () => Promise<void> | void;
  project: ProjectShellProject;
  validationError?: string | null;
  validationRunning?: boolean;
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
  onRunValidation,
  project,
  validationError,
  validationRunning = false,
}: ProjectOverviewTabProps) {
  const [showGaps, setShowGaps] = useState(false);
  const repoPath = getProjectRepoPath(project);
  const commits = Math.max(0, project.commitsCount ?? 0);
  const branches = Math.max(0, project.branchesCount ?? 0);
  const outputs = Math.max(0, project.outputsCount ?? 0);
  const yschemaBadge = getYSchemaBadge(project.yschemaValidation);
  const validationGaps = project.yschemaValidation?.gaps ?? [];
  const validationHasRun = Boolean(project.yschemaValidation?.runId);
  const validationReady = project.yschemaValidation?.status === 'verified';
  const validationResultLabel = validationReady
    ? 'Ready to use'
    : validationHasRun
      ? 'Needs review'
      : 'Not checked';
  const validationUseMessage = validationReady
    ? 'YSchema passed for the checked commit.'
    : validationHasRun
      ? 'Blocked until YSchema passes'
      : 'Run YSchema validation before using this repository.';
  const schemaName = project.yschemaValidation?.schemaName ?? 't3x/prd';

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
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={yschemaBadge.variant}>{yschemaBadge.label}</Badge>
                  <Badge variant="outline">
                    {getYSchemaValidationCommitLabel(project.yschemaValidation)}
                  </Badge>
                </div>
                <Button
                  disabled={!onRunValidation || validationRunning}
                  onClick={onRunValidation}
                  size="sm"
                  type="button"
                  variant="canvas-outline"
                >
                  <RotateCw className={validationRunning ? 'size-4 animate-spin' : 'size-4'} />
                  {validationRunning ? 'Running...' : 'Run validation'}
                </Button>
              </div>

              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs font-semibold text-[var(--text-tertiary)]">Schema</dt>
                  <dd className="mt-1 font-semibold text-[var(--text-primary)]">{schemaName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-[var(--text-tertiary)]">Run</dt>
                  <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                    {project.yschemaValidation?.runId ?? 'No run yet'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-[var(--text-tertiary)]">Result</dt>
                  <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                    {validationResultLabel}
                  </dd>
                </div>
              </dl>

              {validationGaps.length > 0 ? (
                <div className="space-y-3 border-t border-[var(--stroke-divider)] pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[var(--text-secondary)]">
                      {validationGaps.length} validation gaps block use.
                    </span>
                    <Button
                      onClick={() => setShowGaps((value) => !value)}
                      size="sm"
                      type="button"
                      variant="canvas-outline"
                    >
                      {showGaps ? 'Hide gaps' : 'View gaps'}
                    </Button>
                  </div>
                  {showGaps ? (
                    <div className="divide-y divide-[var(--stroke-divider)] rounded-md border border-[var(--stroke-divider)]">
                      {validationGaps.map((gap) => (
                        <div className="px-3 py-2" key={`${gap.code}:${gap.path}:${gap.message}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-[var(--text-primary)]">
                              {gap.label}
                            </span>
                            {gap.path ? <Badge variant="outline">{gap.path}</Badge> : null}
                          </div>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">{gap.message}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {validationError ? (
                <p className="text-sm font-semibold text-[var(--status-warning)]">
                  {validationError}
                </p>
              ) : null}
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
              <Badge variant={validationReady ? 'success' : 'outline'}>
                {validationReady ? 'Validated' : 'Requires validation'}
              </Badge>
            </div>
            <p className="mt-3 text-sm font-medium leading-6 text-[var(--text-secondary)]">
              {validationUseMessage}
            </p>
          </RegistrySection>
        </div>
      </div>
    </section>
  );
}

function getYSchemaBadge(validation: ProjectShellProject['yschemaValidation']) {
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
