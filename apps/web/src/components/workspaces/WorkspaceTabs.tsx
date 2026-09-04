import {
  useWorkspaceComposeReviewController,
  type WorkspaceDraftCommandName,
  type WorkspacePreparationOptions,
} from '@/hooks/workspaces/useWorkspaceComposeReviewController';
import type {
  SourceBundleItem,
  WorkspaceCandidate,
  WorkspaceProposalGenerationView,
  WorkspaceProposalPosture,
  WorkspaceSourceArtifact,
} from '@/types/workspaces';
import type {
  ProposalGenerationAction,
  ProposalGenerationReviewState,
} from './ProposalGenerationReviewView';
import { WorkspaceComposeReviewSurface } from './WorkspaceComposeReviewSurface';

type WorkspaceSurfaceMode = 'compose' | 'review';

export type WorkspaceTabId = 'chat' | 'ops' | 'validation' | 'preview' | 'commit';

export interface WorkspaceTabsProps {
  activeTab: WorkspaceTabId;
  branchOptions?: string[];
  candidate: WorkspaceCandidate;
  candidateExtracted?: boolean;
  continuationBusy?: boolean;
  extractingCandidate?: boolean;
  flowError?: string;
  onChatSourceEvidenceChange?: (sourceId: string, source: SourceBundleItem | null) => void;
  onApplyAfterRefresh?: (workspace: WorkspaceCandidate) => Promise<WorkspaceCandidate>;
  onContinueFromCommit?: (
    commitHash: string,
    targetBranch: string,
    createBranchFrom?: string
  ) => Promise<void> | void;
  onDraftCommand?: (
    workspace: WorkspaceCandidate,
    command: WorkspaceDraftCommandName
  ) => Promise<WorkspaceCandidate>;
  onExtractCandidate?: (options?: WorkspacePreparationOptions) => Promise<void> | void;
  onGenerateProposal?: (options?: WorkspacePreparationOptions) => Promise<void> | void;
  onPrepareDraft?: (
    workspace: WorkspaceCandidate,
    options: WorkspacePreparationOptions
  ) => Promise<WorkspaceCandidate>;
  onScenarioArchive?: () => Promise<void>;
  onScenarioCreate?: (name: string, duplicate: boolean) => Promise<void>;
  onScenarioRename?: (name: string) => Promise<void>;
  onScenarioSelect?: (workspaceId: string) => void;
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
  onWorkspaceBranchChange?: (branch: string) => Promise<void> | void;
  sendingToYOps?: boolean;
  proposalGeneration?: WorkspaceProposalGenerationView;
  proposalGenerationBusy?: boolean;
  proposalPosture?: WorkspaceProposalPosture;
  proposalReviewState?: ProposalGenerationReviewState;
  scenarioOptions?: WorkspaceCandidate[];
  sourceConversationId?: string;
  sourceParentCommitHash?: string;
  yopsDraftSent?: boolean;
}

export function WorkspaceTabs(props: WorkspaceTabsProps) {
  const mode = getWorkspaceSurface(props.activeTab);
  const controller = useWorkspaceComposeReviewController({
    candidate: props.candidate,
    flowError: props.flowError,
    onApplyAfterRefresh: props.onApplyAfterRefresh,
    onChatSourceEvidenceChange: props.onChatSourceEvidenceChange,
    onDraftCommand: props.onDraftCommand,
    onPrepareDraft: props.onPrepareDraft,
    onScenarioArchive: props.onScenarioArchive,
    onScenarioCreate: props.onScenarioCreate,
    onScenarioRename: props.onScenarioRename,
    onScenarioSelect: props.onScenarioSelect,
    onSourceMaterialUploaded: props.onSourceMaterialUploaded,
    onViewCommitInState: props.onViewCommitInState,
    onYOpsCommitted: props.onYOpsCommitted,
    sourceConversationId: props.sourceConversationId,
    sourceParentCommitHash: props.sourceParentCommitHash,
    scenarioOptions: props.scenarioOptions,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col" role="tabpanel">
      <WorkspaceComposeReviewSurface
        branchOptions={props.branchOptions}
        candidate={props.candidate}
        controller={controller}
        mode={mode}
        onBranchChange={props.onWorkspaceBranchChange}
        onModeChange={(nextMode) =>
          props.onWorkflowTabChange?.(nextMode === 'compose' ? 'chat' : 'validation')
        }
      />
    </div>
  );
}

function getWorkspaceSurface(tab: WorkspaceTabId): WorkspaceSurfaceMode {
  return tab === 'chat' || tab === 'ops' ? 'compose' : 'review';
}
