import { FileOutput, PanelTop } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ProjectOutputArtifact {
  id: string;
  name: string;
  target: string;
  commitHash: string;
  schemaVersion: string;
  freshness: 'fresh' | 'stale';
  generatedAt: string;
}

const OUTPUT_ARTIFACTS: ProjectOutputArtifact[] = [
  {
    id: 'artifact_prd_brief',
    name: 'PRD audience brief',
    target: 'Handoff memo',
    commitHash: 'sha:12cc0d4',
    schemaVersion: 'PRD Schema v2',
    freshness: 'fresh',
    generatedAt: '2026-06-29',
  },
  {
    id: 'artifact_launch_notes',
    name: 'Launch notes summary',
    target: 'Release note',
    commitHash: 'sha:6de18a0',
    schemaVersion: 'Release Note Schema v1',
    freshness: 'stale',
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
            Outputs are artifacts generated from committed state. Workspace output targets remain
            draft configuration until commit.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {OUTPUT_ARTIFACTS.map((artifact) => (
            <article
              className="min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4"
              key={artifact.id}
            >
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
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Generated {artifact.generatedAt}
                  </p>
                </div>
              </div>

              <dl className="mt-3 grid gap-2 text-xs">
                <OutputMeta label="Bound commit" mono value={artifact.commitHash} />
                <OutputMeta label="Output target" value={artifact.target} />
                <OutputMeta label="Schema version" value={artifact.schemaVersion} />
              </dl>
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
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2">
      <dt className="text-[var(--text-tertiary)]">{label}</dt>
      <dd
        className={
          mono
            ? 'truncate font-mono text-[var(--text-primary)]'
            : 'truncate text-[var(--text-primary)]'
        }
      >
        {value}
      </dd>
    </div>
  );
}
