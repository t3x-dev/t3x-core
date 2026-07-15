'use client';

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  FileOutput,
  PanelTop,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { LoadingSpinner } from '@/components/layout/ApiStatus';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { commitHashLabel } from '@/domain/format/formatters';
import {
  buildProjectOutputArtifacts,
  type ProjectOutputArtifact,
  type ProjectOutputStatus,
} from '@/domain/outputs/projectOutputs';
import { useProjectOutputsData } from '@/hooks/leaves/useProjectOutputsData';

interface ProjectOutputsTabProps {
  projectId: string;
}

export function ProjectOutputsTab({ projectId }: ProjectOutputsTabProps) {
  const data = useProjectOutputsData(projectId);
  const artifacts = useMemo(
    () => buildProjectOutputArtifacts(data.leaves, data.workspaces, data.commits),
    [data.commits, data.leaves, data.workspaces]
  );

  return (
    <section aria-busy={data.loading} className="h-full overflow-auto p-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <OutputsHeader count={artifacts.length} />

        {data.error ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error-muted)] px-3 py-2"
            role="alert"
          >
            <div className="flex min-w-0 items-center gap-2 text-sm text-[var(--status-error)]">
              <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
              <span>{data.error}</span>
            </div>
            <Button onClick={() => void data.refresh()} size="sm" type="button" variant="outline">
              Retry outputs
            </Button>
          </div>
        ) : null}

        {data.loading && artifacts.length === 0 ? (
          <LoadingSpinner message="Loading outputs..." />
        ) : data.error && artifacts.length === 0 ? null : artifacts.length === 0 ? (
          <OutputsEmptyState />
        ) : (
          <div className="grid gap-3">
            {artifacts.map((artifact) => (
              <OutputArtifactCard
                artifact={artifact}
                key={artifact.id}
                leafHref={`/project/${encodeURIComponent(projectId)}/leaf/${encodeURIComponent(artifact.leaf.id)}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function OutputsHeader({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <PanelTop aria-hidden="true" className="h-4 w-4 text-[var(--accent-leaf)]" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Committed outputs</h2>
        </div>
        <p className="text-sm leading-5 text-[var(--text-secondary)]">
          Outputs are committed Leaf artifacts with stable source commits, freshness, and constraint
          status. Workspace output targets remain draft configuration until commit.
        </p>
      </div>
      <Badge variant="outline">
        {count} {count === 1 ? 'Leaf' : 'Leaves'}
      </Badge>
    </div>
  );
}

function OutputsEmptyState() {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-md border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] text-[var(--accent-leaf)]">
        <FileOutput aria-hidden="true" className="size-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
        No committed Leaf artifacts yet
      </p>
      <p className="mt-1 max-w-md text-sm leading-5 text-[var(--text-secondary)]">
        Create a Leaf from a committed Workspace output target. Persisted Leaves will appear here.
      </p>
    </div>
  );
}

function OutputArtifactCard({
  artifact,
  leafHref,
}: {
  artifact: ProjectOutputArtifact;
  leafHref: string;
}) {
  const name = artifact.leaf.title ?? artifact.target?.title ?? 'Untitled output';
  const status = getStatusPresentation(artifact);
  const constraints = getConstraintPresentation(artifact);
  const sourceWorkspace = artifact.workspace?.title ?? 'Unlinked Leaf';
  const branch = artifact.boundCommit?.branch ?? artifact.workspace?.targetBranch ?? 'Unknown';
  const type = formatValue(artifact.target?.type ?? artifact.leaf.type ?? 'output');
  const rawFormat = artifact.leaf.config.format ?? artifact.target?.format;
  const format = formatValue(typeof rawFormat === 'string' ? rawFormat : 'text');
  const schemaBindings = Array.isArray(artifact.workspace?.schemaBindings)
    ? artifact.workspace.schemaBindings
    : [];
  const schemaBinding = schemaBindings[0];
  const schema =
    schemaBinding?.schemaName && schemaBinding.version
      ? `${schemaBinding.schemaName} ${schemaBinding.version}`
      : (artifact.boundCommit?.schema ?? 'Unknown');
  const dateLine = artifact.leaf.generated_at
    ? `Generated ${formatDate(artifact.leaf.generated_at)} from ${sourceWorkspace}`
    : `Created ${formatDate(artifact.leaf.created_at)} from ${sourceWorkspace}`;

  return (
    <article className="min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-2 text-[var(--accent-leaf)]">
              <FileOutput aria-hidden="true" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  {name}
                </h3>
                <Badge variant={status.badgeVariant}>{status.label}</Badge>
                <Badge variant="outline">
                  {type} / {format}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{dateLine}</p>
            </div>
          </div>

          <p className="mt-3 text-sm leading-5 text-[var(--text-secondary)]">
            {getArtifactPreview(artifact)}
          </p>

          <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
            <OutputMeta
              label="Bound commit"
              mono
              value={commitHashLabel(artifact.boundCommit?.hash ?? artifact.leaf.commit_hash)}
            />
            <OutputMeta label="Branch" mono value={branch} />
            <OutputMeta label="Source workspace" value={sourceWorkspace} />
            <OutputMeta label="Schema context" value={schema} />
          </dl>
        </div>

        <div className="w-full border-t border-[var(--stroke-divider)] pt-3 lg:w-[220px] lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <div className="flex items-center gap-2">
            <StatusIcon status={artifact.status} />
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
              Freshness
            </p>
          </div>

          <p className="mt-2 text-sm font-semibold leading-5 text-[var(--text-primary)]">
            {status.reason}
          </p>

          <div className="mt-3 flex items-start gap-2">
            {constraints.tone === 'passed' ? (
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 text-[var(--status-success)]"
              />
            ) : (
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 text-[var(--status-warning)]"
              />
            )}
            <p className="text-xs leading-5 text-[var(--text-secondary)]">{constraints.summary}</p>
          </div>

          <Button asChild className="mt-3 w-full" size="sm" variant="canvas-outline">
            <Link
              aria-label={`${artifact.leaf.output ? 'View output' : 'View Leaf'}: ${name}`}
              href={leafHref}
            >
              <Eye aria-hidden="true" className="h-4 w-4" />
              {artifact.leaf.output ? 'View output' : 'View Leaf'}
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

function OutputMeta({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[var(--text-tertiary)]">{label}</dt>
      <dd
        className={
          mono
            ? 'mt-1 truncate font-mono text-[var(--text-primary)]'
            : 'mt-1 truncate text-[var(--text-primary)]'
        }
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function StatusIcon({ status }: { status: ProjectOutputStatus }) {
  if (status === 'fresh') {
    return <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-[var(--status-success)]" />;
  }
  if (status === 'stale') {
    return <RefreshCw aria-hidden="true" className="h-4 w-4 text-[var(--status-warning)]" />;
  }
  if (status === 'ready') {
    return <Clock3 aria-hidden="true" className="h-4 w-4 text-[var(--accent-leaf)]" />;
  }
  return <AlertTriangle aria-hidden="true" className="h-4 w-4 text-[var(--status-warning)]" />;
}

interface StatusPresentation {
  badgeVariant: 'leaf' | 'pending' | 'warning' | 'outline';
  label: string;
  reason: string;
}

const STATUS_PRESENTATION: Record<ProjectOutputStatus, Omit<StatusPresentation, 'reason'>> = {
  fresh: { badgeVariant: 'leaf', label: 'Fresh' },
  ready: { badgeVariant: 'pending', label: 'Ready' },
  stale: { badgeVariant: 'warning', label: 'Stale' },
  unknown: { badgeVariant: 'outline', label: 'Unknown' },
};

function getStatusPresentation(artifact: ProjectOutputArtifact): StatusPresentation {
  const source = artifact.workspace?.title ?? artifact.boundCommit?.branch ?? 'source branch';
  const reason = {
    fresh: `Fresh from the latest committed ${source} state.`,
    ready: 'Ready to generate from its bound commit.',
    stale: `${source} has a newer committed state.`,
    unknown: 'Latest source commit could not be resolved for this Leaf.',
  }[artifact.status];
  return { ...STATUS_PRESENTATION[artifact.status], reason };
}

function getConstraintPresentation(artifact: ProjectOutputArtifact): {
  summary: string;
  tone: 'passed' | 'warning';
} {
  const assertions = artifact.leaf.assertions;
  if (assertions && assertions.length > 0) {
    const passed = assertions.filter((assertion) => assertion.passed).length;
    return {
      summary: `${passed}/${assertions.length} constraints passed.`,
      tone: passed === assertions.length ? 'passed' : 'warning',
    };
  }

  if (!artifact.leaf.output) {
    const count = artifact.leaf.constraints.length;
    return {
      summary:
        count > 0
          ? `${count} ${count === 1 ? 'constraint' : 'constraints'} will run during generation.`
          : 'No constraints are configured for this Leaf.',
      tone: 'warning',
    };
  }

  return {
    summary: 'Constraints were not validated for this output.',
    tone: 'warning',
  };
}

function getArtifactPreview(artifact: ProjectOutputArtifact): string {
  if (artifact.leaf.output) {
    const normalized = artifact.leaf.output.replace(/\s+/g, ' ').trim();
    return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
  }
  if (artifact.target?.previewBody) return artifact.target.previewBody;
  return 'This Leaf is configured and ready to generate from its bound commit.';
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toISOString().slice(0, 10);
}

function formatValue(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
