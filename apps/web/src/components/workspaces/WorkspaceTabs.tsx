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
    label: 'Proposal',
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
  validationGapCount,
}: {
  activeTab: WorkspaceTabId;
  candidate: WorkspaceCandidate | null;
  onTabChange: (tab: WorkspaceTabId) => void;
  validationGapCount?: number;
}) {
  return (
    <div
      aria-label="Workspace workflow tabs"
      className="flex min-h-[52px] items-stretch overflow-x-auto"
      role="tablist"
    >
      {WORKSPACE_TABS.map((tab) => {
        const selected = activeTab === tab.id;
        const count =
          tab.id === 'validation' && validationGapCount !== undefined
            ? validationGapCount
            : candidate
              ? tab.count?.(candidate)
              : undefined;

        return (
          <button
            aria-selected={selected}
            className={cn(
              'relative inline-flex min-w-[124px] shrink-0 items-center justify-center gap-1.5 border-b-2 px-4 text-sm font-semibold transition-colors',
              selected
                ? 'border-[var(--source)] bg-[var(--surface-card)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
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
  continuationBusy,
  extractingCandidate,
  flowError,
  onChatSourceEvidenceChange,
  onContinueFromCommit,
  onExtractCandidate,
  onSourceMaterialUploaded,
  onSendToYOps,
  onYOpsApplied,
  onYOpsCommitted,
  onViewCommitInState,
  onWorkflowTabChange,
  sendingToYOps,
  sourceConversationId,
  sourceParentCommitHash,
  yopsDraftSent,
}: {
  activeTab: WorkspaceTabId;
  candidate: WorkspaceCandidate;
  candidateExtracted?: boolean;
  continuationBusy?: boolean;
  extractingCandidate?: boolean;
  flowError?: string;
  onChatSourceEvidenceChange?: (sourceId: string, source: SourceBundleItem | null) => void;
  onContinueFromCommit?: (
    commitHash: string,
    targetBranch: string,
    createBranchFrom?: string
  ) => Promise<void> | void;
  onExtractCandidate?: () => Promise<void> | void;
  onSourceMaterialUploaded?: () => Promise<void> | void;
  onSendToYOps?: () => Promise<void> | void;
  onYOpsApplied?: (remainingSchemaGapCount: number) => void;
  onYOpsCommitted?: (commitHash: string, branch: string) => void;
  onViewCommitInState?: (commitHash: string, branch: string) => void;
  onWorkflowTabChange?: (tab: WorkspaceTabId) => void;
  sendingToYOps?: boolean;
  sourceConversationId?: string;
  sourceParentCommitHash?: string;
  yopsDraftSent?: boolean;
}) {
  return (
    <div role="tabpanel">
      {renderWorkspaceTab(activeTab, candidate, {
        candidateExtracted,
        continuationBusy,
        extractingCandidate,
        flowError,
        onChatSourceEvidenceChange,
        onContinueFromCommit,
        onExtractCandidate,
        onSendToYOps,
        onSourceMaterialUploaded,
        onYOpsApplied,
        onYOpsCommitted,
        onViewCommitInState,
        onWorkflowTabChange,
        sendingToYOps,
        sourceConversationId,
        sourceParentCommitHash,
        yopsDraftSent,
      })}
    </div>
  );
}

interface RenderWorkspaceTabOptions {
  candidateExtracted?: boolean;
  continuationBusy?: boolean;
  extractingCandidate?: boolean;
  flowError?: string;
  onChatSourceEvidenceChange?: (sourceId: string, source: SourceBundleItem | null) => void;
  onContinueFromCommit?: (
    commitHash: string,
    targetBranch: string,
    createBranchFrom?: string
  ) => Promise<void> | void;
  onExtractCandidate?: () => Promise<void> | void;
  onSendToYOps?: () => Promise<void> | void;
  onSourceMaterialUploaded?: () => Promise<void> | void;
  onYOpsApplied?: (remainingSchemaGapCount: number) => void;
  onYOpsCommitted?: (commitHash: string, branch: string) => void;
  onViewCommitInState?: (commitHash: string, branch: string) => void;
  onWorkflowTabChange?: (tab: WorkspaceTabId) => void;
  sendingToYOps?: boolean;
  sourceConversationId?: string;
  sourceParentCommitHash?: string;
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
        continuationBusy={options.continuationBusy}
        flowError={options.flowError}
        onContinueFromCommit={options.onContinueFromCommit}
        onSendToYOps={options.onSendToYOps}
        onApplied={options.onYOpsApplied}
        onCommitted={options.onYOpsCommitted}
        onViewCommitInState={options.onViewCommitInState}
        sendingToYOps={options.sendingToYOps}
        onViewChange={options.onWorkflowTabChange}
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
      conversationId={options.sourceConversationId}
      parentCommitHash={options.sourceParentCommitHash}
      targetBranch={candidate.targetBranch}
      onChatSourceEvidenceChange={options.onChatSourceEvidenceChange}
      onExtractCandidate={options.onExtractCandidate}
      onMaterialUploaded={options.onSourceMaterialUploaded}
    />
  );
}
