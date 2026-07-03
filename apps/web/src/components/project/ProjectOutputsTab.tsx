import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileOutput,
  GitCommitHorizontal,
  PanelTop,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ProjectOutputArtifact {
  id: string;
  name: string;
  type: string;
  format: string;
  sourceWorkspace: string;
  commitHash: string;
  branch: string;
  schemaVersion: string;
  freshness: 'fresh' | 'stale';
  freshnessReason: string;
  constraints: 'passed' | 'warning';
  constraintsSummary: string;
  preview: string;
  generatedAt: string;
}

const OUTPUT_ARTIFACTS: ProjectOutputArtifact[] = [
  {
    id: 'artifact_prd_brief',
    name: 'PRD audience brief',
    type: 'Handoff memo',
    format: 'Markdown',
    sourceWorkspace: 'PRD audience handoff',
    commitHash: 'sha:12cc0d4',
    branch: 'main',
    schemaVersion: 'PRD Schema v2',
    freshness: 'fresh',
    freshnessReason: 'Fresh from latest committed PRD state.',
    constraints: 'passed',
    constraintsSummary: 'Committed state only, audience evidence preserved.',
    preview: 'Reviewer-facing PRD brief generated from the committed candidate tree.',
    generatedAt: '2026-06-29',
  },
  {
    id: 'artifact_launch_notes',
    name: 'Launch notes summary',
    type: 'Release note',
    format: 'MD',
    sourceWorkspace: 'Release note cleanup',
    commitHash: 'sha:6de18a0',
    branch: 'release/notes-cleanup',
    schemaVersion: 'Release Note Schema v1',
    freshness: 'stale',
    freshnessReason: 'Stale because release note cleanup has a newer committed head.',
    constraints: 'warning',
    constraintsSummary: 'Regenerate before publishing so scope matches latest state.',
    preview: 'Draft launch-note summary generated before the latest cleanup commit.',
    generatedAt: '2026-06-26',
  },
];

export function ProjectOutputsTab() {
  return (
    <section className="h-full overflow-auto p-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <PanelTop aria-hidden="true" className="h-4 w-4 text-[var(--accent-leaf)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Committed outputs</h2>
          </div>
          <p className="text-sm leading-5 text-[var(--text-secondary)]">
            Outputs are committed Leaf artifacts with stable source commits, freshness, and
            constraint status. Workspace output targets remain draft configuration until commit.
          </p>
        </div>

        <div className="grid gap-3">
          {OUTPUT_ARTIFACTS.map((artifact) => (
            <article
              className="min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4"
              key={artifact.id}
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-2 text-[var(--accent-leaf)]">
                      <FileOutput aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                          {artifact.name}
                        </h3>
                        <Badge variant={artifact.freshness === 'fresh' ? 'leaf' : 'warning'}>
                          {artifact.freshness === 'fresh' ? 'Fresh' : 'Stale'}
                        </Badge>
                        <Badge variant="outline">
                          {artifact.type} / {artifact.format}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        Generated {artifact.generatedAt} from {artifact.sourceWorkspace}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 text-sm leading-5 text-[var(--text-secondary)]">
                    {artifact.preview}
                  </p>

                  <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                    <OutputMeta label="Bound commit" mono value={artifact.commitHash} />
                    <OutputMeta label="Branch" mono value={artifact.branch} />
                    <OutputMeta label="Source workspace" value={artifact.sourceWorkspace} />
                    <OutputMeta label="Schema" value={artifact.schemaVersion} />
                  </dl>
                </div>

                <OutputReadiness artifact={artifact} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
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
      >
        {value}
      </dd>
    </div>
  );
}

function OutputReadiness({ artifact }: { artifact: ProjectOutputArtifact }) {
  const fresh = artifact.freshness === 'fresh';
  const constraintsPassed = artifact.constraints === 'passed';

  return (
    <div className="w-full border-t border-[var(--stroke-divider)] pt-3 lg:w-[220px] lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
      <div className="flex items-center gap-2">
        {fresh ? (
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-[var(--status-success)]" />
        ) : (
          <RefreshCw aria-hidden="true" className="h-4 w-4 text-[var(--status-warning)]" />
        )}
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
          Freshness
        </p>
      </div>

      <p className="mt-2 text-sm font-semibold leading-5 text-[var(--text-primary)]">
        {artifact.freshnessReason}
      </p>

      <div className="mt-3 flex items-start gap-2">
        {constraintsPassed ? (
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 text-[var(--status-success)]" />
        ) : (
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 text-[var(--status-warning)]"
          />
        )}
        <p className="text-xs leading-5 text-[var(--text-secondary)]">
          {artifact.constraintsSummary}
        </p>
      </div>

      <Button
        aria-label={`${fresh ? 'View output' : 'Regenerate from latest commit'}: ${artifact.name}`}
        className="mt-3 w-full"
        size="sm"
        type="button"
        variant={fresh ? 'canvas-outline' : 'leaf'}
      >
        {fresh ? (
          <Eye aria-hidden="true" className="h-4 w-4" />
        ) : (
          <GitCommitHorizontal aria-hidden="true" className="h-4 w-4" />
        )}
        {fresh ? 'View output' : 'Regenerate'}
      </Button>
    </div>
  );
}
