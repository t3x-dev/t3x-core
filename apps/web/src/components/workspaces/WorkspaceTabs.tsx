import Link from 'next/link';
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
import { PostCommitActions } from './YOpsDraftTab';

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
    <div className="flex min-h-0 flex-1 flex-col overflow-auto" role="tabpanel">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-4 py-2 text-sm">
        <h2 className="font-semibold">{props.candidate.title}</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
          {props.candidate.baseCommitHash ? (
            <span>
              Based on {props.candidate.baseCommitHash.replace(/^sha256:/, '').slice(0, 12)}
            </span>
          ) : null}
          <span>Next commit to {props.candidate.targetBranch ?? 'main'}</span>
          {props.candidate.schemaBindings.length > 0 ? (
            <Link
              href={`/project/${encodeURIComponent(props.candidate.projectId)}?tab=schemas&schemaView=active&workspace=${encodeURIComponent(props.candidate.id)}`}
            >
              View definition
            </Link>
          ) : null}
        </div>
      </header>
      <WorkspaceComposeReviewSurface
        scenarioOptions={props.scenarioOptions}
        onScenarioSelect={props.onScenarioSelect}
        branchOptions={props.branchOptions}
        candidate={props.candidate}
        controller={controller}
        mode={mode}
        onBranchChange={props.onWorkspaceBranchChange}
        onModeChange={(nextMode) =>
          props.onWorkflowTabChange?.(nextMode === 'compose' ? 'chat' : 'validation')
        }
      />
      {props.candidate.lastCommitHash ? (
        <div className="shrink-0 px-4 pb-4">
          <PostCommitActions
            branchOptions={props.branchOptions ?? []}
            busy={props.continuationBusy ?? false}
            commitHash={props.candidate.lastCommitHash}
            onContinueFromCommit={props.onContinueFromCommit}
            onViewCommitInState={props.onViewCommitInState}
            targetBranch={props.candidate.targetBranch ?? 'main'}
          />
        </div>
      ) : null}
    </div>
  );
}

function getWorkspaceSurface(tab: WorkspaceTabId): WorkspaceSurfaceMode {
  return tab === 'chat' || tab === 'ops' ? 'compose' : 'review';
}
