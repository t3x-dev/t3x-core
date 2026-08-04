'use client';

import { ArrowLeft, Blocks, FilePlus2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { SchemaModuleRegistry } from '@/components/schemas/modules/SchemaModuleRegistry';
import {
  SchemaBindingActions,
  type SchemaBindingActionsState,
} from '@/components/schemas/SchemaBindingActions';
import { SchemaFamilyTabs } from '@/components/schemas/SchemaFamilyTabs';
import {
  type SchemaDetailView,
  SchemaReleaseDetail,
} from '@/components/schemas/SchemaReleaseDetail';
import { SchemaReleaseList } from '@/components/schemas/SchemaReleaseList';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { publishedSchemaReleaseId } from '@/domain/schemas/publishedSchemaVersions';
import type {
  PublishedSchemaVersionManifest,
  SchemaCompositionWorkspaceContext,
} from '@/types/schemaModules';
import type { SchemaFamilyPreview, SchemaReleasePreview } from '@/types/schemas';

interface SchemaRegistryProps {
  bindingActions?: SchemaBindingActionsState;
  compositionWorkspace?: SchemaCompositionWorkspaceContext;
  defaultFamilyId: string;
  families: SchemaFamilyPreview[];
}

export function SchemaRegistry({
  bindingActions,
  compositionWorkspace,
  defaultFamilyId,
  families,
}: SchemaRegistryProps) {
  const [registryView, setRegistryView] = useState<'compose' | 'versions'>('versions');
  const initialFamily =
    families.find((family) => family.id === defaultFamilyId) ?? families[0] ?? null;
  const [selectedFamilyId, setSelectedFamilyId] = useState(initialFamily?.id ?? '');
  const [selectedReleaseIds, setSelectedReleaseIds] = useState<Record<string, string>>({});
  const [activeView, setActiveView] = useState<SchemaDetailView>('structure');

  const selectedFamily = families.find((family) => family.id === selectedFamilyId) ?? initialFamily;
  const currentRelease = getCurrentRelease(selectedFamily);
  const selectedRelease = selectedFamily
    ? (selectedFamily.releases.find(
        (release) => release.id === selectedReleaseIds[selectedFamily.id]
      ) ??
      currentRelease ??
      selectedFamily.releases[0] ??
      null)
    : null;

  function handleSelectFamily(familyId: string) {
    setSelectedFamilyId(familyId);
    setActiveView('structure');
  }

  function handleSelectRelease(releaseId: string) {
    if (!selectedFamily) return;
    setSelectedReleaseIds((releaseIds) => ({
      ...releaseIds,
      [selectedFamily.id]: releaseId,
    }));
    setActiveView('structure');
  }

  function handleOpenCanonicalYaml() {
    if (!selectedRelease) return;
    setActiveView('yaml');
  }

  async function handleVersionPublished(version: PublishedSchemaVersionManifest) {
    await compositionWorkspace?.onPublished?.(version);
    setSelectedFamilyId(version.family);
    setSelectedReleaseIds((releaseIds) => ({
      ...releaseIds,
      [version.family]: publishedSchemaReleaseId(version.canonicalName, version.version),
    }));
    setActiveView('structure');
    setRegistryView('versions');
  }

  return (
    <section className="h-full overflow-auto bg-[var(--surface-app)] p-2.5 min-[481px]:p-4">
      <div className="mx-auto w-full max-w-[1480px]">
        <section
          aria-labelledby="schemas-page-title"
          className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-panel)] shadow-sm"
        >
          <SchemaRegistryHeader
            onOpenCanonicalYaml={handleOpenCanonicalYaml}
            onViewChange={setRegistryView}
            registryView={registryView}
            selectedRelease={selectedRelease}
          />

          {registryView === 'versions' ? (
            <>
              {selectedFamily ? (
                <SchemaFamilyTabs
                  activeFamilyId={selectedFamily.id}
                  families={families}
                  onSelectFamily={handleSelectFamily}
                />
              ) : null}

              {selectedFamily && selectedRelease ? (
                <>
                  <SchemaRegistryFacts
                    currentRelease={currentRelease}
                    family={selectedFamily}
                    familyCount={families.length}
                    selectedRelease={selectedRelease}
                  />
                  {bindingActions ? (
                    <SchemaBindingActions
                      actions={bindingActions}
                      selectedRelease={selectedRelease}
                    />
                  ) : null}
                  <ComposeVersionCallout onCompose={() => setRegistryView('compose')} />
                </>
              ) : (
                <div className="border-t border-[var(--stroke-divider)] p-4 text-sm text-[var(--text-secondary)]">
                  {selectedFamily
                    ? `No versions are available for ${selectedFamily.name}.`
                    : 'No schema families are available for this project.'}
                </div>
              )}
            </>
          ) : null}
        </section>

        {registryView === 'versions' && selectedFamily && selectedRelease ? (
          <section
            aria-label="Schema version browser"
            className="mt-4 grid min-h-[650px] gap-4 min-[961px]:grid-cols-[280px_minmax(0,1fr)]"
          >
            <SchemaReleaseList
              currentRelease={currentRelease}
              onSelectRelease={handleSelectRelease}
              releases={selectedFamily.releases}
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
        ) : null}

        {registryView === 'compose' ? (
          <SchemaModuleRegistry
            nextVersion={suggestNextVersion(selectedFamily?.releases ?? [])}
            workspace={
              compositionWorkspace
                ? { ...compositionWorkspace, onPublished: handleVersionPublished }
                : undefined
            }
          />
        ) : null}

        <p className="mx-0.5 mt-[14px] text-[11px] text-[var(--text-tertiary)]">
          Preview data — one repository can use multiple Schema families; each family keeps an
          independent, immutable version history.
        </p>
      </div>
    </section>
  );
}

function getCurrentRelease(family: SchemaFamilyPreview | null): SchemaReleasePreview | null {
  return (
    family?.releases.find(
      (release) => release.id === family.currentReleaseId && release.status === 'active'
    ) ?? null
  );
}

function SchemaRegistryHeader({
  onOpenCanonicalYaml,
  onViewChange,
  registryView,
  selectedRelease,
}: {
  onOpenCanonicalYaml: () => void;
  onViewChange: (view: 'compose' | 'versions') => void;
  registryView: 'compose' | 'versions';
  selectedRelease: SchemaReleasePreview | null;
}) {
  return (
    <header className="flex flex-col items-start justify-between gap-6 p-4 min-[721px]:flex-row">
      <div>
        <p className="mb-[3px] text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
          Repository contracts
        </p>
        <h2
          className="text-lg font-bold leading-[1.3] text-[var(--text-primary)]"
          id="schemas-page-title"
        >
          Schemas
        </h2>
        <p className="mt-0.5 max-w-[760px] text-[13px] leading-5 text-[var(--text-secondary)]">
          {registryView === 'versions'
            ? 'Choose an immutable version to inspect, reuse, or apply. Create a new version by composing Core with ordered Modules.'
            : 'Assemble Core and Modules, verify the result, save the draft, then publish an immutable version for later reuse.'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="h-[34px] rounded-[var(--radius-md)] px-3 text-[13px]"
          onClick={() => onViewChange(registryView === 'versions' ? 'compose' : 'versions')}
          type="button"
          variant={registryView === 'versions' ? 'commit' : 'canvas-outline'}
        >
          {registryView === 'versions' ? (
            <FilePlus2 aria-hidden="true" className="size-3.5" />
          ) : (
            <ArrowLeft aria-hidden="true" className="size-3.5" />
          )}
          {registryView === 'versions' ? 'Compose new version' : 'Back to version history'}
        </Button>
        {registryView === 'versions' ? (
          <Button
            aria-label={
              selectedRelease
                ? `Open ${selectedRelease.name} ${selectedRelease.version} canonical YAML`
                : 'Open canonical YAML'
            }
            className="h-[34px] flex-none rounded-[var(--radius-md)] px-3 text-[13px] [font-weight:650] text-[var(--text-primary)]"
            disabled={!selectedRelease}
            onClick={onOpenCanonicalYaml}
            type="button"
            variant="canvas-outline"
          >
            Open canonical YAML
          </Button>
        ) : null}
      </div>
    </header>
  );
}

function ComposeVersionCallout({ onCompose }: { onCompose: () => void }) {
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--stroke-divider)] bg-[color-mix(in_srgb,var(--accent-commit)_5%,var(--surface-panel))] px-4 py-3 min-[721px]:flex-row min-[721px]:items-center min-[721px]:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-8 flex-none items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--accent-commit)_12%,transparent)] text-[var(--accent-commit)]">
          <Blocks aria-hidden="true" className="size-4" />
        </span>
        <div>
          <p className="text-[12px] font-semibold text-[var(--text-primary)]">
            Need a different contract?
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-secondary)]">
            Select and reorder Modules, compile the contract, then publish it into this version
            history.
          </p>
        </div>
      </div>
      <Button
        className="h-8 flex-none text-xs"
        onClick={onCompose}
        type="button"
        variant="canvas-outline"
      >
        Compose a version
      </Button>
    </div>
  );
}

function suggestNextVersion(releases: SchemaReleasePreview[]): string {
  const semanticVersions = releases
    .map((release) => /^(\d+)\.(\d+)\.(\d+)$/.exec(release.version))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => [Number(match[1]), Number(match[2]), Number(match[3])] as const)
    .sort((left, right) => right[0] - left[0] || right[1] - left[1] || right[2] - left[2]);
  const latest = semanticVersions[0];
  return latest ? `${latest[0]}.${latest[1]}.${latest[2] + 1}` : '1.0.0';
}

function SchemaRegistryFacts({
  currentRelease,
  family,
  familyCount,
  selectedRelease,
}: {
  currentRelease: SchemaReleasePreview | null;
  family: SchemaFamilyPreview;
  familyCount: number;
  selectedRelease: SchemaReleasePreview;
}) {
  const summaryRelease = currentRelease ?? selectedRelease;

  return (
    <dl className="grid gap-px border-t border-[var(--stroke-divider)] bg-[var(--stroke-divider)] min-[481px]:grid-cols-2 min-[721px]:grid-cols-4">
      <SchemaFact label="Schema">
        <span>{family.name}</span>
        <Badge className="text-[11px]" variant="commit">
          {familyCount} {familyCount === 1 ? 'family' : 'families'}
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
