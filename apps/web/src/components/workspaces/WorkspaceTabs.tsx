import type { SourceBundleItem, WorkspaceCandidate } from '@/types/workspaces';
import { cn } from '@/utils/cn';
import { SourcesTab } from './SourcesTab';
import { type WorkspaceYOpsFlowView, YOpsDraftTab } from './YOpsDraftTab';

export type WorkspaceTabId = 'chat' | WorkspaceYOpsFlowView;

export const WORKSPACE_TABS: {
  id: WorkspaceTabId;
  keyLabel: string;
  label: string;
  count?: (candidate: WorkspaceCandidate) => number;
}[] = [
  { id: 'chat', keyLabel: '', label: 'Source' },
  {
    id: 'ops',
    keyLabel: '',
    label: 'Ops',
    count: (candidate) => candidate.yopsDraft.operations.length,
  },
  {
    id: 'validation',
    keyLabel: '',
    label: 'Validation',
    count: (candidate) => candidate.schemaReview.gaps.length,
  },
  {
    id: 'preview',
    keyLabel: '',
    label: 'Preview',
  },
  {
    id: 'commit',
    keyLabel: '',
    label: 'Commit',
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
  candidateExtracted,
  extractingCandidate,
  flowError,
  onChatSourceEvidenceChange,
  onExtractCandidate,
  onSourceMaterialUploaded,
  onSendToYOps,
  onYOpsCommitted,
  sendingToYOps,
  yopsDraftSent,
}: {
  activeTab: WorkspaceTabId;
  candidate: WorkspaceCandidate;
  candidateExtracted?: boolean;
  extractingCandidate?: boolean;
  flowError?: string;
  onChatSourceEvidenceChange?: (sourceId: string, source: SourceBundleItem | null) => void;
  onExtractCandidate?: () => Promise<void> | void;
  onSourceMaterialUploaded?: () => Promise<void> | void;
  onSendToYOps?: () => Promise<void> | void;
  onYOpsCommitted?: (commitHash: string) => void;
  sendingToYOps?: boolean;
  yopsDraftSent?: boolean;
}) {
  return (
    <div role="tabpanel">
      {renderWorkspaceTab(activeTab, candidate, {
        candidateExtracted,
        extractingCandidate,
        flowError,
        onChatSourceEvidenceChange,
        onExtractCandidate,
        onSendToYOps,
        onSourceMaterialUploaded,
        onYOpsCommitted,
        sendingToYOps,
        yopsDraftSent,
      })}
    </div>
  );
}

interface RenderWorkspaceTabOptions {
  candidateExtracted?: boolean;
  extractingCandidate?: boolean;
  flowError?: string;
  onChatSourceEvidenceChange?: (sourceId: string, source: SourceBundleItem | null) => void;
  onExtractCandidate?: () => Promise<void> | void;
  onSendToYOps?: () => Promise<void> | void;
  onSourceMaterialUploaded?: () => Promise<void> | void;
  onYOpsCommitted?: (commitHash: string) => void;
  sendingToYOps?: boolean;
  yopsDraftSent?: boolean;
}

function renderWorkspaceTab(
  activeTab: WorkspaceTabId,
  candidate: WorkspaceCandidate,
  options: RenderWorkspaceTabOptions
) {
  if (activeTab !== 'chat') {
    return (
      <YOpsDraftTab
        candidate={candidate}
        flowError={options.flowError}
        onSendToYOps={options.onSendToYOps}
        onCommitted={options.onYOpsCommitted}
        sendingToYOps={options.sendingToYOps}
        view={activeTab}
        yopsDraftSent={options.yopsDraftSent}
      />
    );
  }
  return (
    <SourcesTab
      candidate={candidate}
      candidateExtracted={options.candidateExtracted}
      extracting={options.extractingCandidate}
      flowError={options.flowError}
      onChatSourceEvidenceChange={options.onChatSourceEvidenceChange}
      onExtractCandidate={options.onExtractCandidate}
      onMaterialUploaded={options.onSourceMaterialUploaded}
    />
  );
}
