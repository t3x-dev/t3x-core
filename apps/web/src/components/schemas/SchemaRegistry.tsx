'use client';

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
import type { SchemaCompositionWorkspaceContext } from '@/types/schemaModules';
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
  const [registryView, setRegistryView] = useState<'modules' | 'versions'>('versions');
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
                      currentRelease={currentRelease}
                      selectedRelease={selectedRelease}
                    />
                  ) : null}
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

        {registryView === 'modules' ? (
          <SchemaModuleRegistry workspace={compositionWorkspace} />
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
  onViewChange: (view: 'modules' | 'versions') => void;
  registryView: 'modules' | 'versions';
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
          Schema families define different kinds of structured state. Choose a family to inspect its
          current contract, deterministic rules, typed relations, and canonical YAML.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div
          aria-label="Schema registry view"
          className="flex rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-1"
          role="tablist"
        >
          {(['versions', 'modules'] as const).map((view) => (
            <button
              aria-selected={registryView === view}
              className={`h-7 rounded-md px-3 text-[12px] font-semibold capitalize transition-colors ${registryView === view ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              key={view}
              onClick={() => onViewChange(view)}
              role="tab"
              type="button"
            >
              {view}
            </button>
          ))}
        </div>
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
