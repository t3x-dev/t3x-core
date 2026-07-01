import {
  AlertTriangle,
  ArrowRight,
  Database,
  FileText,
  KeyRound,
  type LucideIcon,
  SlidersHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_OWNER_SLUG, getProjectRepoPath } from '@/domain/project/repoPath';
import type { ProjectSummary } from '@/store/projectStore';

interface ProjectSettingsTabProps {
  project: ProjectSummary;
}

function SectionCard({
  children,
  description,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--stroke-divider)] bg-[var(--surface-primary)]">
      <div className="flex items-start gap-3 px-5 py-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--hover-bg)] text-[var(--text-secondary)]">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SetupLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 py-1.5 text-xs font-semibold text-[var(--accent-commit)] transition-colors hover:bg-[var(--hover-bg)]"
    >
      {label}
      <ArrowRight aria-hidden="true" className="size-3.5" />
    </Link>
  );
}

export function ProjectSettingsTab({ project }: ProjectSettingsTabProps) {
  const repoPath = getProjectRepoPath(project);
  const [repoName, setRepoName] = useState(project.name);
  const [repoDescription, setRepoDescription] = useState(project.description);
  const [defaultSchema, setDefaultSchema] = useState('prd-schema-v2');
  const [workspaceLane, setWorkspaceLane] = useState('source');
  const repoProfileDirty = repoName !== project.name || repoDescription !== project.description;
  const defaultsDirty = defaultSchema !== 'prd-schema-v2' || workspaceLane !== 'source';

  return (
    <section className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="grid gap-5 border-b border-[var(--stroke-divider)] pb-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
              Structured state repository
            </p>
            <h2 className="mt-2 text-base font-semibold text-[var(--text-primary)]">
              Repository settings
            </h2>
            <p className="mt-2 truncate text-xl font-semibold text-[var(--text-primary)]">
              {project.name}
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Repository settings affect this owner/repo only. Organization policy and local
              credentials live outside this page.
            </p>
          </div>

          <dl className="h-fit rounded-[var(--radius-card)] border border-[var(--stroke-divider)] bg-[var(--surface-primary)] p-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-[var(--text-tertiary)]">Repository path</dt>
              <dd className="mt-1 font-semibold text-[var(--text-primary)]">{repoPath}</dd>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-[var(--radius-control)] bg-[var(--hover-bg)] px-3 py-2">
                <dt className="font-medium text-[var(--text-tertiary)]">Owner</dt>
                <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                  {DEFAULT_OWNER_SLUG}
                </dd>
              </div>
              <div className="rounded-[var(--radius-control)] bg-[var(--hover-bg)] px-3 py-2">
                <dt className="font-medium text-[var(--text-tertiary)]">Status</dt>
                <dd className="mt-1 font-semibold text-[var(--text-primary)]">{project.status}</dd>
              </div>
            </div>
          </dl>
        </header>

        <div className="grid gap-4">
          <SectionCard
            description="Visible repository identity and owner/repo metadata."
            icon={FileText}
            title="General"
          >
            <div className="grid gap-4 border-t border-[var(--stroke-divider)] p-5">
              <label
                className="grid gap-1.5 text-sm font-medium text-[var(--text-primary)]"
                htmlFor="repository-name"
              >
                Repository name
                <Input
                  id="repository-name"
                  value={repoName}
                  onChange={(event) => setRepoName(event.target.value)}
                />
              </label>
              <label
                className="grid gap-1.5 text-sm font-medium text-[var(--text-primary)]"
                htmlFor="repository-description"
              >
                Repository description
                <Textarea
                  id="repository-description"
                  value={repoDescription}
                  onChange={(event) => setRepoDescription(event.target.value)}
                  rows={3}
                />
              </label>
              <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--stroke-divider)] pt-4">
                <Button
                  disabled={!repoProfileDirty}
                  onClick={() => {
                    setRepoName(project.name);
                    setRepoDescription(project.description);
                  }}
                  type="button"
                  variant="canvas-outline"
                >
                  Reset repository profile
                </Button>
                <Button disabled={!repoProfileDirty} type="button">
                  Save repository profile
                </Button>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            description="Workflow defaults used when this repository creates new workspaces."
            icon={SlidersHorizontal}
            title="Defaults"
          >
            <div className="grid gap-4 border-t border-[var(--stroke-divider)] p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                  Default schema
                  <select
                    className="h-10 rounded-[var(--radius-control)] border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--stroke-strong)] focus:ring-2 focus:ring-[var(--ring)]/30"
                    value={defaultSchema}
                    onChange={(event) => setDefaultSchema(event.target.value)}
                  >
                    <option value="prd-schema-v2">PRD Schema v2</option>
                    <option value="release-note-v1">Release Note Schema v1</option>
                    <option value="blank-schema">No default schema</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                  Workspace default lane
                  <select
                    className="h-10 rounded-[var(--radius-control)] border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--stroke-strong)] focus:ring-2 focus:ring-[var(--ring)]/30"
                    value={workspaceLane}
                    onChange={(event) => setWorkspaceLane(event.target.value)}
                  >
                    <option value="source">Source</option>
                    <option value="yschema">YSchema</option>
                    <option value="yops">YOps</option>
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-t border-[var(--stroke-divider)] pt-4 text-xs text-[var(--text-secondary)]">
                <span>
                  {project.branchesCount} branch{project.branchesCount === 1 ? '' : 'es'} inherit
                  these defaults.
                </span>
                <span className="flex gap-2">
                  <Button
                    disabled={!defaultsDirty}
                    onClick={() => {
                      setDefaultSchema('prd-schema-v2');
                      setWorkspaceLane('source');
                    }}
                    type="button"
                    variant="canvas-outline"
                  >
                    Reset defaults
                  </Button>
                  <Button disabled={!defaultsDirty} type="button">
                    Save defaults
                  </Button>
                </span>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            description="Repository-specific runtime output posture."
            icon={Database}
            title="Runtime and outputs"
          >
            <div className="grid gap-4 border-t border-[var(--stroke-divider)] p-5">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    Output targets
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                    Output target setup requires backend runtime.
                  </p>
                </div>
                <Button disabled type="button" variant="canvas-outline">
                  Add output target
                </Button>
              </div>
              <div className="rounded-[var(--radius-control)] bg-[var(--hover-bg)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                Provider overrides:{' '}
                <span className="font-semibold text-[var(--text-primary)]">
                  {project.defaultProvider ?? 'Use global provider setup unless overridden'}
                </span>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            description="Destructive actions that apply only to this repository."
            icon={AlertTriangle}
            title="Danger zone"
          >
            <div className="divide-y divide-[var(--stroke-divider)] border-t border-[var(--stroke-divider)]">
              <div className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    Rename repository
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                    Change the repository slug after reviewing linked paths.
                  </p>
                </div>
                <Button type="button" variant="canvas-outline">
                  Rename repository
                </Button>
              </div>
              <div className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    Delete repository
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                    Delete requires persistent backend support and confirmation.
                  </p>
                </div>
                <Button disabled type="button" variant="canvas-outline">
                  Delete repository
                </Button>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--stroke-divider)] bg-[var(--surface-primary)] px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <KeyRound aria-hidden="true" className="mt-0.5 size-4 text-[var(--text-secondary)]" />
            <div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                Shared local setup
              </div>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                Provider tokens and T3X API keys are shared across repositories.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <SetupLink href="/settings/providers" label="Provider setup" />
            <SetupLink href="/settings/access" label="API / CLI / MCP access" />
          </div>
        </div>
      </div>
    </section>
  );
}
