import { useState } from 'react';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { cn } from '@/utils/cn';
import { OutputTargetsTab } from './OutputTargetsTab';
import { SchemaReviewTab } from './SchemaReviewTab';
import { SourcesTab } from './SourcesTab';
import { WorkspaceCanvasTab } from './WorkspaceCanvasTab';
import { YOpsDraftTab } from './YOpsDraftTab';

type WorkspaceTabId = 'sources' | 'schema-review' | 'yops-draft' | 'canvas' | 'output-targets';

const WORKSPACE_TABS: { id: WorkspaceTabId; label: string }[] = [
  { id: 'sources', label: 'Sources' },
  { id: 'schema-review', label: 'Schema Review' },
  { id: 'yops-draft', label: 'YOps Draft' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'output-targets', label: 'Output Targets' },
];

export function WorkspaceTabs({ candidate }: { candidate: WorkspaceCandidate }) {
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>('sources');

  return (
    <div className="flex flex-col gap-3">
      <div
        aria-label="Workspace tabs"
        className="flex flex-wrap items-center gap-1 border-b border-[var(--stroke-divider)]"
        role="tablist"
      >
        {WORKSPACE_TABS.map((tab) => {
          const selected = activeTab === tab.id;

          return (
            <button
              aria-selected={selected}
              className={cn(
                'rounded-t-md border px-3 py-2 text-sm font-medium transition-colors',
                selected
                  ? 'border-[var(--accent-branch)] bg-[var(--surface-subtle)] text-[var(--text-primary)] shadow-sm'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">{renderWorkspaceTab(activeTab, candidate)}</div>
    </div>
  );
}

function renderWorkspaceTab(activeTab: WorkspaceTabId, candidate: WorkspaceCandidate) {
  if (activeTab === 'schema-review') return <SchemaReviewTab candidate={candidate} />;
  if (activeTab === 'yops-draft') return <YOpsDraftTab draft={candidate.yopsDraft} />;
  if (activeTab === 'canvas') return <WorkspaceCanvasTab candidate={candidate} />;
  if (activeTab === 'output-targets') return <OutputTargetsTab targets={candidate.outputTargets} />;
  return <SourcesTab sources={candidate.sourceBundle} />;
}
