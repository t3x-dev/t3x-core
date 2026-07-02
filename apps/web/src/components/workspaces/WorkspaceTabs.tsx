import type { WorkspaceCandidate } from '@/types/workspaces';
import { cn } from '@/utils/cn';
import { OutputTargetsTab } from './OutputTargetsTab';
import { SchemaReviewTab } from './SchemaReviewTab';
import { SourcesTab } from './SourcesTab';
import { YOpsDraftTab } from './YOpsDraftTab';

export type WorkspaceTabId = 'chat' | 'yschema' | 'yops' | 'leaf-config';

export const WORKSPACE_TABS: {
  id: WorkspaceTabId;
  keyLabel: string;
  label: string;
  count?: (candidate: WorkspaceCandidate) => number;
}[] = [
  { id: 'chat', keyLabel: '', label: 'Source' },
  {
    id: 'yschema',
    keyLabel: '',
    label: 'YSchema',
    count: (candidate) => candidate.schemaBindings.length,
  },
  {
    id: 'yops',
    keyLabel: '',
    label: 'YOps',
    count: (candidate) => candidate.yopsDraft.operations.length,
  },
  {
    id: 'leaf-config',
    keyLabel: '',
    label: 'Leaf config',
    count: (candidate) => candidate.outputTargets.length,
  },
];

export function WorkspaceWorkflowTabs({
  activeTab,
  candidate,
  onTabChange,
}: {
  activeTab: WorkspaceTabId;
  candidate: WorkspaceCandidate | null;
  onTabChange: (tab: WorkspaceTabId) => void;
}) {
  return (
    <div
      aria-label="Workspace workflow tabs"
      className="flex min-h-11 items-center gap-4 overflow-x-auto"
      role="tablist"
    >
      {WORKSPACE_TABS.map((tab) => {
        const selected = activeTab === tab.id;
        const count = candidate ? tab.count?.(candidate) : undefined;

        return (
          <button
            aria-selected={selected}
            className={cn(
              'relative inline-flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-1 text-sm font-semibold transition-colors',
              selected
                ? 'border-[var(--source)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            role="tab"
            type="button"
          >
            {tab.keyLabel ? (
              <span className="font-mono text-xs font-bold">{tab.keyLabel}</span>
            ) : null}
            <span>{tab.label}</span>
            {count ? (
              <span className="ml-1 inline-flex size-5 items-center justify-center rounded-full bg-[var(--surface-elevated)] text-xs font-bold text-[var(--text-secondary)]">
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function WorkspaceTabs({
  activeTab,
  candidate,
  onSourceMaterialUploaded,
}: {
  activeTab: WorkspaceTabId;
  candidate: WorkspaceCandidate;
  onSourceMaterialUploaded?: () => Promise<void> | void;
}) {
  return (
    <div role="tabpanel">{renderWorkspaceTab(activeTab, candidate, onSourceMaterialUploaded)}</div>
  );
}

function renderWorkspaceTab(
  activeTab: WorkspaceTabId,
  candidate: WorkspaceCandidate,
  onSourceMaterialUploaded?: () => Promise<void> | void
) {
  if (activeTab === 'yschema') return <SchemaReviewTab candidate={candidate} />;
  if (activeTab === 'yops') return <YOpsDraftTab candidate={candidate} />;
  if (activeTab === 'leaf-config') return <OutputTargetsTab candidate={candidate} />;
  return <SourcesTab candidate={candidate} onMaterialUploaded={onSourceMaterialUploaded} />;
}
