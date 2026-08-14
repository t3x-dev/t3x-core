import type { ReactNode } from 'react';
import { SchemaChangesView } from '@/components/schemas/SchemaChangesView';
import { SchemaRelationsView } from '@/components/schemas/SchemaRelationsView';
import { SchemaRulesView } from '@/components/schemas/SchemaRulesView';
import { SchemaStructureView } from '@/components/schemas/SchemaStructureView';
import { SchemaVersionBadge } from '@/components/schemas/SchemaVersionBadge';
import { SchemaYamlView } from '@/components/schemas/SchemaYamlView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SchemaReleasePreview } from '@/types/schemas';

export type SchemaDetailView = 'changes' | 'relations' | 'rules' | 'structure' | 'yaml';

const DETAIL_VIEWS: Array<{ id: SchemaDetailView; label: string }> = [
  { id: 'structure', label: 'Structure' },
  { id: 'relations', label: 'Relations' },
  { id: 'rules', label: 'Rules' },
  { id: 'yaml', label: 'Canonical YAML' },
  { id: 'changes', label: 'Changes' },
];

interface SchemaReleaseDetailProps {
  activeView: SchemaDetailView;
  actions?: ReactNode;
  comparisonBaseRelease: SchemaReleasePreview | null;
  onViewChange: (view: SchemaDetailView) => void;
  release: SchemaReleasePreview;
}

export function SchemaReleaseDetail({
  activeView,
  actions,
  comparisonBaseRelease,
  onViewChange,
  release,
}: SchemaReleaseDetailProps) {
  const visibleViews = DETAIL_VIEWS.filter((view) => {
    if (view.id === 'relations') return release.relationTypes.length > 0;
    if (view.id === 'rules') return release.rules.length > 0;
    if (view.id === 'changes') return comparisonBaseRelease !== null;
    return true;
  });
  const activeViewLabel = visibleViews.find((view) => view.id === activeView)?.label ?? activeView;

  return (
    <section
      aria-label="Selected schema version"
      className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-sm"
    >
      <header className="grid items-start gap-3 border-b border-[var(--stroke-divider)] p-4 min-[721px]:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="mb-[3px] text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            Selected version
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold leading-[1.35] text-[var(--text-primary)]">
              <SchemaVersionBadge release={release} />
            </h3>
          </div>
        </div>

        <div className="flex flex-none flex-wrap items-start gap-2 min-[721px]:justify-end">
          {actions}
        </div>
        <p className="max-w-[760px] text-[13px] leading-5 text-[var(--text-secondary)] min-[721px]:col-span-2">
          {release.description}
        </p>
      </header>

      <p aria-live="polite" className="sr-only">
        {release.version} {activeViewLabel} view
      </p>

      <Tabs
        className="min-h-0 flex-1 gap-0"
        onValueChange={(value) => onViewChange(value as SchemaDetailView)}
        value={activeView}
      >
        <TabsList
          aria-label="Schema version views"
          className="flex min-h-[45px] w-full justify-start gap-[18px] overflow-x-auto rounded-none border-b border-[var(--stroke-divider)] bg-transparent px-4 py-0 text-[var(--text-secondary)] shadow-none dark:rounded-none dark:border-b dark:border-[var(--stroke-divider)] dark:bg-transparent dark:p-0"
        >
          {visibleViews.map((view) => (
            <TabsTrigger
              className="h-[45px] flex-none rounded-none border-0 border-b-2 border-b-transparent bg-transparent px-0 py-0 text-[13px] [font-weight:650] text-[var(--text-secondary)] shadow-none hover:text-[var(--text-primary)] data-[state=active]:border-b-[var(--accent-commit)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-none dark:px-0 dark:py-0 dark:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]"
              key={view.id}
              value={view.id}
            >
              {view.id === 'changes' && comparisonBaseRelease
                ? `Changes vs ${comparisonBaseRelease.version}`
                : view.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent className="m-0 min-h-0 flex-1 p-4" value="structure">
          <SchemaStructureView release={release} />
        </TabsContent>
        <TabsContent className="m-0 min-h-0 flex-1 p-4" value="relations">
          <SchemaRelationsView release={release} />
        </TabsContent>
        <TabsContent className="m-0 min-h-0 flex-1 p-4" value="rules">
          <SchemaRulesView release={release} />
        </TabsContent>
        <TabsContent className="m-0 min-h-0 flex-1 p-4" value="yaml">
          <SchemaYamlView release={release} />
        </TabsContent>
        <TabsContent className="m-0 min-h-0 flex-1 p-4" value="changes">
          <SchemaChangesView comparisonBaseRelease={comparisonBaseRelease} release={release} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
