import type {
  SourceBundleItem,
  WorkspaceCandidate,
  WorkspaceProposalGenerationView,
  WorkspaceProposalPosture,
  WorkspaceSourceArtifact,
} from '@/types/workspaces';
import { cn } from '@/utils/cn';
import type {
  ProposalGenerationAction,
  ProposalGenerationReviewState,
} from './ProposalGenerationReviewView';
import { SourcesTab } from './SourcesTab';
import { SourceTransitionTab } from './SourceTransitionTab';
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
  branchOptions,
  candidate,
  candidateExtracted,
  continuationBusy,
  extractingCandidate,
  flowError,
  onChatSourceEvidenceChange,
  onContinueFromCommit,
  onExtractCandidate,
  onGenerateProposal,
  onProposalAction,
  onProposalPostureChange,
  onSourceMaterialUploaded,
  onSourceArtifactChange,
  onSendToYOps,
  onVerifyProposal,
  onYOpsApplied,
  onYOpsCommitted,
  onYOpsScriptSave,
  onViewCommitInState,
  onWorkflowTabChange,
  sendingToYOps,
  proposalGeneration,
  proposalGenerationBusy,
  proposalPosture,
  proposalReviewState,
  sourceConversationId,
  sourceParentCommitHash,
  yopsDraftSent,
}: {
  activeTab: WorkspaceTabId;
  branchOptions?: string[];
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
  onGenerateProposal?: () => Promise<void> | void;
  onProposalAction?: (action: ProposalGenerationAction) => Promise<void> | void;
  onProposalPostureChange?: (posture: WorkspaceProposalPosture) => void;
  onSourceMaterialUploaded?: () => Promise<void> | void;
  onSourceArtifactChange?: (artifact: WorkspaceSourceArtifact | undefined) => void;
  onSendToYOps?: () => Promise<void> | void;
  onVerifyProposal?: () => Promise<void> | void;
  onYOpsApplied?: (remainingSchemaGapCount: number) => void;
  onYOpsCommitted?: (commitHash: string, branch: string, workspace: WorkspaceCandidate) => void;
  onYOpsScriptSave?: (workspace: WorkspaceCandidate) => Promise<void> | void;
  onViewCommitInState?: (commitHash: string, branch: string) => void;
  onWorkflowTabChange?: (tab: WorkspaceTabId) => void;
  sendingToYOps?: boolean;
  proposalGeneration?: WorkspaceProposalGenerationView;
  proposalGenerationBusy?: boolean;
  proposalPosture?: WorkspaceProposalPosture;
  proposalReviewState?: ProposalGenerationReviewState;
  sourceConversationId?: string;
  sourceParentCommitHash?: string;
  yopsDraftSent?: boolean;
}) {
  return (
    <div role="tabpanel">
      {renderWorkspaceTab(activeTab, candidate, {
        branchOptions,
        candidateExtracted,
        continuationBusy,
        extractingCandidate,
        flowError,
        onChatSourceEvidenceChange,
        onContinueFromCommit,
        onExtractCandidate,
        onGenerateProposal,
        onProposalAction,
        onProposalPostureChange,
        onSendToYOps,
        onVerifyProposal,
        onSourceMaterialUploaded,
        onSourceArtifactChange,
        onYOpsApplied,
        onYOpsCommitted,
        onYOpsScriptSave,
        onViewCommitInState,
        onWorkflowTabChange,
        sendingToYOps,
        proposalGeneration,
        proposalGenerationBusy,
        proposalPosture,
        proposalReviewState,
        sourceConversationId,
        sourceParentCommitHash,
        yopsDraftSent,
      })}
    </div>
  );
}

interface RenderWorkspaceTabOptions {
  branchOptions?: string[];
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
  onGenerateProposal?: () => Promise<void> | void;
  onProposalAction?: (action: ProposalGenerationAction) => Promise<void> | void;
  onProposalPostureChange?: (posture: WorkspaceProposalPosture) => void;
  onSendToYOps?: () => Promise<void> | void;
  onVerifyProposal?: () => Promise<void> | void;
  onSourceMaterialUploaded?: () => Promise<void> | void;
  onSourceArtifactChange?: (artifact: WorkspaceSourceArtifact | undefined) => void;
  onYOpsApplied?: (remainingSchemaGapCount: number) => void;
  onYOpsCommitted?: (commitHash: string, branch: string, workspace: WorkspaceCandidate) => void;
  onYOpsScriptSave?: (workspace: WorkspaceCandidate) => Promise<void> | void;
  onViewCommitInState?: (commitHash: string, branch: string) => void;
  onWorkflowTabChange?: (tab: WorkspaceTabId) => void;
  sendingToYOps?: boolean;
  proposalGeneration?: WorkspaceProposalGenerationView;
  proposalGenerationBusy?: boolean;
  proposalPosture?: WorkspaceProposalPosture;
  proposalReviewState?: ProposalGenerationReviewState;
  sourceConversationId?: string;
  sourceParentCommitHash?: string;
  yopsDraftSent?: boolean;
}

function renderWorkspaceTab(
  activeTab: WorkspaceTabId,
  candidate: WorkspaceCandidate,
  options: RenderWorkspaceTabOptions
) {
  return (
    <>
      {activeTab === 'chat' ? (
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
          onSourceArtifactChange={options.onSourceArtifactChange}
        />
      ) : null}
      {candidate.sourceArtifact ? (
        <SourceTransitionTab
          active={activeTab !== 'chat'}
          candidate={candidate}
          key={`${candidate.id}:${candidate.revision ?? 'unsaved'}:${JSON.stringify(candidate.sourceArtifact)}`}
          onViewChange={options.onWorkflowTabChange}
          view={activeTab === 'chat' ? 'ops' : activeTab}
        />
      ) : (
        <YOpsDraftTab
          active={activeTab !== 'chat'}
          branchOptions={options.branchOptions}
          candidate={candidate}
          continuationBusy={options.continuationBusy}
          flowError={options.flowError}
          onContinueFromCommit={options.onContinueFromCommit}
          onGenerateProposal={options.onGenerateProposal}
          onProposalAction={options.onProposalAction}
          onProposalPostureChange={options.onProposalPostureChange}
          onSendToYOps={options.onSendToYOps}
          onVerifyProposal={options.onVerifyProposal}
          onApplied={options.onYOpsApplied}
          onCommitted={options.onYOpsCommitted}
          onYOpsScriptSave={options.onYOpsScriptSave}
          onViewCommitInState={options.onViewCommitInState}
          sendingToYOps={options.sendingToYOps}
          proposalGeneration={options.proposalGeneration}
          proposalGenerationBusy={options.proposalGenerationBusy}
          proposalPosture={options.proposalPosture}
          proposalReviewState={options.proposalReviewState}
          onViewChange={options.onWorkflowTabChange}
          view={activeTab === 'chat' ? 'ops' : activeTab}
          yopsDraftSent={options.yopsDraftSent}
        />
      )}
    </>
  );
}
