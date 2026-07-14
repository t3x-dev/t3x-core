import { type ReactNode, useState } from 'react';
import {
  type SchemaDetailView,
  SchemaReleaseDetail,
} from '@/components/schemas/SchemaReleaseDetail';
import { SchemaReleaseList } from '@/components/schemas/SchemaReleaseList';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SchemaReleasePreview } from '@/types/schemas';

interface SchemaRegistryProps {
  currentReleaseId: string;
  releases: SchemaReleasePreview[];
}

export function SchemaRegistry({ currentReleaseId, releases }: SchemaRegistryProps) {
  const currentRelease =
    releases.find((release) => release.id === currentReleaseId && release.status === 'active') ??
    null;
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<SchemaDetailView>('structure');
  const selectedRelease =
    (selectedReleaseId
      ? releases.find((release) => release.id === selectedReleaseId)
      : undefined) ??
    currentRelease ??
    releases[0] ??
    null;

  function handleSelectRelease(releaseId: string) {
    setSelectedReleaseId(releaseId);
    setActiveView('structure');
  }

  function handleOpenCanonicalYaml() {
    if (!currentRelease) return;
    setSelectedReleaseId(currentRelease.id);
    setActiveView('yaml');
  }

  if (!selectedRelease) {
    return (
      <section className="h-full overflow-auto bg-[var(--surface-app)] p-2.5 min-[481px]:p-4">
        <div className="mx-auto w-full max-w-[1480px]">
          <section
            aria-labelledby="schemas-page-title"
            className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-panel)] shadow-sm"
          >
            <SchemaRegistryHeader
              currentRelease={null}
              onOpenCanonicalYaml={handleOpenCanonicalYaml}
            />
            <div className="border-t border-[var(--stroke-divider)] p-4 text-sm text-[var(--text-secondary)]">
              No schema versions are available for this project.
            </div>
          </section>
        </div>
      </section>
    );
  }

  const summaryRelease = currentRelease ?? selectedRelease;

  return (
    <section className="h-full overflow-auto bg-[var(--surface-app)] p-2.5 min-[481px]:p-4">
      <div className="mx-auto w-full max-w-[1480px]">
        <section
          aria-labelledby="schemas-page-title"
          className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-panel)] shadow-sm"
        >
          <SchemaRegistryHeader
            currentRelease={currentRelease}
            onOpenCanonicalYaml={handleOpenCanonicalYaml}
          />

          <dl className="grid gap-px border-t border-[var(--stroke-divider)] bg-[var(--stroke-divider)] min-[481px]:grid-cols-2 min-[721px]:grid-cols-4">
            <SchemaFact label="Schema">
              <span>{summaryRelease.name}</span>
              <Badge className="text-[11px]" variant="commit">
                single family
              </Badge>
            </SchemaFact>
            <SchemaFact label="Current version">
              {currentRelease ? (
                <>
                  <span className="font-mono">{currentRelease.version}</span>
                  <Badge className="text-[11px]" variant="success">
                    current
                  </Badge>
                </>
              ) : (
                <>
                  <span>Not set</span>
                  <Badge className="text-[11px]" variant="pending">
                    no current
                  </Badge>
                </>
              )}
            </SchemaFact>
            <SchemaFact label="Root">
              <span className="font-mono">{summaryRelease.rootKey}</span>
              <Badge className="text-[11px]" variant="outline">
                strict paths
              </Badge>
            </SchemaFact>
            <SchemaFact label="Usage">
              <span>
                {summaryRelease.usedByCommitCount}{' '}
                {summaryRelease.usedByCommitCount === 1 ? 'commit' : 'commits'}
              </span>
              <span>
                {summaryRelease.usedByWorkspaceCount}{' '}
                {summaryRelease.usedByWorkspaceCount === 1 ? 'workspace' : 'workspaces'}
              </span>
            </SchemaFact>
          </dl>
        </section>

        <section
          aria-label="Schema version browser"
          className="mt-4 grid min-h-[650px] gap-4 min-[961px]:grid-cols-[280px_minmax(0,1fr)]"
        >
          <SchemaReleaseList
            currentRelease={currentRelease}
            onSelectRelease={handleSelectRelease}
            releases={releases}
            selectedReleaseId={selectedRelease.id}
          />
          <SchemaReleaseDetail
            activeView={activeView}
            currentRelease={currentRelease}
            onCompareWithCurrent={() => setActiveView('changes')}
            onViewChange={setActiveView}
            release={selectedRelease}
          />
        </section>

        <p className="mx-0.5 mt-[14px] text-[11px] text-[var(--text-tertiary)]">
          Preview data — one project, one Schema family, versioned YAML contracts.
        </p>
      </div>
    </section>
  );
}

function SchemaRegistryHeader({
  currentRelease,
  onOpenCanonicalYaml,
}: {
  currentRelease: SchemaReleasePreview | null;
  onOpenCanonicalYaml: () => void;
}) {
  return (
    <header className="flex flex-col items-start justify-between gap-6 p-4 min-[721px]:flex-row">
      <div>
        <p className="mb-[3px] text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
          Repository contract
        </p>
        <h2
          className="text-lg font-bold leading-[1.3] text-[var(--text-primary)]"
          id="schemas-page-title"
        >
          Schemas
        </h2>
        <p className="mt-0.5 max-w-[700px] text-[13px] leading-5 text-[var(--text-secondary)]">
          One versioned contract defines the shape of this repository&apos;s structured state. New
          workspaces use the current version; existing commits keep their original version.
        </p>
      </div>
      <Button
        aria-label={
          currentRelease
            ? `Open current ${currentRelease.version} canonical YAML`
            : 'Open current canonical YAML'
        }
        className="h-[34px] flex-none rounded-[var(--radius-md)] px-3 text-[13px] [font-weight:650] text-[var(--text-primary)]"
        disabled={!currentRelease}
        onClick={onOpenCanonicalYaml}
        type="button"
        variant="canvas-outline"
      >
        Open canonical YAML
      </Button>
    </header>
  );
}

function SchemaFact({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="min-w-0 bg-[var(--surface-panel)] px-4 pt-[13px] pb-[14px]">
      <dt className="mb-[5px] block text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
        {label}
      </dt>
      <dd className="m-0 flex min-w-0 flex-wrap items-center gap-[7px] text-[13px] [font-weight:650] text-[var(--text-primary)]">
        {children}
      </dd>
    </div>
  );
}
