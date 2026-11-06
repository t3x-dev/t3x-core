import {
  type PublishWorkspaceAuthoringInput,
  type SchemaPreparationTarget,
  T3xApiError,
} from '@t3x-dev/api-client';
import type { SemanticContent } from '@t3x-dev/core';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  Box as BoxIcon,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Copy,
  ExternalLink,
  FileCode2,
  FileText,
  FileUp,
  Folder,
  FolderPlus,
  GitBranch,
  Globe2,
  Hash,
  Layers,
  ListTree,
  MessageSquare,
  Minus,
  MoreHorizontal,
  PanelLeftOpen,
  PanelRightOpen,
  Pencil,
  Percent,
  Pin,
  Plus,
  Settings,
  Share2,
  Sparkles,
  SquarePen,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import NextLink from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ChangeEvent, CSSProperties, FormEvent, RefObject } from 'react';
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { WorkspaceChecksRedirect } from '@/components/checks/WorkspaceChecksRedirect';
import { DOCUMENT_SOURCE_ACCEPTED_TYPES } from '@/components/import/documentAcceptTypes';
import { balancedRailWidth } from '@/components/project/repositoryWorkbenchLayout';
import { StateBranchControls } from '@/components/project/StateBranchControls';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import { SchemaContentPreparationDialog } from '@/components/schemas/SchemaContentPreparationDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ComposeDraftChangeRow } from '@/components/workspaces/ComposeDraftChangeRow';
import { OutputTargetsTab } from '@/components/workspaces/OutputTargetsTab';
import { SourceArtifactRoleEditor } from '@/components/workspaces/SourceArtifactRoleEditor';
import { SourceTransitionTab } from '@/components/workspaces/SourceTransitionTab';
import { WorkspaceNotice } from '@/components/workspaces/WorkspaceNotice';
import { WorkspaceReconciliationResolver } from '@/components/workspaces/WorkspaceReconciliationResolver';
import type { WorkspaceYOpsFlowView } from '@/components/workspaces/YOpsDraftTab';
import { getSchemaRegistryPreview } from '@/data/schemaReleases';
import {
  activityOperation,
  type ComposeActivityMeta,
  type ComposeActivitySelection,
  composeEventCards,
  groupComposeActivity,
} from '@/domain/composeActivity';
import { buildStateYamlReview } from '@/domain/diff/stateYamlReview';
import {
  buildStructuredStateDiff,
  type StructuredDiffChange,
  type StructuredDiffKind,
} from '@/domain/diff/structuredStateDiff';
import { checksHref, checksReturnTo } from '@/domain/project/checks';
import {
  buildCanonicalStateYaml,
  buildStatePointRows,
  type StatePointRow,
  workspaceDraftOperationsToStateOperations,
} from '@/domain/project/stateViewModel';
import { mergePublishedSchemaVersions } from '@/domain/schemas/publishedSchemaVersions';
import { repositoryConversationSourceHref } from '@/domain/sourceEvidenceNavigation';
import {
  authoringSemanticPath,
  buildAuthoringReviewProjection,
} from '@/domain/workspaces/authoringReview';
import { EMPTY_WORKSPACE_REVIEW } from '@/domain/workspaces/changeDecision';
import { composeDraftChangeCards } from '@/domain/workspaces/composeDraftChanges';
import { composeValuesEqual } from '@/domain/workspaces/composeObjectChanges';
import { type DraftYOp, nextAuthoringRequestId } from '@/domain/workspaces/draftStructure';
import {
  assertStagedEditsCurrent,
  MANUAL_STAGING_EVENT_ID,
  type ManualStagingControls,
  type StagedManualCard,
  selectedStagedItems,
  stageDraftOps,
  stagedManualReason,
  stagedObjectGroups,
  UNGROUPED_MANUAL_HINT,
} from '@/domain/workspaces/manualStaging';
import { workspaceReviewHref } from '@/domain/workspaces/reviewNavigation';
import {
  DEFAULT_WORKSPACE_SCHEMA_CHOICE_ID,
  hasUnappliedSchemaEdit,
  listWorkspaceSchemaChoices,
  workspaceSchemaChoiceId,
} from '@/domain/workspaces/schemaBindings';
import { useAssistantSchemaSettings } from '@/hooks/schemas/useAssistantSchemaSettings';
import { useProjectYSchemaVersions } from '@/hooks/schemas/useProjectYSchemaVersions';
import { useStudioSchemaEditCandidate } from '@/hooks/schemas/useStudioSchemaEditCandidate';
import { useViewPreference } from '@/hooks/shared/useViewPreference';
import { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';
import { useWorkspaceAuthoringBootstrap } from '@/hooks/workspaces/useWorkspaceAuthoringBootstrap';
import {
  REVIEW_DRAFT_CHANGED,
  type WorkspaceComposeReviewController,
} from '@/hooks/workspaces/useWorkspaceComposeReviewController';
import { useWorkspaceConversations } from '@/hooks/workspaces/useWorkspaceConversations';
import { useWorkspaceSchemaEditingRequests } from '@/hooks/workspaces/useWorkspaceSchemaEditingRequests';
import { validateWorkspaceCandidateYOps } from '@/hooks/workspaces/useWorkspaceYOps';
import { useChatStore } from '@/store/chatStore';
import type { ApiCommit, Conversation } from '@/types/api';
import type {
  SourceBundleItem,
  WorkspaceCandidate,
  WorkspaceSchemaCandidateField,
  WorkspaceYOpsDraftOperation,
} from '@/types/workspaces';
import type { WorkspaceYOpsValue } from '@/types/workspaceYops';
import { cn } from '@/utils/cn';
import {
  AssistantSchemaSettingsDetails,
  AssistantSchemaSettingsTimeline,
} from './AssistantSchemaSettingsCard';
import { ComposeActivityChangeRow } from './ComposeActivityChangeRow';
import {
  ComposeActivityTimeline,
  type ComposeSchemaTimelineEvent,
} from './ComposeActivityTimeline';
import { ComposeAuthoringAssistant } from './ComposeAuthoringAssistant';
import { ComposeFieldDialog } from './ComposeFieldDialog';
import { ComposeNodeHistoryPanel } from './ComposeNodeHistoryPanel';
import { useWorkspaceContentNavigation } from './useWorkspaceContentNavigation';
import { type PublishedTurnChanges, WorkspaceTurnChanges } from './WorkspaceAssistantActivity';
import {
  type CommitChangeInspection,
  WorkspaceCommitChangeDetails,
} from './WorkspaceCommitChangeDetails';
import { WorkspaceCommitGraph } from './WorkspaceCommitGraph';
import { WorkspaceCommitHistoryPanel } from './WorkspaceCommitHistoryPanel';
import composeStyles from './WorkspaceComposeSurface.module.css';
import { WorkspaceCurrentDraft } from './WorkspaceCurrentDraft';
import { WorkspacePendingSchemaReview } from './WorkspacePendingSchemaReview';
import checksStyles from './WorkspaceReviewChecks.module.css';
import { WorkspaceReviewCodeView } from './WorkspaceReviewCodeView';
import diffStyles from './WorkspaceReviewDiff.module.css';
import {
  WorkspaceReviewBaseline,
  WorkspaceReviewContentPreview,
  WorkspaceReviewSchemaView,
  WorkspaceReviewYaml,
} from './WorkspaceReviewDocuments';
import reviewStyles from './WorkspaceReviewReference.module.css';
import {
  useWorkspaceReviewSubject,
  WorkspaceReviewWorkbench,
  workspaceReviewSubjectChanges,
} from './WorkspaceReviewWorkbench';
import workbenchStyles from './WorkspaceReviewWorkbench.module.css';
import { WorkspaceSchemaDiagnostics } from './WorkspaceSchemaDiagnostics';
import stageHeaderStyles from './WorkspaceStageHeader.module.css';
import { WorkspaceStageNavigation } from './WorkspaceStageNavigation';

type WorkspaceSurfaceMode = 'compose' | 'review';
type ReviewPane = 'rendered' | 'changes' | 'yaml' | 'checks';
type WorkspaceTool = 'source' | 'edit' | 'delivery';
type ReviewCheckStatus = 'failed' | 'passed' | 'pending';
type ComposeChangeFilter = 'all' | 'modified' | 'added' | 'attention';
const CONVERSATION_WIDTH_KEY = 't3x-compose-balanced-conversation-width';
const DISCUSSION_WIDTH_KEY = 't3x-compose-balanced-inspector-width';
const WORKSPACE_MODES = ['compose', 'review'] as const;
const REVIEW_VIEWS = ['changes', 'rendered', 'yaml'] as const;
const CHANGE_SCOPES = ['latest', 'all'] as const;

function parseReviewPane(value: string | null): ReviewPane {
  return value === 'rendered' || value === 'yaml' || value === 'checks' ? value : 'changes';
}

function parseWorkspaceTool(value: string | null): WorkspaceTool | null {
  return value === 'source' || value === 'edit' || value === 'delivery' ? value : null;
}

function parseWorkspaceSurfaceMode(
  modeValue: string | null,
  paneValue: string | null
): WorkspaceSurfaceMode | null {
  if (modeValue === 'compose' || modeValue === 'review') return modeValue;
  if (
    paneValue === 'rendered' ||
    paneValue === 'changes' ||
    paneValue === 'yaml' ||
    paneValue === 'checks' ||
    paneValue === 'source' ||
    paneValue === 'edit' ||
    paneValue === 'delivery' ||
    paneValue === 'validation'
  )
    return 'review';
  return null;
}

interface WorkspaceComposeReviewSurfaceProps {
  branchOptions?: string[];
  candidate: WorkspaceCandidate;
  controller: WorkspaceComposeReviewController;
  mode: WorkspaceSurfaceMode;
  onBranchChange?: (
    branch: string,
    requestNavigation?: (navigate: () => void) => void
  ) => Promise<void> | void;
  onCreateBranch?: (
    name: string,
    fromBranch: string,
    requestNavigation?: (navigate: () => void) => void
  ) => Promise<void>;
  onModeChange: (mode: WorkspaceSurfaceMode) => void;
}

export function WorkspaceComposeReviewSurface({
  branchOptions = [],
  candidate,
  controller,
  mode,
  onBranchChange,
  onCreateBranch,
  onModeChange,
}: WorkspaceComposeReviewSurfaceProps) {
  const composeControls = useRef<ComposeSurfaceControls | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeQuery = searchParams.toString();
  const routeParams = new URLSearchParams(routeQuery);
  const preferenceKey = `t3x.workspace-view:${candidate.projectId}:${candidate.id}`;
  const [preferredMode, rememberMode, modeReady] = useViewPreference(
    `${preferenceKey}:mode`,
    WORKSPACE_MODES,
    'compose'
  );
  const [preferredReviewPane, rememberReviewPane, paneReady] = useViewPreference(
    `${preferenceKey}:review`,
    REVIEW_VIEWS,
    'changes'
  );
  const requestedTool =
    parseWorkspaceTool(routeParams.get('workspaceTool')) ??
    parseWorkspaceTool(routeParams.get('reviewPane'));
  const legacyContentEdit = requestedTool === 'edit';
  const workspaceTool = legacyContentEdit ? null : requestedTool;
  const toolReturnTo =
    workspaceTool === 'delivery'
      ? checksReturnTo(routeParams.get('returnTo'), candidate.projectId, pathname)
      : null;
  const lastSyncedRouteQueryRef = useRef<string | null>(null);
  const [reviewPane, setReviewPaneState] = useState<ReviewPane>(() =>
    parseReviewPane(new URLSearchParams(routeQuery).get('reviewPane'))
  );
  const authoringBootstrap = useWorkspaceAuthoringBootstrap(
    controller.candidate,
    controller.ensureSaved
  );
  // Compose publication and Review must observe the same current Draft projection.
  const activity = useComposeActivity(controller.candidate, authoringBootstrap.active);
  const syncRequired = (activity.newActivity ?? activity.view)?.synchronization?.required;

  const writeWorkspaceSurfaceUrl = useCallback(
    (nextMode: WorkspaceSurfaceMode, nextPane?: ReviewPane) => {
      const params = new URLSearchParams(routeQuery);
      params.delete('workspaceTool');
      params.delete('returnTo');
      if (nextMode === 'review') {
        params.set('workspaceMode', 'review');
        if (nextPane && nextPane !== 'changes') {
          params.set('reviewPane', nextPane);
        } else {
          params.delete('reviewPane');
        }
      } else {
        params.set('workspaceMode', 'compose');
        params.delete('reviewPane');
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, routeQuery, router]
  );

  const setSurfaceMode = useCallback(
    (nextMode: WorkspaceSurfaceMode) => {
      rememberMode(nextMode);
      writeWorkspaceSurfaceUrl(nextMode, reviewPane);
      onModeChange(nextMode);
    },
    [onModeChange, rememberMode, reviewPane, writeWorkspaceSurfaceUrl]
  );

  const setReviewPane = useCallback(
    (nextPane: ReviewPane) => {
      if (nextPane === 'checks') {
        const source = new URLSearchParams(routeQuery);
        source.set('workspaceMode', 'review');
        source.delete('workspaceTool');
        if (reviewPane !== 'changes') source.set('reviewPane', reviewPane);
        else source.delete('reviewPane');
        const snapshotId = controller.review?.reviewSnapshot?.snapshotId;
        router.push(
          checksHref(candidate.projectId, {
            recordId: snapshotId ? `review:${snapshotId}` : undefined,
            workspace: snapshotId ? undefined : candidate.id,
            returnTo: `${pathname}?${source}`,
          })
        );
        return;
      }
      rememberReviewPane(nextPane);
      setReviewPaneState(nextPane);
      writeWorkspaceSurfaceUrl('review', nextPane);
    },
    [
      writeWorkspaceSurfaceUrl,
      routeQuery,
      controller.review?.reviewSnapshot?.snapshotId,
      router,
      candidate.projectId,
      candidate.id,
      pathname,
      reviewPane,
      rememberReviewPane,
    ]
  );

  useEffect(() => {
    if (!modeReady || !paneReady) return;
    const routeKey = `${preferenceKey}:${routeQuery}`;
    if (lastSyncedRouteQueryRef.current === routeKey) return;
    lastSyncedRouteQueryRef.current = routeKey;
    const params = new URLSearchParams(routeQuery);
    const rawPane = params.get('reviewPane');
    if (legacyContentEdit) {
      rememberMode('compose');
      writeWorkspaceSurfaceUrl('compose');
      if (mode !== 'compose') onModeChange('compose');
      return;
    }
    const legacyTool = parseWorkspaceTool(rawPane);
    if (legacyTool) {
      params.set('workspaceTool', legacyTool);
      params.delete('reviewPane');
      params.set('workspaceMode', legacyTool === 'delivery' ? 'review' : 'compose');
      router.replace(`${pathname}?${params}`, { scroll: false });
      if (legacyTool !== 'delivery' && mode !== 'compose') onModeChange('compose');
      return;
    }
    setReviewPaneState(rawPane ? parseReviewPane(rawPane) : preferredReviewPane);
    const routeMode =
      parseWorkspaceSurfaceMode(params.get('workspaceMode'), rawPane) ?? preferredMode;
    if (routeMode !== mode) onModeChange(routeMode);
    if (rawPane === 'validation') {
      writeWorkspaceSurfaceUrl('review', 'changes');
    }
  }, [
    mode,
    legacyContentEdit,
    onModeChange,
    pathname,
    routeQuery,
    router,
    writeWorkspaceSurfaceUrl,
    modeReady,
    paneReady,
    preferenceKey,
    preferredMode,
    preferredReviewPane,
    rememberMode,
  ]);

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface-card)] text-[var(--text-primary)]',
        composeStyles.workspaceTheme
      )}
    >
      <div className={composeStyles.workspaceBody}>
        <div
          className={cn(
            composeStyles.workspaceContent,
            mode === 'review' && reviewStyles.workspace
          )}
        >
          <WorkspaceStageHeader
            branchOptions={branchOptions}
            candidate={controller.candidate ?? candidate}
            mode={
              workspaceTool === 'delivery'
                ? undefined
                : workspaceTool || legacyContentEdit
                  ? 'compose'
                  : mode
            }
            onBranchChange={onBranchChange}
            onCreateBranch={onCreateBranch}
            onModeChange={setSurfaceMode}
            requestNavigation={(navigate) => {
              if (composeControls.current) composeControls.current.requestNavigation(navigate);
              else navigate();
            }}
            onEditDraft={
              !workspaceTool && mode === 'compose'
                ? () => composeControls.current?.editDraft()
                : undefined
            }
          />
          {syncRequired ? (
            <WorkspaceNotice
              label="Workspace synchronization"
              title={
                activity.reconciliationPreview?.conflicts.length
                  ? 'Branch changes overlap with your Draft'
                  : 'The branch has new commits'
              }
              actions={
                activity.reconciliationPreview ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={activity.reconciliationDeciding}
                      onClick={() => void activity.decideReconciliation('cancel')}
                    >
                      Not now
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={activity.reconciliationDeciding}
                      onClick={() => void activity.decideReconciliation('discard')}
                    >
                      Discard my edits
                    </Button>
                    <Button
                      size="sm"
                      disabled={
                        activity.reconciliationDeciding ||
                        activity.reconciliationPreview.conflicts.length > 0
                      }
                      onClick={() => void activity.decideReconciliation('adopt')}
                    >
                      Keep my edits and sync
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={activity.reconciling}
                    onClick={() => void activity.prepareReconciliation()}
                  >
                    {activity.reconciling ? 'Preparing…' : 'Preview branch changes'}
                  </Button>
                )
              }
            >
              {activity.reconciliationPreview ? (
                <>
                  <p>
                    Base {activity.reconciliationPreview.baseHead?.slice(0, 14) ?? 'empty'} → branch{' '}
                    {activity.reconciliationPreview.currentRefHead?.slice(0, 14) ?? 'empty'}. The
                    preview is bound to Workspace revision{' '}
                    {activity.reconciliationPreview.workspaceRevision}.
                  </p>
                  {activity.reconciliationPreview.conflicts.length ? (
                    <div>
                      <p>
                        Structured resolution is required before your edits can be adopted. You can
                        keep the Draft for resolution or discard it explicitly.
                      </p>
                      <WorkspaceReconciliationResolver
                        key={activity.reconciliationPreview.preparationDigest}
                        preparation={activity.reconciliationPreview}
                        disabled={activity.reconciliationDeciding}
                        onResolve={(resolutions) =>
                          void activity.decideReconciliation('resolve', resolutions)
                        }
                      />
                    </div>
                  ) : (
                    <p>
                      No overlapping changes were found. Review the choice, then keep your edits or
                      discard them.
                    </p>
                  )}
                </>
              ) : (
                <p>
                  Preview Base, your Draft and the latest branch before choosing. Nothing is changed
                  automatically.
                </p>
              )}
              {activity.reconciliationError ? (
                <p role="alert">{activity.reconciliationError}</p>
              ) : null}
            </WorkspaceNotice>
          ) : null}
          {workspaceTool ? (
            <>
              <div className={reviewStyles.toolHeading}>
                <button
                  type="button"
                  onClick={() =>
                    toolReturnTo
                      ? router.push(toolReturnTo)
                      : setSurfaceMode(workspaceTool === 'delivery' ? mode : 'compose')
                  }
                >
                  <ArrowLeft aria-hidden="true" /> Back to{' '}
                  {toolReturnTo
                    ? 'Review snapshot'
                    : workspaceTool === 'delivery' && mode === 'review'
                      ? 'Review'
                      : 'Compose'}
                </button>
                <h1>{workspaceTool === 'delivery' ? 'Delivery' : 'Source configuration'}</h1>
                <p>
                  {workspaceTool === 'delivery'
                    ? 'Download committed State and inspect delivery history.'
                    : 'Prepare a change in Compose, then review its exact result before deciding.'}
                </p>
              </div>
              {workspaceTool === 'source' ? (
                <WorkspaceSourceTools key={candidate.id} controller={controller} />
              ) : (
                <div className={reviewStyles.toolBody}>
                  <OutputTargetsTab candidate={controller.candidate} />
                </div>
              )}
            </>
          ) : null}
          {!workspaceTool && !legacyContentEdit && mode === 'review' ? (
            <ReviewSurface
              key={`${candidate.projectId}:${candidate.id}`}
              activity={activity}
              compareScenarioId=""
              controller={controller}
              pane={reviewPane}
              setPane={setReviewPane}
              onModeChange={setSurfaceMode}
            />
          ) : null}
          {mode === 'compose' || legacyContentEdit ? (
            <ComposeSurface
              key={`${candidate.projectId}:${candidate.id}`}
              activity={activity}
              authoringBootstrap={authoringBootstrap}
              controlsRef={composeControls}
              candidate={controller.candidate ?? candidate}
              controller={controller}
              hidden={Boolean(workspaceTool)}
              openContentEditor={legacyContentEdit}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function WorkspaceSchemaSelect({
  candidate,
  controller,
  unbound,
  requestNavigation,
}: {
  candidate: WorkspaceCandidate;
  controller: WorkspaceComposeReviewController;
  unbound?: boolean;
  requestNavigation?: (navigate: () => void) => void;
}) {
  const published = useProjectYSchemaVersions(candidate.projectId);
  const choices = useMemo(() => {
    const registry = mergePublishedSchemaVersions(
      getSchemaRegistryPreview(candidate.projectId),
      published.versions,
      candidate.projectId
    );
    return listWorkspaceSchemaChoices(
      registry.families.flatMap((family) => family.releases),
      candidate.schemaBindings[0]
    );
  }, [candidate.projectId, candidate.schemaBindings, published.versions]);
  const selectedId = unbound
    ? ''
    : candidate.schemaBindings[0]
      ? workspaceSchemaChoiceId(candidate.schemaBindings[0])
      : DEFAULT_WORKSPACE_SCHEMA_CHOICE_ID;

  return (
    <select
      aria-label="Workspace schema"
      className="w-full min-w-0 truncate rounded border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2 py-1.5 text-xs text-[var(--text-secondary)]"
      title={choices.find((choice) => choice.id === selectedId)?.label}
      disabled={controller.isBusy || !controller.bindSchema}
      onChange={(event) => {
        const choice = choices.find((item) => item.id === event.target.value);
        if (choice) {
          const bind = () => void controller.bindSchema(choice.binding);
          if (requestNavigation) requestNavigation(bind);
          else bind();
        }
      }}
      value={selectedId}
    >
      {unbound ? (
        <option value="" disabled>
          Choose a Schema
        </option>
      ) : null}
      {choices.map((choice) => (
        <option key={choice.id} value={choice.id}>
          {choice.label}
        </option>
      ))}
    </select>
  );
}

function WorkspaceStageHeader({
  branchOptions,
  candidate,
  mode,
  onBranchChange,
  onCreateBranch,
  onModeChange,
  requestNavigation,
  onEditDraft,
}: {
  branchOptions: string[];
  candidate: WorkspaceCandidate;
  mode?: WorkspaceSurfaceMode;
  onBranchChange?: (
    branch: string,
    requestNavigation?: (navigate: () => void) => void
  ) => Promise<void> | void;
  onCreateBranch?: (
    name: string,
    fromBranch: string,
    requestNavigation?: (navigate: () => void) => void
  ) => Promise<void>;
  onModeChange: (mode: WorkspaceSurfaceMode) => void;
  requestNavigation?: (navigate: () => void) => void;
  onEditDraft?: () => void;
}) {
  const selectedBranch = candidate.targetBranch || 'main';
  const availableBranches = Array.from(
    new Set([selectedBranch, ...branchOptions.map((branch) => branch.trim()).filter(Boolean)])
  );

  return (
    <header className={stageHeaderStyles.header}>
      {
        <div className={stageHeaderStyles.identity}>
          <BoxIcon aria-hidden="true" />
          <span title={candidate.title}>{candidate.title}</span>
        </div>
      }
      <div className={stageHeaderStyles.branch}>
        <StateBranchControls
          key={`${candidate.projectId}:${candidate.id}:${selectedBranch}`}
          branch={selectedBranch}
          branchOptions={availableBranches}
          disabled={!onBranchChange}
          headCommitHash={null}
          onBranchChange={(branch) => {
            const navigate = () => void onBranchChange?.(branch, requestNavigation);
            if (requestNavigation) requestNavigation(navigate);
            else navigate();
          }}
          onCreateBranch={
            onCreateBranch
              ? (name, fromBranch) => onCreateBranch(name, fromBranch, requestNavigation)
              : undefined
          }
          requestCreateNavigation={requestNavigation}
          showCreate={false}
        />
      </div>
      <WorkspaceStageNavigation
        mode={mode}
        onModeChange={(nextMode) => {
          const navigate = () => onModeChange(nextMode);
          if (requestNavigation) requestNavigation(navigate);
          else navigate();
        }}
      />
      <div className={stageHeaderStyles.meta}>
        <WorkspaceToolsMenu candidate={candidate} onEditDraft={onEditDraft} />
      </div>
    </header>
  );
}

function WorkspaceToolsMenu({
  candidate,
  onEditDraft,
}: {
  candidate: WorkspaceCandidate;
  onEditDraft?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openTool = (tool: WorkspaceTool) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('workspaceTool', tool);
    if (tool !== 'delivery') {
      params.set('workspaceMode', 'compose');
      params.delete('reviewPane');
    }
    router.push(`${pathname}?${params}`, { scroll: false });
  };
  const hasYamlSource = candidate.sourceBundle.some(
    (source) =>
      source.materialId && (source.format === 'yaml' || /\.ya?ml$/i.test(source.fileName ?? ''))
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={stageHeaderStyles.chatToggle} type="button">
          Advanced tools <ChevronDown aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onEditDraft ? (
          <DropdownMenuItem onSelect={onEditDraft}>
            <Pencil aria-hidden="true" className="mr-2 size-4" /> Edit Draft
          </DropdownMenuItem>
        ) : null}
        {hasYamlSource ? (
          <>
            <DropdownMenuLabel>Compose tools</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => openTool('source')}>
              <FileCode2 aria-hidden="true" className="mr-2 size-4" /> Source configuration
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuLabel>Committed State</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => openTool('delivery')}>
          <Share2 aria-hidden="true" className="mr-2 size-4" /> Delivery
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ComposeSurfaceControls = {
  requestNavigation: (navigate: () => void) => void;
  editDraft: () => void;
};

function ComposeSurface({
  activity,
  authoringBootstrap,
  controlsRef,
  candidate,
  controller,
  hidden,
  openContentEditor,
}: {
  activity: ReturnType<typeof useComposeActivity>;
  authoringBootstrap: ReturnType<typeof useWorkspaceAuthoringBootstrap>;
  controlsRef: RefObject<ComposeSurfaceControls | null>;
  candidate: WorkspaceCandidate;
  controller: WorkspaceComposeReviewController;
  hidden: boolean;
  openContentEditor: boolean;
}) {
  const [fieldDialog, setFieldDialog] = useState<'structure' | 'yaml' | 'schema' | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef<{ x: number; width: number } | null>(null);
  const draftDragOrigin = useRef<{ x: number; width: number } | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [turn, setTurn] = useState<PublishedTurnChanges | null>(null);
  const [mobileChats, setMobileChats] = useState(false);
  const draftButton = useRef<HTMLButtonElement>(null);
  const closeDraftButton = useRef<HTMLButtonElement>(null);
  const [boardWidth, setBoardWidth] = useState(1440);
  const [customDraftWidth, setCustomDraftWidth] = useState<number | null>(null);
  const [customDiscussionWidth, setCustomDiscussionWidth] = useState<number | null>(null);
  const [collapsedPreference, setCollapsedPreference] = useState<boolean | null>(null);
  const [resizing, setResizing] = useState(false);
  const balancedDraftWidth = balancedRailWidth('navigation', boardWidth);
  const balancedDiscussionWidth = balancedRailWidth('inspector', boardWidth);
  const compact =
    inspectorOpen &&
    boardWidth > 840 &&
    boardWidth - balancedDraftWidth - balancedDiscussionWidth < 480;
  const draftCollapsed = collapsedPreference ?? compact;
  const draftWidth = Math.max(
    180,
    Math.min(customDraftWidth ?? balancedDraftWidth, boardWidth - (inspectorOpen ? 640 : 320))
  );
  const discussionWidth = Math.max(
    320,
    Math.min(
      customDiscussionWidth ?? balancedDiscussionWidth,
      boardWidth - (draftCollapsed ? 48 : draftWidth) - 320
    )
  );
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const measure = () => {
      if (board.clientWidth) setBoardWidth(board.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(DISCUSSION_WIDTH_KEY));
      if (stored >= 320 && stored <= 680) setCustomDiscussionWidth(stored);
      const draftStored = Number(localStorage.getItem(CONVERSATION_WIDTH_KEY));
      if (draftStored >= 180 && draftStored <= 560) setCustomDraftWidth(draftStored);
      if (localStorage.getItem('t3x-workspace-draft-collapsed') === 'true')
        setCollapsedPreference(true);
    } catch {
      /* Storage can be unavailable in private browser contexts. */
    }
  }, []);
  const toggleDraft = (collapsed: boolean) => {
    setCollapsedPreference(compact || collapsed ? collapsed : null);
    try {
      localStorage.setItem('t3x-workspace-draft-collapsed', String(collapsed));
    } catch {
      /* Collapsing still works without storage. */
    }
  };
  const resizeDiscussion = (width: number | null) => {
    const actualDraftWidth =
      boardRef.current?.querySelector<HTMLElement>('[aria-label="Workspace conversations"]')
        ?.offsetWidth || draftWidth;
    const maximum = Math.min(
      680,
      Math.max(320, (boardRef.current?.clientWidth || 1680) - actualDraftWidth - 320)
    );
    const next = width === null ? null : Math.round(Math.max(320, Math.min(maximum, width)));
    setCustomDiscussionWidth(next);
    try {
      if (next === null) localStorage.removeItem(DISCUSSION_WIDTH_KEY);
      else localStorage.setItem(DISCUSSION_WIDTH_KEY, String(next));
    } catch {
      /* Resizing still works without storage. */
    }
  };
  const resizeDraft = (width: number | null) => {
    const measuredDiscussionWidth = boardRef.current
      ?.querySelector('[data-compose-rail]')
      ?.getBoundingClientRect().width;
    const actualDiscussionWidth = measuredDiscussionWidth
      ? measuredDiscussionWidth + 16
      : inspectorOpen
        ? discussionWidth
        : 0;
    const maximum = Math.min(
      560,
      Math.max(180, (boardRef.current?.clientWidth || 1680) - actualDiscussionWidth - 320)
    );
    const next = width === null ? null : Math.round(Math.max(180, Math.min(maximum, width)));
    setCustomDraftWidth(next);
    try {
      if (next === null) localStorage.removeItem(CONVERSATION_WIDTH_KEY);
      else localStorage.setItem(CONVERSATION_WIDTH_KEY, String(next));
    } catch {
      /* Resizing still works without storage. */
    }
  };
  const preferenceKey = `t3x.workspace-view:${candidate.projectId}:${candidate.id}`;
  const [sidePanel, setSidePanel] = useState<'history' | 'chat'>('chat');
  const [focusSchemaPath, setFocusSchemaPath] = useState<string>();
  const [draftSubject, setDraftSubject] = useState<'content' | 'schema'>('content');
  const [rightView, setRightView] = useState<'changes' | 'structure' | 'history'>('changes');
  const [changeScope, setChangeScope] = useViewPreference(
    `${preferenceKey}:scope`,
    CHANGE_SCOPES,
    'latest'
  );
  const [commitSelection, setCommitSelection] = useState<{
    scope: string;
    commit: ApiCommit;
  } | null>(null);
  const commitScope = JSON.stringify([candidate.projectId, candidate.id, candidate.targetBranch]);
  const historicalCommit = commitSelection?.scope === commitScope ? commitSelection.commit : null;
  const [commitInspection, setCommitInspection] = useState<{
    scope: string;
    value: CommitChangeInspection;
  } | null>(null);
  const historicalInspection =
    commitInspection?.scope === commitScope &&
    commitInspection.value.commitDigest === historicalCommit?.hash
      ? commitInspection.value
      : null;
  useEffect(() => {
    setCommitSelection(null);
  }, [commitScope]);
  const [activitySelection, setActivitySelection] = useState<ComposeActivitySelection | null>(null);
  const [schemaSelection, setSchemaSelection] = useState<{
    workspaceId: string;
    settingsId: string;
  } | null>(null);
  const [structurePending, setStructurePending] = useState(false);
  const [schemaCandidateEpoch, setSchemaCandidateEpoch] = useState(0);
  const [schemaConversationId, setSchemaConversationId] = useState<string>();
  const [structureError, setStructureError] = useState<string | null>(null);
  const [staged, setStaged] = useState<StagedManualCard[]>([]);
  const stagedRef = useRef(staged);
  stagedRef.current = staged;
  const [dialogInput, setDialogInput] = useState(false);
  const [nodeInput, setNodeInput] = useState(false);
  const saveAttempt = useRef<{
    input: PublishWorkspaceAuthoringInput;
    cardIds: Set<string>;
  } | null>(null);
  const savingContent = useRef(false);
  const [saveRefreshError, setSaveRefreshError] = useState(false);
  const publishedCurrent = activity.view?.current;
  const workingCopy = useMemo(() => {
    if (publishedCurrent === undefined) return { document: undefined, error: null };
    try {
      return { document: assertStagedEditsCurrent(publishedCurrent, staged), error: null };
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : 'Could not apply local changes.';
      return { document: undefined, error: `Local preview unavailable. ${reason}` };
    }
  }, [publishedCurrent, staged]);
  const workingCurrent = workingCopy.document;
  const stageManualOps = useCallback(
    async (operations: DraftYOp[], reason: string) => {
      if (workingCurrent === undefined) {
        setStructureError(workingCopy.error ?? 'Draft activity is not ready');
        return false;
      }
      setStructureError(null);
      try {
        const next = stageDraftOps(workingCurrent, operations, reason);
        setStaged((current) => [...current, ...next.items]);
        setInspectorOpen(true);
        setTurn(null);
        setRightView('changes');
        setSidePanel('chat');
        setChangeScope('latest');
        return true;
      } catch (cause) {
        setStructureError(cause instanceof Error ? cause.message : 'Could not apply this change.');
        return false;
      }
    },
    [workingCurrent, workingCopy.error, setChangeScope]
  );
  const toggleStaged = useCallback((id: string) => {
    setStaged((current) =>
      current.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  }, []);
  const saveSelectedAsP = useCallback(async () => {
    if (savingContent.current || activity.awaitingPublishRefresh || saveRefreshError) return false;
    const selected = selectedStagedItems(staged);
    if (!saveAttempt.current && !selected.length) {
      setStructureError('Select at least one ungrouped change to save as a P.');
      return false;
    }
    savingContent.current = true;
    setStructurePending(true);
    setStructureError(null);
    try {
      if (!saveAttempt.current) {
        const view = activity.view;
        if (!view) throw new Error('Draft activity is not ready.');
        assertStagedEditsCurrent(publishedCurrent, selected);
        saveAttempt.current = {
          cardIds: new Set(selected.map((item) => item.id)),
          input: {
            request_id: nextAuthoringRequestId(),
            expected_workspace_revision: view.workspaceRevision,
            expected_revision: view.compositionRevision,
            expected_ref_head: view.basis.refHead,
            operations: selected.map((item) => item.operation),
            reason: stagedManualReason(selected),
          },
        };
      }
      const { input, cardIds } = saveAttempt.current;
      const outcome = await activity.publish(input);
      saveAttempt.current = null;
      setStaged((current) => current.filter((item) => !cardIds.has(item.id)));
      try {
        await controller.refreshFromServer(outcome.workspaceRevision);
      } catch {
        setSaveRefreshError(true);
      }
      return stagedRef.current.every((item) => cardIds.has(item.id));
    } catch (cause) {
      if (
        cause instanceof T3xApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 408
      ) {
        saveAttempt.current = null;
      }
      setStructureError(
        saveAttempt.current
          ? 'Save is not yet confirmed. Retry the original save before saving other changes.'
          : cause instanceof Error
            ? cause.message
            : 'Could not save the selected cards as a P.'
      );
      return false;
    } finally {
      savingContent.current = false;
      setStructurePending(false);
    }
  }, [activity, controller, staged, publishedCurrent, saveRefreshError]);
  const contentNavigation = useWorkspaceContentNavigation({
    dirty: staged.length > 0 || dialogInput || nodeInput,
    unapplied: dialogInput || nodeInput,
    busy: structurePending,
    retryOriginal: Boolean(saveAttempt.current),
    canSave:
      !activity.awaitingPublishRefresh &&
      !saveRefreshError &&
      (Boolean(saveAttempt.current) || staged.some((item) => item.selected)),
    error: structureError,
    save: saveSelectedAsP,
    discard: () => {
      setStaged([]);
      setFieldDialog(null);
      setActivitySelection(null);
      saveAttempt.current = null;
    },
  });
  const stagingControls = useMemo(
    () => ({
      items: staged,
      current: publishedCurrent,
      pending: structurePending,
      error: structureError,
      retryOriginal: Boolean(saveAttempt.current),
      blocked: activity.awaitingPublishRefresh || saveRefreshError,
      onToggle: toggleStaged,
      onSaveSelected: () => void saveSelectedAsP(),
    }),
    [
      activity.awaitingPublishRefresh,
      staged,
      publishedCurrent,
      structurePending,
      structureError,
      saveRefreshError,
      toggleStaged,
      saveSelectedAsP,
    ]
  );
  const openStructure = (view: 'structure' | 'yaml' | 'schema') => {
    setStructureError(null);
    setDraftSubject(view === 'schema' ? 'schema' : 'content');
    setFieldDialog(view);
    if (!activity.enabled) void authoringBootstrap.start();
  };
  useEffect(() => {
    if (authoringBootstrap.error) setFieldDialog(null);
  }, [authoringBootstrap.error]);
  useEffect(() => {
    setActivitySelection(null);
    setSchemaSelection(null);
    setStaged([]);
    setStructureError(null);
    setFieldDialog(null);
    setInspectorOpen(false);
    setMobileChats(false);
    setTurn(null);
    setDraftSubject('content');
    setFocusSchemaPath(undefined);
    setSidePanel('chat');
    setSchemaConversationId(undefined);
  }, [candidate.id]);
  const legacyEditorOpened = useRef(false);
  useEffect(() => {
    if (!openContentEditor) {
      legacyEditorOpened.current = false;
      return;
    }
    if (legacyEditorOpened.current) return;
    legacyEditorOpened.current = true;
    setDraftSubject('content');
    setFieldDialog('structure');
    if (!activity.enabled) void authoringBootstrap.start();
  }, [openContentEditor, activity.enabled, authoringBootstrap.start]);
  const selectActivity = useCallback(
    (selection: ComposeActivitySelection, panel: 'history' | 'chat' | 'preserve' = 'history') => {
      setActivitySelection(selection);
      if (panel !== 'preserve') {
        setRightView('changes');
        setSchemaSelection(null);
        setSidePanel(panel);
      }
    },
    []
  );
  const openHistoryAction = useCallback(
    (actionId: string, nodeId: string, path?: string) => {
      void activity.selectActionNode(actionId, nodeId, path).then((selection) => {
        if (!selection) return;
        setChangeScope('latest');
        selectActivity(selection, 'history');
      });
    },
    [activity.selectActionNode, selectActivity, setChangeScope]
  );
  const sourceConversation = candidate.sourceBundle.find(
    (source) =>
      source.type === 'chat' && source.title === 'Compose assistant' && source.conversationId
  );
  const sourceConversationId = sourceConversation?.conversationId;
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(
    sourceConversationId
  );
  const [activeConversationTitle, setActiveConversationTitle] = useState<string | undefined>(
    sourceConversation?.title
  );
  useEffect(() => {
    setActiveConversationId(sourceConversationId);
    setActiveConversationTitle(sourceConversation?.title);
  }, [candidate.id, sourceConversation?.title, sourceConversationId]);
  const schemaSettings = useAssistantSchemaSettings(
    candidate.projectId,
    candidate.id,
    schemaConversationId ?? activeConversationId,
    String(activity.view?.workspaceRevision ?? candidate.revision) + ':' + schemaCandidateEpoch
  );
  const selectedSchema =
    schemaSelection?.workspaceId === candidate.id
      ? (
          schemaSettings.record?.cards ?? (schemaSettings.record ? [schemaSettings.record] : [])
        ).find(
          (card) =>
            card.settingsId === schemaSelection.settingsId &&
            ['applied', 'generated'].includes(card.status)
        )
      : undefined;
  const sourceMaterialIds = controller.materialSources
    .filter((source) => source.included)
    .map((source) => source.materialId);
  const conversationsQuery = useWorkspaceConversations(candidate.projectId);
  const currentChatTitle =
    conversationsQuery.data?.conversations.find(
      (item) => item.conversation_id === activeConversationId
    )?.title ||
    activeConversationTitle ||
    'Chat';
  const draftCountId = useId();
  const contentChangeCount = activity.view
    ? composeDraftChangeCards(activity.view.netDiff, activity.view.base, activity.view.current)
        .length
    : candidate.yopsDraft.operations.length;
  const openDraft = () => {
    setTurn(null);
    setInspectorOpen(true);
    setMobileChats(false);
    setRightView('changes');
    setChangeScope(staged.length ? 'latest' : 'all');
    setSidePanel('chat');
  };
  const closeInspector = () => {
    setInspectorOpen(false);
    setTurn(null);
    requestAnimationFrame(() => draftButton.current?.focus());
  };
  useEffect(() => {
    if (inspectorOpen) closeDraftButton.current?.focus();
  }, [inspectorOpen, turn]);
  const openChat = () => {
    setTurn(null);
    setInspectorOpen(false);
    setSidePanel('chat');
    requestAnimationFrame(() =>
      boardRef.current
        ?.querySelector<HTMLTextAreaElement>('textarea[aria-label="Workspace instruction"]')
        ?.focus()
    );
  };
  const showingDetails = (activity.enabled || Boolean(selectedSchema)) && sidePanel === 'history';
  const createConversation = useCallback(async () => {
    const conversationId = await activity.createAssistantConversation();
    setActiveConversationId(conversationId);
    setActiveConversationTitle('Compose assistant');
    setSchemaConversationId(undefined);
    setSidePanel('chat');
    setTurn(null);
    setMobileChats(false);
    return conversationId;
  }, [activity.createAssistantConversation]);

  const refreshSchema = async () => {
    await controller.refreshFromServer();
    await activity.loadLatest();
    setSchemaCandidateEpoch((value) => value + 1);
  };
  useImperativeHandle(controlsRef, () => ({
    requestNavigation: (navigate) =>
      contentNavigation.requestNavigation(() => {
        setCommitSelection(null);
        navigate();
      }),
    editDraft: () => {
      setFocusSchemaPath(undefined);
      void openStructure(draftSubject === 'schema' ? 'schema' : 'structure');
    },
  }));

  return (
    <div
      ref={boardRef}
      style={
        {
          display: hidden ? 'none' : undefined,
          '--draft-width': `${draftWidth}px`,
          '--discussion-width': `${discussionWidth}px`,
        } as CSSProperties
      }
      data-details-open={showingDetails || undefined}
      data-inspector-open={inspectorOpen || undefined}
      data-mobile-chats={mobileChats || undefined}
      data-resizing={resizing || undefined}
      data-draft-collapsed={draftCollapsed || undefined}
      className={composeStyles.composeBoard}
    >
      <ComposeFeedback controller={controller} publishError={structureError} />

      {/* biome-ignore lint/a11y/useSemanticElements: This is an interactive window splitter, not a thematic break. */}
      <div
        role="separator"
        hidden={!inspectorOpen}
        aria-label="Resize discussion panel"
        aria-orientation="vertical"
        aria-valuemin={320}
        aria-valuemax={680}
        aria-valuenow={discussionWidth}
        tabIndex={0}
        className={composeStyles.discussionResize}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          const sidebar = boardRef.current?.querySelector('[data-compose-rail]');
          dragOrigin.current = {
            x: event.clientX,
            width: sidebar ? sidebar.getBoundingClientRect().width + 16 : discussionWidth,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          setResizing(true);
        }}
        onPointerMove={(event) => {
          if (dragOrigin.current)
            resizeDiscussion(dragOrigin.current.width + dragOrigin.current.x - event.clientX);
        }}
        onPointerUp={(event) => {
          dragOrigin.current = null;
          setResizing(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => {
          dragOrigin.current = null;
          setResizing(false);
        }}
        onPointerCancel={() => {
          dragOrigin.current = null;
          setResizing(false);
        }}
        title="Drag to resize · double-click to restore balanced width"
        onDoubleClick={() => resizeDiscussion(null)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            resizeDiscussion(discussionWidth + (event.key === 'ArrowLeft' ? 20 : -20));
          }
        }}
      />
      {draftCollapsed ? null : (
        // biome-ignore lint/a11y/useSemanticElements: This is an interactive window splitter, not a thematic break.
        <div
          role="separator"
          aria-label="Resize conversation panel"
          aria-orientation="vertical"
          aria-valuemin={180}
          aria-valuemax={560}
          aria-valuenow={draftWidth}
          tabIndex={0}
          className={`${composeStyles.discussionResize} ${composeStyles.draftResize}`}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            const sidebar = boardRef.current?.querySelector(
              '[aria-label="Workspace conversations"]'
            );
            draftDragOrigin.current = {
              x: event.clientX,
              width: sidebar?.getBoundingClientRect().width || draftWidth,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            setResizing(true);
          }}
          onPointerMove={(event) => {
            if (draftDragOrigin.current)
              resizeDraft(
                draftDragOrigin.current.width + event.clientX - draftDragOrigin.current.x
              );
          }}
          onPointerUp={(event) => {
            draftDragOrigin.current = null;
            setResizing(false);
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onLostPointerCapture={() => {
            draftDragOrigin.current = null;
            setResizing(false);
          }}
          onPointerCancel={() => {
            draftDragOrigin.current = null;
            setResizing(false);
          }}
          title="Drag to resize · double-click to restore balanced width"
          onDoubleClick={() => resizeDraft(null)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              resizeDraft(draftWidth + (event.key === 'ArrowRight' ? 20 : -20));
            } else if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault();
              resizeDraft(event.key === 'Home' ? 180 : 560);
            }
          }}
        />
      )}
      <aside aria-label="Workspace conversations" className={composeStyles.currentDraftSidebar}>
        {draftCollapsed && !mobileChats ? (
          <button
            type="button"
            aria-label="Expand conversation panel"
            title="Expand conversations"
            className={composeStyles.currentDraftRail}
            onClick={() => toggleDraft(false)}
          >
            <PanelLeftOpen aria-hidden="true" />
            <MessageSquare aria-hidden="true" />
            <span>Chats</span>
          </button>
        ) : (
          <WorkspaceConversationSidebar
            key={candidate.id}
            candidate={candidate}
            conversationsQuery={conversationsQuery}
            activeConversationId={activeConversationId}
            canCreate={Boolean(activity.enabled && activity.view)}
            onCollapse={() => {
              if (mobileChats) setMobileChats(false);
              else toggleDraft(true);
            }}
            onCreate={createConversation}
            onSelect={(conversationId, conversationTitle) => {
              setMobileChats(false);
              setTurn(null);
              setActiveConversationId(conversationId);
              setActiveConversationTitle(conversationTitle);
              setSchemaConversationId(undefined);
              setSidePanel('chat');
            }}
          />
        )}
      </aside>
      <main className={composeStyles.composeMain}>
        <section className={composeStyles.chatPanel} aria-label="Workspace AI chat">
          <header className={composeStyles.discussionHeader}>
            <button
              type="button"
              aria-label="Show conversations"
              className={composeStyles.mobileChatsButton}
              onClick={() => {
                setMobileChats(true);
              }}
            >
              <PanelLeftOpen aria-hidden="true" />
            </button>
            <MessageSquare aria-hidden="true" />
            <h2 title={currentChatTitle}>{currentChatTitle}</h2>
            <button
              type="button"
              className={composeStyles.draftToggle}
              aria-label="Open Draft"
              aria-describedby={draftCountId}
              aria-expanded={inspectorOpen}
              ref={draftButton}
              onClick={openDraft}
              title="Inspect Workspace Draft"
            >
              <PanelRightOpen aria-hidden="true" /> Draft
              <span id={draftCountId}>
                {contentChangeCount} {activity.view ? 'Content changes' : 'Draft operations'}
              </span>
              {schemaSettings.record && schemaSettings.record.status !== 'cancelled' ? (
                <small>Schema</small>
              ) : null}
              {staged.length ? <small>{staged.length} unsaved</small> : null}
            </button>
          </header>
          <ComposeAuthoringAssistant
            key={JSON.stringify([candidate.projectId, candidate.id, activeConversationId])}
            draftPreparation={
              !activity.view
                ? {
                    start: () => {
                      if (!activity.enabled) void authoringBootstrap.start();
                      else if (!activity.loading) activity.refresh();
                    },
                    busy: authoringBootstrap.busy || activity.loading,
                    error: authoringBootstrap.error ?? activity.error,
                    importing: authoringBootstrap.importSnapshot !== undefined,
                    cancel: () => {
                      setFieldDialog(null);
                      authoringBootstrap.cancel();
                    },
                  }
                : undefined
            }
            allowProposal={staged.length === 0}
            context={{
              workspaceId: candidate.id,
              workspaceRevision: activity.view?.workspaceRevision ?? candidate.revision ?? 0,
              sourceMaterialIds,
              selectedActionId: selectedSchema ? undefined : activitySelection?.meta.actionId,
              selectedNodeId: selectedSchema ? undefined : activitySelection?.operation.id,
            }}
            conversationId={activeConversationId}
            title={activeConversationTitle}
            initialPendingCandidate={
              activity.view?.pendingCandidates?.find((item) => item.status === 'candidate')
                ?.transitionId
            }
            onCreateConversation={activity.createAssistantConversation}
            onConversationChange={(conversationId) => {
              setActiveConversationId(conversationId);
              setActiveConversationTitle(undefined);
              setSchemaConversationId(undefined);
            }}
            onPublishCandidate={activity.publishCandidate}
            schemaReceipt={
              schemaSettings.record && schemaSettings.record.status !== 'cancelled'
                ? {
                    settingsIds: (schemaSettings.record.cards ?? [schemaSettings.record]).map(
                      (card) => card.settingsId
                    ),
                    open: openDraft,
                  }
                : undefined
            }
            onOpenTurn={(changes) => {
              setTurn(changes);
              setInspectorOpen(true);
              setMobileChats(false);
              setRightView('changes');
              setSidePanel('chat');
            }}
            activityActions={activity.actions}
            activityCards={activity.cards}
            projectId={candidate.projectId}
            onSchemaCandidateChange={(id) => {
              if (id) setSchemaConversationId(id);
              setSchemaCandidateEpoch((value) => value + 1);
            }}
            prefill={controller.assistantPrefill}
            onPrefillApplied={controller.clearAssistantPrefill}
            proposalBlockedHint={staged.length ? UNGROUPED_MANUAL_HINT : undefined}
            sourcesControl={<WorkspaceSourcesMenu candidate={candidate} controller={controller} />}
            contextLabel={
              activity.view
                ? `Content r${activity.compositionRevision ?? '—'} · Workspace r${activity.view.workspaceRevision}`
                : undefined
            }
          />
        </section>
      </main>

      <aside
        aria-label="Generated changes"
        className={composeStyles.discussionSidebar}
        hidden={!inspectorOpen}
        data-compose-rail
        data-panel={showingDetails && rightView === 'changes' ? 'details' : 'changes'}
      >
        <section className={composeStyles.generatedChangesPanel} aria-label="Generated card list">
          <nav className={composeStyles.workspaceToolTabs} aria-label="Workspace tools">
            {(['changes', 'structure', 'history'] as const).map((view) => (
              <button
                key={view}
                type="button"
                aria-pressed={rightView === view}
                onClick={() => {
                  setTurn(null);
                  setRightView(view);
                  setSidePanel('chat');
                }}
              >
                {view === 'changes' ? (
                  <Sparkles aria-hidden="true" />
                ) : view === 'structure' ? (
                  <ListTree aria-hidden="true" />
                ) : (
                  <GitBranch aria-hidden="true" />
                )}
                {view === 'changes' ? 'Changes' : view === 'structure' ? 'Structure' : 'History'}
              </button>
            ))}
            <button
              ref={closeDraftButton}
              type="button"
              aria-label="Close Draft"
              onClick={closeInspector}
            >
              <X aria-hidden="true" />
            </button>
          </nav>
          <div className={composeStyles.structurePanel} hidden={rightView !== 'structure'}>
            <WorkspaceCurrentDraft
              key={candidate.id}
              candidate={candidate}
              current={workingCurrent}
              revision={activity.compositionRevision}
              loading={activity.loading}
              error={workingCopy.error ?? activity.error}
              enabled={activity.enabled}
              stagedCount={staged.length}
              authoring={activity.view}
              subject={draftSubject}
              onSubjectChange={setDraftSubject}
              schemaControl={
                <WorkspaceSchemaSelect
                  candidate={candidate}
                  controller={controller}
                  unbound={activity.view?.currentSchema?.status === 'unbound'}
                  requestNavigation={contentNavigation.requestNavigation}
                />
              }
              onEdit={(subject, path) => {
                setFocusSchemaPath(path);
                void openStructure(subject === 'schema' ? 'schema' : 'structure');
              }}
              onDiscuss={(subject, path) => {
                controller.prefillAssistant(
                  `修改 ${subject === 'schema' ? 'Schema 定义' : 'Content'} ${path}：`
                );
                openChat();
              }}
            />
          </div>
          {rightView === 'changes' && showingDetails ? (
            <section
              className={composeStyles.changeDetailsPanel}
              aria-label="Selected change details"
            >
              <header className={composeStyles.discussionHeader}>
                <Layers aria-hidden="true" />
                <h2>Details</h2>
                <button
                  type="button"
                  aria-label="Back to changes"
                  onClick={() => setSidePanel('chat')}
                >
                  <ArrowLeft aria-hidden="true" />
                </button>
              </header>
              {selectedSchema ? (
                <AssistantSchemaSettingsDetails
                  key={candidate.id + ':' + selectedSchema.settingsId}
                  record={selectedSchema}
                  projectId={candidate.projectId}
                  workspaceId={candidate.id}
                  onEdit={() => {
                    const settings = selectedSchema.settings;
                    setFocusSchemaPath(
                      [
                        settings.targetNodePath ?? settings.nodePath,
                        settings.newName ?? settings.name,
                      ]
                        .filter(Boolean)
                        .join('/')
                    );
                    void openStructure('schema');
                  }}
                  onDiscuss={() => {
                    const settings = selectedSchema.settings;
                    const path = [
                      settings.targetNodePath ?? settings.nodePath,
                      settings.newName ?? settings.name,
                    ]
                      .filter(Boolean)
                      .join('/');
                    setActivitySelection(null);
                    controller.prefillAssistant(`修改 Schema 结构 ${path}：`);
                    openChat();
                  }}
                />
              ) : (
                <ComposeNodeHistoryPanel
                  activity={activity}
                  selection={activitySelection}
                  onOpenAction={openHistoryAction}
                  onDiscuss={openChat}
                  onOpenStructure={setFieldDialog}
                  onSubmit={stageManualOps}
                  onEditingChange={setNodeInput}
                  workingCurrent={workingCurrent}
                />
              )}
            </section>
          ) : null}
          {rightView === 'history' ? (
            historicalCommit ? (
              historicalInspection ? (
                <section
                  className={composeStyles.changeDetailsPanel}
                  aria-label="Committed change details"
                >
                  <header className={composeStyles.discussionHeader}>
                    <button
                      type="button"
                      aria-label="Back to committed changes"
                      onClick={() => setCommitInspection(null)}
                    >
                      <ArrowLeft aria-hidden="true" />
                    </button>
                    <h2>Commit details</h2>
                  </header>
                  <WorkspaceCommitChangeDetails inspection={historicalInspection} />
                </section>
              ) : (
                <WorkspaceCommitHistoryPanel
                  key={`${commitScope}:${historicalCommit.hash}`}
                  projectId={candidate.projectId}
                  commit={historicalCommit}
                  onReturn={() => setCommitSelection(null)}
                  onInspect={(value) => setCommitInspection({ scope: commitScope, value })}
                />
              )
            ) : (
              <WorkspaceCommitGraph
                key={`graph:${candidate.id}`}
                projectId={candidate.projectId}
                branch={candidate.targetBranch}
                refreshKey={candidate.baseCommitHash ?? undefined}
                onSelectCommit={(commit) => {
                  if (commit.project_id === candidate.projectId) {
                    setCommitInspection(null);
                    setCommitSelection({ scope: commitScope, commit });
                  }
                }}
              />
            )
          ) : rightView === 'changes' && turn ? (
            <section className={composeStyles.turnView} aria-label="This reply’s changes">
              <button type="button" onClick={openDraft}>
                <ArrowLeft aria-hidden="true" /> All draft changes
              </button>
              <h3>This reply’s changes</h3>
              <p>
                Content r{turn.action.beforeRevision} → r{turn.action.afterRevision}
              </p>
              <WorkspaceTurnChanges
                action={turn.action}
                cards={activity.cards[turn.action.actionId] ?? turn.cards}
              />
            </section>
          ) : rightView === 'changes' ? (
            <div className={composeStyles.changesBody} hidden={showingDetails}>
              <ChangesToolbar
                proposedChangeCount={
                  activity.view
                    ? (changeScope === 'all'
                        ? contentChangeCount
                        : groupComposeActivity(activity.actions).reduce(
                            (count, event) =>
                              count + composeEventCards(event, activity.cards).length,
                            0
                          )) + stagedObjectGroups(staged, publishedCurrent).length
                    : candidate.yopsDraft.operations.length
                }
                changeScope={changeScope}
                onChangeScope={setChangeScope}
              />
              {schemaSettings.error && !schemaSettings.record ? (
                <p role="alert">{schemaSettings.error}</p>
              ) : null}
              {workingCopy.error ? <p role="alert">{workingCopy.error}</p> : null}
              {saveRefreshError || (activity.awaitingPublishRefresh && activity.error) ? (
                <div role="alert">
                  Changes saved, but the Draft could not refresh.{' '}
                  <button
                    type="button"
                    onClick={() =>
                      void Promise.all([
                        activity.loadLatest(),
                        controller.refreshFromServer(activity.savedWorkspaceRevision),
                      ]).then(
                        () => setSaveRefreshError(false),
                        () => setSaveRefreshError(true)
                      )
                    }
                  >
                    Retry refresh
                  </button>
                </div>
              ) : activity.notice ? (
                <output>{activity.notice}</output>
              ) : null}
              {activity.newActivity ? (
                <output className={composeStyles.newActivity}>
                  <span>
                    New activity · Content r{activity.newActivity.compositionRevision}. Your
                    inspected node remains open.
                  </span>
                  <button onClick={() => void activity.loadLatest()} type="button">
                    Load latest
                  </button>
                </output>
              ) : null}
              <ProposedDraftPanel
                activity={activity}
                activitySelection={activitySelection}
                schemaSelected={Boolean(showingDetails && selectedSchema)}
                onActivitySelect={selectActivity}
                candidate={candidate}
                changeFilter="all"
                changeScope={changeScope}
                staging={stagingControls}
                schemaEvent={
                  schemaSettings.record
                    ? {
                        id:
                          schemaSettings.record.cards?.[0]?.settingsId ??
                          schemaSettings.record.settingsId,
                        timestamp:
                          schemaSettings.record.cards?.[0]?.createdAt ??
                          schemaSettings.record.createdAt ??
                          candidate.updatedAt,
                        content: (
                          <AssistantSchemaSettingsTimeline
                            projectId={candidate.projectId}
                            workspaceId={candidate.id}
                            state={schemaSettings}
                            selectedId={showingDetails ? selectedSchema?.settingsId : undefined}
                            onInspect={(record) => {
                              setActivitySelection(null);
                              setSchemaSelection({
                                workspaceId: candidate.id,
                                settingsId: record.settingsId,
                              });
                              setSidePanel('history');
                            }}
                            disabled={staged.length > 0}
                            onChanged={() => {
                              setSchemaCandidateEpoch((value) => value + 1);
                              activity.refresh();
                            }}
                          />
                        ),
                      }
                    : undefined
                }
              />
            </div>
          ) : null}
        </section>
      </aside>
      {contentNavigation.dialog}
      {fieldDialog && activity.enabled ? (
        <ComposeFieldDialog
          key={candidate.id}
          activity={activity}
          title={candidate.title}
          initialView={fieldDialog === 'schema' ? 'structure' : fieldDialog}
          candidate={candidate}
          focusSchemaPath={focusSchemaPath}
          initialSubject={fieldDialog === 'schema' ? 'schema' : 'content'}
          onSubjectChange={setDraftSubject}
          schemaBlocked={
            staged.length
              ? 'Save or discard local Content changes in Changes before saving Schema.'
              : undefined
          }
          onSchemaChanged={refreshSchema}
          current={workingCurrent}
          workingCopyError={workingCopy.error}
          onContentInputChange={setDialogInput}
          error={structureError}
          pending={structurePending || !activity.view}
          onSubmit={stageManualOps}
          onClose={() => setFieldDialog(null)}
          onDiscuss={() => {
            setFieldDialog(null);
            controller.prefillAssistant(
              draftSubject === 'schema' ? '修改 Schema：' : '修改 Content：'
            );
            openChat();
          }}
        />
      ) : null}
    </div>
  );
}

interface WorkspaceConversationFolder {
  id: string;
  name: string;
  pinned?: boolean;
}

type WorkspaceFolderDialog =
  | { mode: 'create' }
  | { mode: 'rename'; folder: WorkspaceConversationFolder };

const NEW_WORKSPACE_CONVERSATION_TITLE = 'New conversation';

function conversationMetadataValue(conversation: Conversation, key: string): string | undefined {
  const value = conversation.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function WorkspaceConversationSidebar({
  conversationsQuery,
  activeConversationId,
  candidate,
  canCreate,
  onCollapse,
  onCreate,
  onSelect,
}: {
  conversationsQuery: ReturnType<typeof useWorkspaceConversations>;
  activeConversationId?: string;
  candidate: WorkspaceCandidate;
  canCreate: boolean;
  onCollapse: () => void;
  onCreate: () => Promise<string>;
  onSelect: (conversationId?: string, title?: string) => void;
}) {
  const conversationRefreshKey = useChatStore((state) => state.refreshKey);
  const previousRefreshKeyRef = useRef(conversationRefreshKey);
  const storageKey = `t3x-workspace-chat-folders:${candidate.projectId}:${candidate.id}`;
  const [folders, setFolders] = useState<WorkspaceConversationFolder[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      return Array.isArray(stored)
        ? stored
            .filter(
              (item): item is WorkspaceConversationFolder =>
                Boolean(item) && typeof item.id === 'string' && typeof item.name === 'string'
            )
            .map((item) => ({ ...item, pinned: item.pinned === true }))
        : [];
    } catch {
      return [];
    }
  });
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [folderDialog, setFolderDialog] = useState<WorkspaceFolderDialog | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderDialogError, setFolderDialogError] = useState<string | null>(null);
  const [folderToRemove, setFolderToRemove] = useState<WorkspaceConversationFolder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createBusyRef = useRef(false);
  const lastCreatedConversationRef = useRef<{ id: string; folderId?: string } | null>(null);
  const removedFolderIdsRef = useRef(new Set<string>());
  const linkedConversationIds = useMemo(
    () =>
      new Set(
        candidate.sourceBundle.flatMap((source) =>
          source.type === 'chat' && source.conversationId ? [source.conversationId] : []
        )
      ),
    [candidate.sourceBundle]
  );
  const conversations = useMemo(
    () =>
      (conversationsQuery.data?.conversations ?? [])
        .filter(
          (conversation) =>
            linkedConversationIds.has(conversation.conversation_id) ||
            conversationMetadataValue(conversation, 'workspace_id') === candidate.id
        )
        .sort((left, right) => right.created_at.localeCompare(left.created_at)),
    [candidate.id, conversationsQuery.data?.conversations, linkedConversationIds]
  );
  const orderedFolders = useMemo(
    () =>
      [...folders].sort(
        (left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))
      ),
    [folders]
  );

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(folders));
    } catch {
      /* Folder organization remains available for the current session. */
    }
  }, [folders, storageKey]);
  useEffect(() => {
    if (previousRefreshKeyRef.current === conversationRefreshKey) return;
    previousRefreshKeyRef.current = conversationRefreshKey;
    void conversationsQuery.refetch();
  }, [conversationRefreshKey, conversationsQuery.refetch]);
  useEffect(() => {
    const known = new Set(folders.map((folder) => folder.id));
    const inferred = conversations.flatMap((conversation) => {
      const id = conversationMetadataValue(conversation, 'workspace_folder_id');
      if (!id || known.has(id) || removedFolderIdsRef.current.has(id)) return [];
      known.add(id);
      return [
        {
          id,
          name: conversationMetadataValue(conversation, 'workspace_folder_name') ?? 'Folder',
        },
      ];
    });
    if (inferred.length) setFolders((current) => [...current, ...inferred]);
  }, [conversations, folders]);

  const createFolder = () => {
    setFolderName('');
    setFolderDialogError(null);
    setFolderDialog({ mode: 'create' });
  };
  const editFolder = (folder: WorkspaceConversationFolder) => {
    setFolderName(folder.name);
    setFolderDialogError(null);
    setFolderDialog({ mode: 'rename', folder });
  };
  const submitFolder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = folderName.trim();
    if (!name || !folderDialog) return;
    if (folderDialog.mode === 'create') {
      setFolders((current) => [...current, { id: `folder:${crypto.randomUUID()}`, name }]);
      setFolderName('');
      setFolderDialog(null);
      return;
    }
    const folder = folderDialog.folder;
    if (name === folder.name) {
      setFolderName('');
      setFolderDialog(null);
      return;
    }
    setFolderBusy(true);
    setFolderDialogError(null);
    try {
      await Promise.all(
        conversations
          .filter(
            (conversation) =>
              conversationMetadataValue(conversation, 'workspace_folder_id') === folder.id
          )
          .map((conversation) =>
            conversationsQuery.update(conversation.conversation_id, {
              metadata: {
                ...(conversation.metadata ?? {}),
                workspace_id: candidate.id,
                workspace_folder_id: folder.id,
                workspace_folder_name: name,
              },
            })
          )
      );
      setFolders((current) =>
        current.map((item) => (item.id === folder.id ? { ...item, name } : item))
      );
      setFolderName('');
      setFolderDialog(null);
    } catch (cause) {
      setFolderDialogError(cause instanceof Error ? cause.message : 'Could not rename the folder.');
    } finally {
      setFolderBusy(false);
    }
  };
  const toggleFolderPinned = (folder: WorkspaceConversationFolder) => {
    setFolders((current) =>
      current.map((item) => (item.id === folder.id ? { ...item, pinned: !item.pinned } : item))
    );
  };
  const removeFolder = async () => {
    if (!folderToRemove || folderBusy) return;
    const folder = folderToRemove;
    setFolderBusy(true);
    setFolderDialogError(null);
    removedFolderIdsRef.current.add(folder.id);
    try {
      await Promise.all(
        conversations
          .filter(
            (conversation) =>
              conversationMetadataValue(conversation, 'workspace_folder_id') === folder.id
          )
          .map((conversation) => {
            const metadata: Record<string, unknown> = {
              ...(conversation.metadata ?? {}),
              workspace_id: candidate.id,
            };
            delete metadata.workspace_folder_id;
            delete metadata.workspace_folder_name;
            return conversationsQuery.update(conversation.conversation_id, { metadata });
          })
      );
      setFolders((current) => current.filter((item) => item.id !== folder.id));
      setCollapsedFolders((current) => {
        const next = new Set(current);
        next.delete(folder.id);
        return next;
      });
      setFolderToRemove(null);
    } catch (cause) {
      removedFolderIdsRef.current.delete(folder.id);
      setFolderDialogError(cause instanceof Error ? cause.message : 'Could not remove the folder.');
    } finally {
      setFolderBusy(false);
    }
  };
  const createChat = async (folder?: WorkspaceConversationFolder) => {
    if (!canCreate || createBusyRef.current) return;
    createBusyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const folderId = folder?.id;
      const reusableIds = new Set<string>();
      const lastCreated = lastCreatedConversationRef.current;
      if (lastCreated && lastCreated.folderId === folderId) reusableIds.add(lastCreated.id);
      for (const conversation of conversations) {
        if (
          (conversation.title?.trim() || NEW_WORKSPACE_CONVERSATION_TITLE) !==
          NEW_WORKSPACE_CONVERSATION_TITLE
        )
          continue;
        if (conversationMetadataValue(conversation, 'workspace_folder_id') !== folderId) continue;
        reusableIds.add(conversation.conversation_id);
      }
      for (const conversationId of reusableIds) {
        const conversation = await conversationsQuery.get(conversationId);
        if (conversation.turns_count !== 0) continue;
        lastCreatedConversationRef.current = { id: conversationId, folderId };
        onSelect(conversationId, conversation.title ?? NEW_WORKSPACE_CONVERSATION_TITLE);
        return;
      }

      const conversationId = await onCreate();
      lastCreatedConversationRef.current = { id: conversationId, folderId };
      await conversationsQuery.update(conversationId, {
        title: NEW_WORKSPACE_CONVERSATION_TITLE,
        metadata: {
          workspace_id: candidate.id,
          ...(folder ? { workspace_folder_id: folder.id, workspace_folder_name: folder.name } : {}),
        },
      });
      onSelect(conversationId, NEW_WORKSPACE_CONVERSATION_TITLE);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the conversation.');
    } finally {
      createBusyRef.current = false;
      setBusy(false);
    }
  };
  const renameConversation = async (conversation: Conversation) => {
    const title = window
      .prompt('Rename conversation', conversation.title ?? 'New conversation')
      ?.trim();
    if (!title || title === conversation.title) return;
    setError(null);
    try {
      await conversationsQuery.update(conversation.conversation_id, { title });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not rename the conversation.');
    }
  };
  const moveConversation = async (
    conversation: Conversation,
    folder?: WorkspaceConversationFolder
  ) => {
    const metadata: Record<string, unknown> = {
      ...(conversation.metadata ?? {}),
      workspace_id: candidate.id,
    };
    if (folder) {
      metadata.workspace_folder_id = folder.id;
      metadata.workspace_folder_name = folder.name;
    } else {
      delete metadata.workspace_folder_id;
      delete metadata.workspace_folder_name;
    }
    setError(null);
    try {
      await conversationsQuery.update(conversation.conversation_id, { metadata });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not move the conversation.');
    }
  };
  const deleteConversation = async (conversation: Conversation) => {
    const title = conversation.title?.trim() || NEW_WORKSPACE_CONVERSATION_TITLE;
    if (!window.confirm(`Delete “${title}”? This cannot be undone.`)) return;
    setError(null);
    try {
      await conversationsQuery.remove(conversation.conversation_id);
      if (lastCreatedConversationRef.current?.id === conversation.conversation_id) {
        lastCreatedConversationRef.current = null;
      }
      if (conversation.conversation_id === activeConversationId) {
        const nextConversation = conversations.find(
          (item) => item.conversation_id !== conversation.conversation_id
        );
        onSelect(nextConversation?.conversation_id, nextConversation?.title ?? undefined);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the conversation.');
    }
  };
  const renderConversation = (conversation: Conversation) => {
    const title = conversation.title?.trim() || 'New conversation';
    const selected = conversation.conversation_id === activeConversationId;
    return (
      <div className={composeStyles.conversationRow} key={conversation.conversation_id}>
        <button
          type="button"
          aria-current={selected ? 'page' : undefined}
          title={title}
          onClick={() => onSelect(conversation.conversation_id, title)}
        >
          <MessageSquare aria-hidden="true" />
          <span>{title}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`Actions for ${title}`}>
              <MoreHorizontal aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => void renameConversation(conversation)}>
              Rename
            </DropdownMenuItem>
            {folders.map((folder) => (
              <DropdownMenuItem
                key={folder.id}
                onSelect={() => void moveConversation(conversation, folder)}
              >
                Move to {folder.name}
              </DropdownMenuItem>
            ))}
            {conversationMetadataValue(conversation, 'workspace_folder_id') ? (
              <DropdownMenuItem onSelect={() => void moveConversation(conversation)}>
                Move out of folder
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-[var(--status-error)] focus:text-[var(--status-error)]"
              onSelect={() => void deleteConversation(conversation)}
            >
              <Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };
  const unfiled = conversations.filter(
    (conversation) => !conversationMetadataValue(conversation, 'workspace_folder_id')
  );

  return (
    <section className={composeStyles.conversationSidebar} aria-label="Workspace chat list">
      <header>
        <button
          type="button"
          aria-label="New chat"
          className={composeStyles.newChatButton}
          disabled={!canCreate || busy}
          onClick={() => void createChat()}
        >
          <SquarePen aria-hidden="true" />
          <span>New chat</span>
        </button>
        <button
          type="button"
          aria-label="Collapse conversation panel"
          title="Collapse conversations"
          onClick={onCollapse}
        >
          <PanelLeftOpen aria-hidden="true" />
        </button>
      </header>
      <div className={composeStyles.conversationList}>
        <div className={composeStyles.conversationSectionLabel}>
          <h2>Folders</h2>
          <button type="button" aria-label="New folder" title="New folder" onClick={createFolder}>
            <FolderPlus aria-hidden="true" />
          </button>
        </div>
        {folders.length === 0 ? <p>No folders yet.</p> : null}
        {orderedFolders.map((folder) => {
          const collapsed = collapsedFolders.has(folder.id);
          const folderConversations = conversations.filter(
            (conversation) =>
              conversationMetadataValue(conversation, 'workspace_folder_id') === folder.id
          );
          return (
            <section className={composeStyles.conversationFolder} key={folder.id}>
              <header>
                <button
                  type="button"
                  aria-expanded={!collapsed}
                  onClick={() =>
                    setCollapsedFolders((current) => {
                      const next = new Set(current);
                      if (next.has(folder.id)) next.delete(folder.id);
                      else next.add(folder.id);
                      return next;
                    })
                  }
                >
                  {collapsed ? (
                    <ChevronRight aria-hidden="true" />
                  ) : (
                    <ChevronDown aria-hidden="true" />
                  )}
                  <Folder aria-hidden="true" />
                  <span>{folder.name}</span>
                </button>
                <button
                  type="button"
                  aria-label={`New conversation in ${folder.name}`}
                  title={`New conversation in ${folder.name}`}
                  disabled={!canCreate || busy}
                  onClick={() => void createChat(folder)}
                >
                  <Plus aria-hidden="true" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label={`Actions for folder ${folder.name}`}>
                      <MoreHorizontal aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onSelect={() => toggleFolderPinned(folder)}>
                      <Pin aria-hidden="true" className="mr-2 h-4 w-4" />
                      {folder.pinned ? 'Unpin' : 'Pin'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => editFolder(folder)}>
                      <Pencil aria-hidden="true" className="mr-2 h-4 w-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-[var(--status-error)] focus:text-[var(--status-error)]"
                      onSelect={() => {
                        setFolderDialogError(null);
                        setFolderToRemove(folder);
                      }}
                    >
                      <Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />
                      Remove folder
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </header>
              {!collapsed ? folderConversations.map(renderConversation) : null}
            </section>
          );
        })}
        {unfiled.length > 0 ? (
          <div className={composeStyles.conversationSectionLabel}>
            <h2>Recent</h2>
          </div>
        ) : null}
        {unfiled.map(renderConversation)}
        {!conversationsQuery.loading && conversations.length === 0 ? (
          <p>No conversations yet. Create one to start with a blank chat.</p>
        ) : null}
        {conversationsQuery.loading ? <p>Loading conversations…</p> : null}
        {error || conversationsQuery.error ? (
          <p role="alert">{error ?? conversationsQuery.error?.message}</p>
        ) : null}
      </div>
      <Dialog
        open={folderDialog !== null}
        onOpenChange={(open) => {
          if (!open && !folderBusy) {
            setFolderDialog(null);
            setFolderDialogError(null);
            setFolderName('');
          }
        }}
      >
        <DialogContent className="overflow-hidden rounded-2xl p-0 sm:max-w-[520px]">
          <form className="p-6" onSubmit={submitFolder}>
            <DialogHeader>
              <DialogTitle className="text-xl">
                {folderDialog?.mode === 'rename' ? 'Rename folder' : 'Create folder'}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {folderDialog?.mode === 'rename'
                  ? 'Enter a new name for this folder.'
                  : 'Enter a name for the new folder.'}
              </DialogDescription>
            </DialogHeader>
            <label className="sr-only" htmlFor="workspace-folder-name">
              Folder name
            </label>
            <div className="relative mt-5">
              <Folder
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--text-secondary)]"
              />
              <Input
                autoFocus
                className="h-11 rounded-xl pl-10"
                id="workspace-folder-name"
                onChange={(event) => setFolderName(event.target.value)}
                placeholder="Folder name"
                value={folderName}
              />
            </div>
            {folderDialogError ? (
              <p className="mt-3 text-sm text-[var(--status-error)]" role="alert">
                {folderDialogError}
              </p>
            ) : null}
            <DialogFooter className="mt-8 flex-row justify-end">
              <Button
                disabled={folderBusy}
                onClick={() => setFolderDialog(null)}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button disabled={!folderName.trim() || folderBusy} type="submit">
                {folderBusy
                  ? 'Saving…'
                  : folderDialog?.mode === 'rename'
                    ? 'Save changes'
                    : 'Create folder'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={folderToRemove !== null}
        onOpenChange={(open) => {
          if (!open && !folderBusy) {
            setFolderToRemove(null);
            setFolderDialogError(null);
          }
        }}
      >
        <DialogContent className="overflow-hidden rounded-2xl p-0 sm:max-w-[480px]">
          <div className="p-6">
            <DialogHeader>
              <DialogTitle>Remove “{folderToRemove?.name}”?</DialogTitle>
              <DialogDescription>
                Conversations inside this folder will move to Recent. They will not be deleted.
              </DialogDescription>
            </DialogHeader>
            {folderDialogError ? (
              <p className="mt-3 text-sm text-[var(--status-error)]" role="alert">
                {folderDialogError}
              </p>
            ) : null}
            <DialogFooter className="mt-8 flex-row justify-end">
              <Button
                disabled={folderBusy}
                onClick={() => setFolderToRemove(null)}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                disabled={folderBusy}
                onClick={() => void removeFolder()}
                type="button"
                variant="destructive"
              >
                {folderBusy ? 'Removing…' : 'Remove folder'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function WorkspaceSourcesMenu({
  candidate,
  controller,
}: {
  candidate: WorkspaceCandidate;
  controller: WorkspaceComposeReviewController;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const included = controller.materialSources.filter((material) => material.included);
  const tokenEstimate = (materialId: string) =>
    candidate.sourceBundle.find((item) => item.materialId === materialId)?.tokenEstimate;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) void controller.uploadFile(file);
  };

  return (
    <>
      <input
        accept={DOCUMENT_SOURCE_ACCEPTED_TYPES}
        aria-label="Upload source material"
        className="hidden"
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`Workspace sources (${included.length} included)`}
                className={composeStyles.sourcesButton}
                disabled={controller.sourceBusy}
                type="button"
              >
                <Plus aria-hidden="true" />
                {controller.sourceBusy ? (
                  <span>Updating sources…</span>
                ) : included.length > 0 ? (
                  <small>{included.length}</small>
                ) : (
                  <span>Add source</span>
                )}
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            {included.length > 0 ? (
              <ul className={composeStyles.sourcesTooltip}>
                {included.map((material) => (
                  <li key={material.id}>{material.title}</li>
                ))}
              </ul>
            ) : (
              'No sources included. Click to add one.'
            )}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className={composeStyles.sourceMaterialMenu} side="top">
          <DropdownMenuLabel>Workspace sources</DropdownMenuLabel>
          {controller.materialSources.map((material) => {
            const tokens = tokenEstimate(material.materialId);
            return (
              <DropdownMenuCheckboxItem
                checked={material.included}
                disabled={controller.sourceBusy}
                key={material.id}
                onCheckedChange={() => void controller.toggleMaterialSource(material.materialId)}
              >
                <span className={composeStyles.sourceMaterialName}>{material.title}</span>
                {tokens ? <small>{tokens} tokens</small> : null}
              </DropdownMenuCheckboxItem>
            );
          })}
          {controller.materialSources.length > 0 ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
            <FileUp aria-hidden="true" className="size-4" /> Add source
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function ChangesToolbar({
  proposedChangeCount,
  changeScope,
  onChangeScope,
}: {
  proposedChangeCount: number;
  changeScope: 'latest' | 'all';
  onChangeScope: (scope: 'latest' | 'all') => void;
}) {
  return (
    <div className={composeStyles.changesToolbar}>
      <div className={composeStyles.changeScope} role="tablist" aria-label="Change scope">
        {(['latest', 'all'] as const).map((scope) => (
          <button
            key={scope}
            aria-selected={changeScope === scope}
            onClick={() => onChangeScope(scope)}
            role="tab"
            type="button"
          >
            {scope === 'latest' ? 'Latest' : 'All changes'}
          </button>
        ))}
      </div>
      <span className={composeStyles.changeCount} title="Proposed changes">
        {proposedChangeCount} {proposedChangeCount === 1 ? 'change' : 'changes'}
      </span>
    </div>
  );
}

function ComposeFeedback({
  controller,
  publishError,
}: {
  controller: WorkspaceComposeReviewController;
  publishError?: string | null;
}) {
  if (!controller.error && !controller.notice && !publishError) return null;
  return (
    <div
      className={composeStyles.composeFeedback}
      role={controller.error || publishError ? 'alert' : 'status'}
    >
      {publishError ?? controller.error ?? controller.notice}
      {controller.hasCollaborationConflict ? (
        <button
          className={composeStyles.addManually}
          disabled={controller.isBusy}
          onClick={() => void controller.resolveCollaborationConflict()}
          type="button"
        >
          Refresh and apply mine
        </button>
      ) : null}
    </div>
  );
}

function ProposedDraftPanel({
  activity,
  activitySelection,
  schemaSelected,
  onActivitySelect,
  candidate,
  changeFilter,
  changeScope,
  staging,
  schemaEvent,
}: {
  activity: ReturnType<typeof useComposeActivity>;
  activitySelection: ComposeActivitySelection | null;
  schemaSelected: boolean;
  onActivitySelect: (
    selection: ComposeActivitySelection,
    panel?: 'history' | 'chat' | 'preserve'
  ) => void;
  candidate: WorkspaceCandidate;
  changeFilter: ComposeChangeFilter;
  changeScope: 'latest' | 'all';
  staging?: ManualStagingControls;
  schemaEvent?: ComposeSchemaTimelineEvent;
}) {
  const operations = candidate.yopsDraft.operations;
  const editRequest = useRef(0);
  useEffect(() => {
    if (!activity.view || !activitySelection || schemaSelected) return;
    if (changeScope === 'all') {
      if (activitySelection?.meta.comparison === 'draft') return;
      const changes = composeDraftChangeCards(
        activity.view.netDiff,
        activity.view.base,
        activity.view.current
      );
      const card =
        changes.find(
          (item) =>
            item.nodeId === activitySelection?.operation.id &&
            item.path === activitySelection.operation.path
        ) ?? changes[0];
      if (card)
        onActivitySelect(
          {
            operation: activityOperation(card),
            meta: { eventId: 'all', comparison: 'draft' },
          },
          'preserve'
        );
      return;
    }
    const stagingSelected =
      activitySelection?.meta.eventId === MANUAL_STAGING_EVENT_ID &&
      Boolean(
        staging?.items.some(
          (item) =>
            (
              activitySelection.operation.objectChange?.sources ??
              activitySelection.operation.sourceCards
            )?.includes(item.card) ||
            (item.card.nodeId === activitySelection.operation.id &&
              item.card.path === activitySelection.operation.path)
        )
      );
    if (staging?.items.length) {
      if (
        activitySelection?.meta.comparison === 'event' &&
        activitySelection.meta.eventId !== MANUAL_STAGING_EVENT_ID
      )
        return;
      const groups = stagedObjectGroups(staging.items, staging.current);
      const group =
        (stagingSelected
          ? groups.find((entry) => entry.card.path === activitySelection?.operation.path)
          : undefined) ?? groups[0]!;
      if (
        stagingSelected &&
        composeValuesEqual(activitySelection?.operation.beforeValue, group.card.before) &&
        composeValuesEqual(activitySelection?.operation.afterValue, group.card.after) &&
        activitySelection?.operation.objectChange?.sources.length ===
          group.card.objectChange?.sources.length
      )
        return;
      const item = group.items[0]!;
      onActivitySelect({
        operation: activityOperation(group.card, item.reason),
        meta: {
          eventId: MANUAL_STAGING_EVENT_ID,
          actor: 'You',
          channel: 'manual',
          timestamp: item.createdAt,
          comparison: 'event',
        },
      });
      return;
    }
    if (
      activitySelection?.meta.comparison === 'event' &&
      activitySelection.meta.eventId !== MANUAL_STAGING_EVENT_ID
    )
      return;
    const event = groupComposeActivity(activity.actions)[0];
    if (!event) return;
    const card = composeEventCards(event, activity.cards)[0];
    if (!card) return;
    const action = event.actions.findLast((entry) =>
      activity.cards[entry.actionId]?.some((item) => item.nodeId === card.nodeId)
    )!;
    onActivitySelect(
      {
        operation: activityOperation(card, action.reason),
        meta: {
          eventId: event.id,
          actionId: action.actionId,
          actor: action.actor.id === 'human:local-user' ? 'You' : action.actor.id,
          channel: action.channel,
          timestamp: action.publishedAt,
          comparison: 'event',
        },
      },
      'preserve'
    );
  }, [
    activity.view,
    schemaSelected,
    activity.actions,
    activity.cards,
    activitySelection,
    onActivitySelect,
    changeScope,
    staging?.items,
    staging?.current,
  ]);
  const renderChangeRow = (operation: WorkspaceYOpsDraftOperation, meta?: ComposeActivityMeta) => {
    const selected = Boolean(
      !schemaSelected &&
        meta &&
        activitySelection?.meta.eventId === meta.eventId &&
        activitySelection.operation.id === operation.id &&
        activitySelection.operation.path === operation.path
    );
    const onSelect = () => {
      if (meta) onActivitySelect({ operation, meta }, 'history');
    };
    if (meta?.comparison === 'draft') {
      return (
        <ComposeDraftChangeRow
          key={`${operation.id}:${operation.path}`}
          operation={operation}
          Icon={composeFieldPresentation(candidate, operation).icon}
          selected={selected}
          onSelect={onSelect}
          onEdit={() =>
            onActivitySelect(
              { operation, meta: { ...meta, editRequest: ++editRequest.current } },
              'history'
            )
          }
        />
      );
    }
    return (
      <ComposeActivityChangeRow
        key={`${meta?.eventId ?? 'proposal'}:${operation.id}:${operation.path}`}
        operation={operation}
        selected={selected}
        applied={Boolean(meta?.actionId)}
        disabled={!meta}
        onSelect={onSelect}
      />
    );
  };

  return (
    <div className={composeStyles.panel} data-change-scope={changeScope}>
      <ComposeActivityTimeline
        key={candidate.id}
        activity={activity}
        filter={changeFilter}
        scope={changeScope}
        staging={staging}
        schemaEvent={schemaEvent}
        updatedAt={candidate.updatedAt}
        renderRow={renderChangeRow}
        fallback={
          <div className={composeStyles.changeList}>
            {operations.length ? (
              operations.map((operation) => renderChangeRow(operation))
            ) : (
              <p className={composeStyles.activityStatus}>
                Add context in Chat, then describe the change you want to make.
              </p>
            )}
          </div>
        }
      />
    </div>
  );
}

function composeFieldPresentation(
  candidate: WorkspaceCandidate,
  operation: WorkspaceYOpsDraftOperation | null
): { label: string; icon: LucideIcon } {
  if (!operation) return { label: 'Change', icon: ListTree };
  const normalize = (path: string) => path.replace(/^\//, '').replace(/\./g, '/');
  const findField = (
    fields: WorkspaceSchemaCandidateField[]
  ): WorkspaceSchemaCandidateField | undefined => {
    for (const field of fields) {
      if (normalize(field.path) === normalize(operation.path)) return field;
      const match = field.children ? findField(field.children) : undefined;
      if (match) return match;
    }
    return undefined;
  };
  const field = findField(candidate.schemaCandidate.fields);
  const value = operation.afterValue ?? operation.beforeValue;
  const type = field?.type.toLowerCase() ?? (Array.isArray(value) ? 'array' : typeof value);
  if (/\[key=requirements\]/.test(operation.path) && type === 'object')
    return { label: 'Requirement', icon: BoxIcon };
  if (type === 'percentage' || type === 'percent') return { label: 'Percentage', icon: Percent };
  if (type === 'boolean') return { label: 'Yes / No', icon: Settings };
  if (type === 'array') return { label: 'List', icon: Globe2 };
  if (type === 'number' || type === 'integer') return { label: 'Number', icon: Hash };
  if (type === 'object') return { label: 'Structured field', icon: BoxIcon };
  return { label: type === 'string' ? 'Text' : (field?.type ?? 'Value'), icon: Type };
}

function getProposalSourceRefs(candidate: WorkspaceCandidate): string[] {
  if (candidate.sourceBundle.length > 0) {
    return candidate.sourceBundle.map((source) => source.id);
  }
  return Array.from(
    new Set(candidate.yopsDraft.operations.flatMap((operation) => operation.sourceRefs ?? []))
  );
}

function _formatProposalSchemaLabel(candidate: WorkspaceCandidate): string {
  const binding = candidate.schemaBindings[0];
  if (binding) {
    const version = binding.version ? ` ${binding.version}` : '';
    return `${binding.schemaName}${version}`.trim();
  }

  const composition = candidate.schemaComposition;
  if (!composition) return 'Schema not bound';
  if ('core' in composition) {
    const version = composition.core.version ? ` ${composition.core.version}` : '';
    return `${composition.core.canonicalName}${version}`.trim();
  }

  const primaryModule = composition.modules[0];
  if (!primaryModule) return 'Schema not bound';
  const version = primaryModule.version ? ` ${primaryModule.version}` : '';
  return `${primaryModule.canonicalName}${version}`.trim();
}

function formatRelativeTime(value: string | undefined): string {
  if (!value) return '—';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '—';
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (elapsedMinutes < 1) return 'just now';
  if (elapsedMinutes < 60) return `${String(elapsedMinutes)}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${String(elapsedHours)}h ago`;
  return `${String(Math.floor(elapsedHours / 24))}d ago`;
}

type DraftSnapshotStatus = 'none' | 'unknown' | 'outdated' | 'matching';

function ReviewSurface({
  activity,
  compareScenarioId,
  controller,
  onModeChange,
  pane,
  setPane,
}: {
  activity: ReturnType<typeof useComposeActivity>;
  compareScenarioId: string;
  controller: WorkspaceComposeReviewController;
  onModeChange: (mode: WorkspaceSurfaceMode) => void;
  pane: ReviewPane;
  setPane: (pane: ReviewPane) => void;
}) {
  const authoring = activity.view;
  const newerRevision =
    activity.newActivity && activity.newActivity.workspaceRevision !== authoring?.workspaceRevision
      ? activity.newActivity.workspaceRevision
      : authoring && (controller.candidate.revision ?? -1) > authoring.workspaceRevision
        ? controller.candidate.revision
        : undefined;
  const newerDraft =
    newerRevision !== undefined ||
    Boolean(activity.newActivity || authoring?.synchronization?.required);
  const snapshot = controller.review.reviewSnapshot;
  const snapshotBasis = snapshot?.review?.precondition;
  const inspectedRevision = authoring?.workspaceRevision ?? controller.candidate.revision;
  const inspectedRefHead = authoring
    ? authoring.basis.refHead
    : controller.candidate.baseCommitHash;
  const snapshotMatchesDraft =
    snapshotBasis !== undefined &&
    snapshotBasis.workspaceRevision === inspectedRevision &&
    snapshotBasis.refHead === inspectedRefHead &&
    snapshotBasis.refName === (authoring?.basis.refName ?? controller.candidate.targetBranch);
  const schemaReview = !authoring || snapshotMatchesDraft ? controller.review.schemaReview : null;
  const authoringReview = useMemo(
    () =>
      buildAuthoringReviewProjection(
        controller.candidate,
        authoring ? { ...authoring, selected: null } : null,
        controller.review
      ),
    [authoring, controller.candidate, controller.review]
  );
  const diagnosticsRequested = useSearchParams().get('schemaDiagnostics') === '1';
  const router = useRouter();
  const reviewMounted = useRef(true);
  useEffect(() => {
    reviewMounted.current = true;
    return () => {
      reviewMounted.current = false;
    };
  }, []);
  const schemaRequests = useWorkspaceSchemaEditingRequests(
    controller.candidate.projectId,
    controller.candidate.id
  );
  const savedSchema = useStudioSchemaEditCandidate(
    controller.candidate.projectId,
    controller.candidate.id,
    controller.candidate.revision
  );
  const hasSavedSchema =
    !newerDraft &&
    hasUnappliedSchemaEdit(
      savedSchema.candidate,
      controller.candidate,
      authoring?.currentSchema?.schemaHash
    );
  const [preparationError, setPreparationError] = useState<string>();
  const [preparingSchema, setPreparingSchema] = useState(false);
  const preparationBusy = useRef(false);
  const [schemaPreparation, setSchemaPreparation] = useState<{
    revision: number;
    compositionRevision: number;
    refHead: string | null;
    target: SchemaPreparationTarget;
  }>();
  const prepareReview = async () => {
    if (preparationBusy.current || controller.isBusy || savedSchema.loading || savedSchema.error)
      return;
    if (newerDraft) {
      setPreparationError(REVIEW_DRAFT_CHANGED);
      return;
    }
    if (!authoring || activity.loading || activity.awaitingPublishRefresh) {
      setPreparationError('Load the saved Draft before preparing Review.');
      return;
    }
    preparationBusy.current = true;
    setPreparingSchema(true);
    setPreparationError(undefined);
    try {
      if (await schemaRequests.hasPendingEdit()) {
        if (!reviewMounted.current) return;
        const latest = await schemaRequests.read();
        if (!reviewMounted.current) return;
        if (latest.unapplied && latest.edit) {
          const workspace = latest.preview.workspace;
          if (workspace?.revision !== authoring.workspaceRevision)
            throw new Error(REVIEW_DRAFT_CHANGED);
          if (
            !hasSavedSchema ||
            latest.edit.candidateId !== savedSchema.candidate?.candidateId ||
            latest.edit.revision !== savedSchema.candidate?.revision
          ) {
            throw new Error(
              'The saved Schema candidate changed. Load the latest Draft and Schema.'
            );
          }
          const target: SchemaPreparationTarget = {
            kind: 'studio',
            candidateIds: latest.candidateIds,
            reviewHash: latest.preview.reviewHash,
            schemaEditCandidate: {
              candidateId: latest.edit.candidateId,
              revision: latest.edit.revision,
            },
          };
          setSchemaPreparation({
            target,
            revision: authoring.workspaceRevision,
            compositionRevision: authoring.compositionRevision,
            refHead: authoring.basis.refHead,
          });
          return;
        }
        throw new Error('The saved Schema candidate changed. Load the latest Draft and Schema.');
      }
      if (hasSavedSchema)
        throw new Error('The saved Schema candidate changed. Load the latest Draft and Schema.');
      if (!reviewMounted.current) return;
      await controller.prepareReview((snapshot) => {
        if (!reviewMounted.current) return;
        router.replace(
          workspaceReviewHref(snapshot.projectId, snapshot.workspaceId, {
            snapshotId: snapshot.snapshotId,
            branch: snapshot.review.precondition.refName,
            pane,
          }),
          { scroll: false }
        );
      }, authoring);
    } catch (cause) {
      if (reviewMounted.current)
        setPreparationError(cause instanceof Error ? cause.message : 'Could not prepare Review.');
    } finally {
      preparationBusy.current = false;
      if (reviewMounted.current) setPreparingSchema(false);
    }
  };
  const candidate = authoringReview?.candidate ?? controller.candidate;
  const operations = candidate.yopsDraft.operations;
  const [comparison, setComparison] = useState<{
    candidate: WorkspaceCandidate;
    result?: Awaited<ReturnType<typeof validateWorkspaceCandidateYOps>>;
    error?: string;
  } | null>(null);
  const exactValidation =
    authoringReview?.review.deterministicValidation ?? controller.review.deterministicValidation;
  useEffect(() => {
    if (exactValidation || operations.length === 0) return;
    let cancelled = false;
    void validateWorkspaceCandidateYOps(candidate).then(
      (result) => {
        if (!cancelled) setComparison({ candidate, result });
      },
      () => {
        if (!cancelled)
          setComparison({ candidate, error: 'Unable to load the comparison baseline.' });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [candidate, exactValidation, operations.length]);
  const comparisonResult = comparison?.candidate === candidate ? comparison.result : undefined;
  const comparisonError = comparison?.candidate === candidate ? comparison.error : undefined;
  const comparisonReview = useMemo(
    () =>
      authoringReview
        ? authoringReview.review
        : exactValidation
          ? controller.review
          : {
              ...controller.review,
              deterministicValidation: comparisonResult ?? null,
            },
    [authoringReview, controller.review, exactValidation, comparisonResult]
  );
  const structureModel = useMemo(
    () => buildWorkspaceReviewStructureModel(candidate, comparisonReview),
    [candidate, comparisonReview]
  );
  const subjectChanges = workspaceReviewSubjectChanges(schemaReview);
  if (authoring) {
    subjectChanges.content = !composeValuesEqual(authoring.base, authoring.current);
    subjectChanges.schema = authoring.schemaHasChanges === true;
  } else if (!schemaReview) {
    subjectChanges.content = structureModel.rows.some((row) => row.diff?.exact);
  }
  subjectChanges.schema ||= hasSavedSchema;
  const [subject, setSubject] = useWorkspaceReviewSubject(
    candidate.projectId,
    candidate.id,
    subjectChanges
  );
  const [selectedStructureRowId, setSelectedStructureRowId] = useState<string | null>(null);
  const view = controller.review.view;
  const checks = getReviewChecks(controller);
  const preparing = controller.busyAction === 'review.prepare';
  const draftLoading = activity.enabled && !authoring && activity.loading;
  const draftUnavailable = activity.enabled && !draftLoading && (!authoring || !authoringReview);
  const snapshotStatus: DraftSnapshotStatus = !snapshot
    ? 'none'
    : newerDraft || hasSavedSchema
      ? 'outdated'
      : !snapshotBasis ||
          preparing ||
          preparingSchema ||
          savedSchema.loading ||
          savedSchema.error ||
          activity.error ||
          draftUnavailable ||
          draftLoading ||
          activity.awaitingPublishRefresh
        ? 'unknown'
        : snapshotMatchesDraft
          ? 'matching'
          : 'outdated';
  const committedId =
    committedReviewId(view) ??
    (controller.candidate.status === 'committed'
      ? (controller.candidate.lastCommitHash ?? null)
      : null);
  const comparisonScenario = controller.scenarios.options.find(
    (scenario) => scenario.id === compareScenarioId
  );
  const scenarioComparison = comparisonScenario
    ? compareScenarioOperations(operations, comparisonScenario.operations)
    : null;
  const changedStructureRows = useMemo(
    () => structureModel.rows.filter((row) => row.diff?.exact),
    [structureModel.rows]
  );
  const sourceRefs = getProposalSourceRefs(controller.candidate);
  const sourceLabel =
    controller.candidate.sourceBundle[0]?.id ?? sourceRefs[0] ?? 'source_chat:current';
  const materialLabel = sourceLabel.length > 36 ? `${sourceLabel.slice(0, 33)}…` : sourceLabel;
  const activeStructureRow =
    (selectedStructureRowId
      ? structureModel.rows.find((row) => row.id === selectedStructureRowId)
      : null) ??
    changedStructureRows[0] ??
    structureModel.rows[0] ??
    null;

  if (pane === 'checks') {
    return <WorkspaceChecksRedirect projectId={candidate.projectId} workspaceId={candidate.id} />;
  }
  const emptyDraft = authoring
    ? !draftUnavailable && authoring.hasChanges === false
    : !activity.enabled && candidate.revision === undefined && operations.length === 0;
  const showEmptyWorkbench =
    emptyDraft &&
    !subjectChanges.content &&
    !subjectChanges.schema &&
    !hasSavedSchema &&
    !controller.review.reviewSnapshot &&
    !view &&
    !committedId &&
    !diagnosticsRequested &&
    !controller.isBusy &&
    !preparingSchema &&
    !schemaPreparation &&
    !preparationError &&
    !controller.error &&
    !savedSchema.error &&
    !activity.error;
  const comparisonStatus =
    operations.length > 0 && !structureModel.hasReplayContent ? (
      <div className="p-5 text-sm text-[var(--text-secondary)]">
        <output>
          {comparisonError ||
            comparisonResult?.error?.message ||
            'Loading the exact before and after values…'}
        </output>
        {(comparisonError || comparisonResult?.error) && (
          <button
            type="button"
            className="mt-3 underline"
            disabled={controller.isBusy || authoring?.hasChanges === false}
            onClick={() => void prepareReview()}
          >
            Prepare exact review
          </button>
        )}
      </div>
    ) : null;
  const inspectedSchema = (
    <WorkspaceReviewSchemaView
      pane={pane}
      branch={candidate.targetBranch}
      review={schemaReview}
      current={authoring?.currentSchema}
      versionLabel={
        candidate.revision === undefined ? undefined : `workspace-r${candidate.revision}`
      }
    />
  );
  return (
    <>
      <WorkspaceReviewWorkbench
        title={
          <>
            Workspace draft{candidate.revision !== undefined ? ` r${candidate.revision}` : ''} →{' '}
            {candidate.targetBranch || 'main'}
            {authoring ? ` · Content r${authoring.compositionRevision}` : ''}
          </>
        }
        status={
          showEmptyWorkbench
            ? 'Content and Schema changes relative to the draft base.'
            : 'Review the saved Draft. Prepare review to freeze this revision and run checks.'
        }
        notice={
          newerDraft ||
          preparationError ||
          controller.error ||
          activity.error ||
          draftUnavailable ||
          activity.awaitingPublishRefresh ? (
            <div>
              {newerDraft ? (
                <p>
                  {newerRevision === undefined
                    ? REVIEW_DRAFT_CHANGED
                    : `Workspace r${newerRevision} is available. The inspected Draft is unchanged.`}
                </p>
              ) : null}
              {activity.awaitingPublishRefresh ? (
                <p>Changes saved. Refresh the Draft before preparing Review.</p>
              ) : null}
              {activity.error && authoring && !draftUnavailable ? (
                <p role="alert">
                  Refresh failed. Still showing Workspace r{authoring.workspaceRevision}.
                </p>
              ) : null}
              {activity.enabled ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={activity.loading || preparing || preparingSchema}
                  onClick={() =>
                    void Promise.all([activity.loadLatest(), savedSchema.refresh()]).then(
                      () => {
                        controller.clearPreparationError?.();
                        setPreparationError(undefined);
                      },
                      () => setPreparationError('The Draft could not refresh. Retry loading it.')
                    )
                  }
                >
                  Load latest Draft
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => onModeChange('compose')}>
                  Open Compose to load the Draft
                </Button>
              )}
            </div>
          ) : null
        }
        pane={showEmptyWorkbench ? 'changes' : pane}
        viewsDisabled={showEmptyWorkbench}
        onPaneChange={setPane}
        subject={subject}
        subjectChanges={subjectChanges}
        loading={!authoring && activity.loading}
        onSubjectChange={setSubject}
        contentStatus={
          subject === 'schema' && hasSavedSchema ? undefined : draftLoading ? (
            <output>Loading the saved Draft…</output>
          ) : draftUnavailable ? (
            <p role="alert">The saved Draft or its exact comparison baseline is unavailable.</p>
          ) : authoring &&
            authoring.hasChanges === undefined &&
            !subjectChanges.content &&
            !subjectChanges.schema ? (
            <p>The change status of this saved Draft is unavailable.</p>
          ) : undefined
        }
        emptyState={
          showEmptyWorkbench ? (
            <table
              className={cn(diffStyles.tree, diffStyles.referenceTree)}
              aria-label="Draft changes"
            >
              <ReviewDiffColumns />
              <tbody>
                <tr>
                  <td colSpan={3}>
                    <output className={workbenchStyles.empty}>
                      {savedSchema.loading
                        ? 'Checking for saved changes…'
                        : 'This draft has no Content or Schema changes to review.'}
                    </output>
                  </td>
                </tr>
              </tbody>
            </table>
          ) : hasSavedSchema ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Saved Schema changes are awaiting preparation. Prepare review to inspect the complete
              snapshot.
            </p>
          ) : comparisonStatus ? (
            comparisonStatus
          ) : committedId && !draftLoading && !draftUnavailable ? (
            <div className="text-sm text-[var(--text-secondary)]">
              <p>No Content or Schema changes available to review.</p>
              <Button className="mt-4" size="sm" onClick={controller.viewCommit}>
                View in State
              </Button>
            </div>
          ) : undefined
        }
        actions={
          !showEmptyWorkbench && (
            <Button size="sm" variant="canvas-outline" onClick={() => onModeChange('compose')}>
              <Pencil aria-hidden="true" /> Edit in Compose
            </Button>
          )
        }
        sidebar={
          showEmptyWorkbench ? (
            <section className={workbenchStyles.draftChecks} aria-label="Review readiness">
              <h2>Review checks</h2>
              <ReviewCheckList checks={checks} />
            </section>
          ) : (
            <>
              <WorkspaceReviewSummary
                candidate={candidate}
                controller={controller}
                snapshotStatus={snapshotStatus}
                hasChanges={hasSavedSchema ? true : authoring?.hasChanges}
                preparingSchema={preparingSchema || Boolean(schemaPreparation)}
                schemaLoading={Boolean(
                  savedSchema.loading ||
                    savedSchema.error ||
                    activity.loading ||
                    (activity.enabled && !authoring) ||
                    newerDraft
                )}
                hasSavedSchema={hasSavedSchema}
                draftUnavailable={Boolean(draftLoading || draftUnavailable)}
                preparationError={
                  preparationError ?? savedSchema.error ?? controller.error ?? undefined
                }
                onEdit={() => onModeChange('compose')}
                onOpenChecks={() => setPane('checks')}
                onPrepare={() => void prepareReview()}
              />
              <WorkspaceSchemaDiagnostics
                key={`${candidate.projectId}:${candidate.id}:${candidate.revision}`}
                projectId={candidate.projectId}
                workspaceId={candidate.id}
                revision={candidate.revision}
              />
            </>
          )
        }
      >
        {comparisonScenario ? (
          <p className={workbenchStyles.notice}>
            Compared with {comparisonScenario.label}: {comparisonScenario.operationCount} operations
            · {scenarioComparison?.differentValueCount ?? 0} value differences ·{' '}
            {scenarioComparison?.currentOnlyCount ?? 0} current-only paths ·{' '}
            {scenarioComparison?.comparisonOnlyCount ?? 0} comparison-only paths.
          </p>
        ) : null}
        {subject !== 'schema' && authoringReview && pane === 'yaml' ? (
          <details className={workbenchStyles.notice}>
            <summary>Complete Content YAML · Workspace r{authoring?.workspaceRevision}</summary>
            <WorkspaceReviewYaml
              base={authoring?.base}
              result={authoring?.current}
              branch={candidate.targetBranch}
              subject="Content"
              versionLabel={`workspace-r${authoring?.workspaceRevision}`}
            />
          </details>
        ) : null}
        {subject !== 'schema' &&
        pane === 'changes' &&
        authoringReview &&
        (structureModel.baseline.relations.length > 0 ||
          structureModel.head.relations.length > 0) ? (
          <details className={workbenchStyles.notice}>
            <summary>Base and Draft relations</summary>
            <WorkspaceReviewYaml
              base={{ relations: structureModel.baseline.relations }}
              result={{ relations: structureModel.head.relations }}
              branch={candidate.targetBranch}
              subject="Content"
              versionLabel={`workspace-r${authoring?.workspaceRevision}-relations`}
            />
          </details>
        ) : null}
        {subject === 'schema' && hasSavedSchema && savedSchema.candidate ? (
          <WorkspacePendingSchemaReview
            projectId={candidate.projectId}
            workspaceId={candidate.id}
            revision={candidate.revision}
            candidate={savedSchema.candidate}
            branch={candidate.targetBranch}
            pane={pane}
            inspectedSchema={authoring?.currentSchema ? inspectedSchema : undefined}
          />
        ) : subject === 'schema' ? (
          inspectedSchema
        ) : pane === 'rendered' ? (
          <WorkspaceRenderedReview
            candidate={candidate}
            review={comparisonReview}
            controller={controller}
            onModeChange={onModeChange}
          />
        ) : comparisonStatus ? (
          comparisonStatus
        ) : structureModel.rows.length > 0 &&
          (operations.length > 0 || structureModel.hasReplayContent) ? (
          <WorkspaceReviewStructureView
            activeRowId={activeStructureRow?.id ?? null}
            candidate={candidate}
            checks={checks}
            controller={controller}
            modifiedLabel={formatRelativeTime(controller.candidate.updatedAt)}
            modifiedOnly={false}
            onEditInCompose={() => onModeChange('compose')}
            onSelectRow={setSelectedStructureRowId}
            preparing={preparing}
            query=""
            rows={structureModel.rows}
            sourceLabel={materialLabel}
            model={structureModel}
            baselineStateDigest={authoring?.basis.baseDigest}
            showYaml={pane === 'yaml'}
            snapshotStatus={snapshotStatus}
          />
        ) : (
          <div className="py-12 text-center text-sm">
            <h2>
              {authoringReview
                ? 'No field-tree changes to display'
                : 'No structured changes are prepared yet'}
            </h2>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              {authoringReview
                ? 'Use YAML or Preview to inspect the saved Content.'
                : 'Add source evidence in Compose, then prepare Review to inspect the structure tree.'}
            </p>
            {committedId ? (
              <Button className="mt-4" size="sm" onClick={controller.viewCommit}>
                View in State
              </Button>
            ) : null}
          </div>
        )}
      </WorkspaceReviewWorkbench>
      {schemaPreparation ? (
        <SchemaContentPreparationDialog
          projectId={candidate.projectId}
          workspaceId={candidate.id}
          revision={schemaPreparation.revision}
          inspectedDraft={schemaPreparation}
          target={schemaPreparation.target}
          open
          onOpenChange={(open) => {
            if (!open) setSchemaPreparation(undefined);
          }}
          onPrepared={async () => {
            if (!reviewMounted.current) return;
            const savedDraft = await activity.loadLatest();
            if (!reviewMounted.current) return;
            if (!savedDraft) throw new Error('The saved Draft could not be loaded.');
            await controller.refreshFromServer(savedDraft.workspaceRevision);
            if (reviewMounted.current) setSchemaPreparation(undefined);
          }}
        />
      ) : null}
    </>
  );
}

function ReviewCheckList({
  checks,
  snapshotCurrent = false,
}: {
  checks: ReviewCheckView[];
  snapshotCurrent?: boolean;
}) {
  return (
    <section aria-label="Check summary">
      <ul className={workbenchStyles.checkList}>
        {checks.map((check) => (
          <li key={check.label}>
            <CheckStatusMark status={snapshotCurrent ? check.status : 'pending'} />
            <span>{check.label}</span>
            {snapshotCurrent ? (
              <CheckStatusBadge status={check.status} />
            ) : (
              <span>Not reviewed</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function WorkspaceReviewSummary({
  candidate,
  controller,
  snapshotStatus,
  hasChanges,
  preparingSchema,
  schemaLoading,
  hasSavedSchema,
  draftUnavailable,
  preparationError,
  onEdit,
  onOpenChecks,
  onPrepare,
}: {
  candidate: WorkspaceCandidate;
  controller: WorkspaceComposeReviewController;
  snapshotStatus: DraftSnapshotStatus;
  hasChanges: boolean | undefined;
  preparingSchema: boolean;
  schemaLoading: boolean;
  hasSavedSchema: boolean;
  draftUnavailable: boolean;
  preparationError?: string;
  onEdit: () => void;
  onOpenChecks: () => void;
  onPrepare: () => void;
}) {
  const snapshotCurrent = snapshotStatus === 'matching';
  const checks = getReviewChecks(controller);
  const preparing = preparingSchema || controller.busyAction === 'review.prepare';
  const status = preparing
    ? 'Preparing review…'
    : draftUnavailable
      ? 'Waiting for the saved Draft and its comparison baseline.'
      : hasChanges === false
        ? EMPTY_WORKSPACE_REVIEW
        : snapshotStatus === 'outdated'
          ? 'The previous snapshot does not cover the current Draft, branch base, or saved Schema.'
          : snapshotStatus === 'unknown'
            ? 'The previous snapshot could not yet be matched to this Draft.'
            : snapshotCurrent
              ? 'These checks apply to the fixed snapshot of this Draft.'
              : 'Prepare a fixed snapshot to approve and commit here.';
  return (
    <section aria-label="Review readiness" className={workbenchStyles.draftChecks}>
      <div>
        <h2>
          {preparing
            ? 'Preparing review'
            : snapshotCurrent
              ? 'Review prepared'
              : snapshotStatus === 'outdated'
                ? 'Previous snapshot outdated'
                : snapshotStatus === 'unknown'
                  ? 'Snapshot freshness unconfirmed'
                  : 'No fixed review selected'}
        </h2>
        <p aria-live="polite">{status}</p>
      </div>
      {hasSavedSchema ? (
        <p>
          Saved Schema changes will be included when preparing this review. Content adjustments may
          need confirmation.
        </p>
      ) : null}
      <ReviewCheckList checks={checks} snapshotCurrent={snapshotCurrent} />
      <p>
        Commit to <strong>{candidate.targetBranch || 'main'}</strong> after reviewing the fixed
        snapshot.
      </p>
      {preparationError ? (
        <div role="alert">
          <p>{preparationError}</p>
          <button type="button" className="underline" onClick={onEdit}>
            Continue editing
          </button>
        </div>
      ) : null}
      <div className={workbenchStyles.draftActions}>
        <Button
          size="sm"
          variant="commit"
          disabled={
            controller.isBusy ||
            preparing ||
            schemaLoading ||
            draftUnavailable ||
            hasChanges === false
          }
          onClick={onPrepare}
          type="button"
        >
          {preparing ? 'Preparing…' : 'Prepare review'}
        </Button>
        <Button size="sm" variant="canvas-outline" onClick={onOpenChecks} type="button">
          Open Run <ExternalLink aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

function WorkspaceSourceTools({ controller }: { controller: WorkspaceComposeReviewController }) {
  const candidate = controller.candidate;
  const [view, setView] = useState<WorkspaceYOpsFlowView>('ops');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const yamlSources = candidate.sourceBundle.filter(
    (source) =>
      source.materialId && (source.format === 'yaml' || /\.ya?ml$/i.test(source.fileName ?? ''))
  );
  const updateArtifact = async (artifact: WorkspaceCandidate['sourceArtifact']) => {
    setSaving(true);
    setError(null);
    try {
      await controller.updateSourceArtifact(artifact);
      setView('ops');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save source selection.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--surface-app)]">
      {yamlSources.map((source) => (
        <SourceArtifactRoleEditor
          artifact={candidate.sourceArtifact}
          key={`${source.materialId}:${candidate.sourceArtifact?.rootPath ?? ''}:${
            candidate.sourceArtifact?.resources.find(
              (resource) => resource.materialId === source.materialId
            )?.path ?? ''
          }`}
          materialId={source.materialId!}
          onChange={saving ? undefined : (artifact) => void updateArtifact(artifact)}
          source={source}
        />
      ))}
      {saving ? (
        <output className="px-4 py-2 text-xs text-[var(--text-secondary)]">
          Saving source selection…
        </output>
      ) : null}
      {error ? (
        <p className="px-4 py-2 text-xs text-[var(--status-error)]" role="alert">
          {error}
        </p>
      ) : null}
      {candidate.sourceArtifact?.root ? (
        <SourceTransitionTab
          active
          candidate={candidate}
          key={`${candidate.id}:${candidate.revision ?? 0}`}
          onViewChange={setView}
          view={view}
        />
      ) : (
        <output className="px-4 py-3 text-xs text-[var(--text-secondary)]">
          Choose a YAML material as the root configuration to review exact source changes.
        </output>
      )}
    </div>
  );
}

function ResultYamlPane({
  model,
  revision,
  changeCounts,
  branch,
  selectedRow,
  onSelectRow,
  preparing,
  snapshotStatus,
  validationReady,
}: {
  model: WorkspaceReviewStructureModel;
  revision?: number;
  changeCounts: { added: number; modified: number; removed: number };
  branch: string;
  selectedRow: WorkspaceReviewStructureRow | null;
  onSelectRow: (id: string) => void;
  preparing: boolean;
  snapshotStatus: DraftSnapshotStatus;
  validationReady: boolean;
}) {
  const lines = useMemo(() => buildStateYamlReview(model.baseline, model.head), [model]);
  const yamlText = useMemo(() => buildCanonicalStateYaml(model.head), [model.head]);
  const selectPath = useCallback(
    (path: string) => {
      const exact = model.rows.find((row) => row.path === path);
      const row =
        exact ??
        model.rows.reduce<WorkspaceReviewStructureRow | null>((nearest, entry) => {
          if (!path.startsWith(entry.path + '/')) return nearest;
          return !nearest || entry.path.length > nearest.path.length ? entry : nearest;
        }, null);
      if (row) onSelectRow(row.id);
    },
    [model.rows, onSelectRow]
  );
  const statusLabel = preparing
    ? 'Preparing fixed review…'
    : !model.hasReplayContent
      ? 'Base not verified'
      : {
          matching: 'Matches the prepared snapshot',
          outdated: 'Previous snapshot applies to a different version',
          unknown: 'Snapshot freshness unconfirmed',
          none: 'No fixed review selected',
        }[snapshotStatus];

  return (
    <WorkspaceReviewCodeView
      changeCounts={changeCounts}
      branch={branch}
      rootKey={revision === undefined ? 'workspace-draft' : `workspace-draft-r${revision}`}
      validationReady={validationReady}
      yamlText={yamlText}
      review={{
        lines,
        selectedPath: selectedRow?.path,
        onSelectPath: selectPath,
        statusLabel: `Saved Draft · ${statusLabel} · Field-tree projection`,
      }}
    />
  );
}

interface WorkspaceReviewStructureModel {
  baseline: SemanticContent;
  head: SemanticContent;
  hasReplayContent: boolean;
  rootKey: string;
  rows: WorkspaceReviewStructureRow[];
}

export interface WorkspaceReviewStructureRow extends StatePointRow {
  childCount?: number;
  collapseByDefault?: boolean;
  diff?: WorkspaceReviewDiffMeta;
  parentPath: string | null;
  removedFromParent?: boolean;
}

interface WorkspaceReviewDiffMeta {
  afterValue: string;
  beforeValue: string;
  count: number;
  evidence?: string;
  evidenceSource?: string;
  exact: boolean;
  kind: StructuredDiffKind;
  op: string;
  reason: string;
  summary: string;
}

type WorkspaceReviewDiffChange = StructuredDiffChange & { path: string };

function WorkspaceRenderedReview({
  candidate,
  review,
  controller,
  onModeChange,
}: {
  candidate: WorkspaceCandidate;
  review: WorkspaceComposeReviewController['review'];
  controller: WorkspaceComposeReviewController;
  onModeChange: (mode: WorkspaceSurfaceMode) => void;
}) {
  const structure = useMemo(
    () => buildWorkspaceReviewStructureModel(candidate, review),
    [candidate, review]
  );
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const selectedRow =
    structure.rows.find((row) => row.path === selectedPath) ??
    structure.rows.find((row) => !row.expandable) ??
    structure.rows[0] ??
    null;
  const selectedKind = selectedRow?.diff?.kind;
  const copyPath = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard)
      void navigator.clipboard.writeText(selectedRow?.path ?? '');
  };
  const revise = () => {
    controller.prefillAssistant(`Revise ${selectedRow?.path ?? ''}: `);
    onModeChange('compose');
  };
  return (
    <section aria-label="Rendered result">
      {controller.error ? <p role="alert">{controller.error}</p> : null}
      <WorkspaceReviewContentPreview
        value={{ domain: 't3x.dev/semantic-content', version: 1, content: structure.head }}
        onSelect={(path) => setSelectedPath(authoringSemanticPath(path) ?? path)}
      />
      <details className={workbenchStyles.selection}>
        <summary>Selected change · actions</summary>
        <section aria-label="Review details">
          <section aria-label="Selected section" className={reviewStyles.panel}>
            <header>
              <h2>
                <Pencil aria-hidden="true" /> Selected change
              </h2>
              <button onClick={copyPath} type="button">
                <Copy aria-hidden="true" /> Copy path
              </button>
            </header>
            <code className={reviewStyles.path}>
              {selectedRow?.path.split('/').join(' / ') ?? 'Current draft'}
            </code>
            <span className={reviewStyles.kind} data-kind={selectedKind}>
              {selectedRow ? workspaceReviewKindLabel(selectedRow) : 'Unchanged'}
            </span>
            <button className={reviewStyles.primary} onClick={revise} type="button">
              <Sparkles aria-hidden="true" /> Ask AI to revise
            </button>
          </section>
        </section>
      </details>
    </section>
  );
}

function CheckStatusMark({
  status,
  large = false,
}: {
  status: ReviewCheckStatus;
  large?: boolean;
}) {
  return (
    <span
      className={cn(
        checksStyles.statusMark,
        checksStyles[status],
        large && checksStyles.statusMarkLarge
      )}
    >
      {status === 'passed' ? (
        <Check aria-hidden="true" />
      ) : status === 'failed' ? (
        <X aria-hidden="true" />
      ) : (
        <CircleDot aria-hidden="true" />
      )}
    </span>
  );
}

function CheckStatusBadge({
  status,
  ready = false,
}: {
  status: ReviewCheckStatus;
  ready?: boolean;
}) {
  return (
    <span className={cn(checksStyles.statusBadge, checksStyles[status])}>
      {ready
        ? status === 'passed'
          ? 'Ready'
          : 'Not ready'
        : status === 'passed'
          ? 'Passed'
          : status === 'failed'
            ? 'Failed'
            : 'Pending'}
    </span>
  );
}

function WorkspaceReviewStructureView({
  activeRowId,
  candidate,
  checks,
  controller,
  modifiedLabel,
  modifiedOnly,
  onEditInCompose,
  onSelectRow,
  preparing,
  query,
  rows,
  sourceLabel,
  showYaml,
  model,
  snapshotStatus,
  baselineStateDigest,
}: {
  activeRowId: string | null;
  candidate: WorkspaceCandidate;
  checks: ReviewCheckView[];
  controller: WorkspaceComposeReviewController;
  modifiedLabel: string;
  modifiedOnly: boolean;
  onEditInCompose: () => void;
  onSelectRow: (rowId: string) => void;
  preparing: boolean;
  query: string;
  rows: WorkspaceReviewStructureRow[];
  sourceLabel: string;
  showYaml: boolean;
  model: WorkspaceReviewStructureModel;
  snapshotStatus: DraftSnapshotStatus;
  baselineStateDigest?: string;
}) {
  const changedRows = useMemo(() => rows.filter((row) => row.diff?.exact), [rows]);
  const selectedRow =
    (activeRowId ? rows.find((row) => row.id === activeRowId) : null) ??
    rows.find((row) => row.diff?.exact) ??
    rows.find((row) => row.diff) ??
    rows[0] ??
    null;
  const changeCounts = { added: 0, modified: 0, removed: 0 };
  for (const row of changedRows) changeCounts[row.diff!.kind] += 1;

  return (
    <section
      aria-label="Workspace review structure"
      className={cn(diffStyles.surface, diffStyles.reference)}
    >
      <div className={diffStyles.reviewBody}>
        <div className={diffStyles.mainColumn}>
          {!showYaml ? (
            <header className={diffStyles.toolbar}>
              <div className={diffStyles.diffHeading}>
                <h1>Structure diff</h1>
                <p>
                  <WorkspaceReviewBaseline
                    commitHash={candidate.baseCommitHash}
                    stateDigest={baselineStateDigest}
                    available={model.hasReplayContent}
                    empty={
                      model.baseline.trees.length === 0 && model.baseline.relations?.length === 0
                    }
                  />{' '}
                  compared with Workspace draft{' '}
                  <code>
                    {candidate.revision === undefined
                      ? 'revision unknown'
                      : `r${candidate.revision}`}
                  </code>
                </p>
              </div>
              <div className={diffStyles.counts}>
                <span className={diffStyles.added}>
                  <Plus aria-hidden="true" />
                  {changeCounts.added} added
                </span>
                <span className={diffStyles.modified}>
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M4 12c4-4 4 4 8 0s4 4 8 0" />
                  </svg>
                  {changeCounts.modified} modified
                </span>
                <span className={diffStyles.removed}>
                  <Minus aria-hidden="true" />
                  {changeCounts.removed} removed
                </span>
              </div>
            </header>
          ) : null}
          {showYaml ? (
            <ResultYamlPane
              changeCounts={changeCounts}
              branch={candidate.targetBranch}
              model={model}
              revision={candidate.revision}
              onSelectRow={onSelectRow}
              preparing={preparing}
              selectedRow={selectedRow}
              snapshotStatus={snapshotStatus}
              validationReady={
                snapshotStatus === 'matching' &&
                checks.some(
                  (check) => check.label === 'Schema validation' && check.status === 'passed'
                )
              }
            />
          ) : (
            <WorkspaceReviewStructureTree
              reference
              activeRowId={selectedRow?.id ?? null}
              modifiedLabel={modifiedLabel}
              modifiedOnly={modifiedOnly}
              onSelectRow={onSelectRow}
              query={query}
              rows={rows}
            />
          )}
        </div>
        <details className={workbenchStyles.selection}>
          <summary>Selected change · source and actions</summary>
          <WorkspaceReviewNodeInspector
            candidate={candidate}
            controller={controller}
            onEditInCompose={onEditInCompose}
            selectedRow={selectedRow}
            sourceLabel={sourceLabel}
          />
        </details>
      </div>
    </section>
  );
}

function ReviewDiffColumns() {
  return (
    <>
      <colgroup>
        <col style={{ width: '40%' }} />
        <col style={{ width: '30%' }} />
        <col style={{ width: '30%' }} />
      </colgroup>
      <thead>
        <tr>
          <th>Field</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
    </>
  );
}

export function WorkspaceReviewStructureTree({
  reference = false,
  activeRowId,
  expansionRequest,
  modifiedLabel,
  modifiedOnly = false,
  onSelectRow,
  query = '',
  rows,
}: {
  reference?: boolean;
  activeRowId: string | null;
  expansionRequest?: { id: number; mode: 'all' | 'none' } | null;
  modifiedLabel: string;
  modifiedOnly?: boolean;
  onSelectRow: (rowId: string) => void;
  query?: string;
  rows: WorkspaceReviewStructureRow[];
}) {
  const [expansionOverrides, setExpansionOverrides] = useState<Record<string, boolean>>({});
  const filtering = query.trim().length > 0 || modifiedOnly;
  const visibleRows = useMemo(() => {
    if (filtering) return filterWorkspaceReviewStructureRows(rows, query, modifiedOnly);
    return filterCollapsedWorkspaceReviewRows(rows, (row) =>
      isWorkspaceReviewRowExpanded(row, expansionOverrides)
    );
  }, [expansionOverrides, filtering, modifiedOnly, query, rows]);
  const toggleRow = useCallback((row: WorkspaceReviewStructureRow) => {
    setExpansionOverrides((current) => ({
      ...current,
      [row.id]: !isWorkspaceReviewRowExpanded(row, current),
    }));
  }, []);
  useEffect(() => {
    if (!expansionRequest) return;
    setExpansionOverrides(
      Object.fromEntries(
        rows.filter((row) => row.expandable).map((row) => [row.id, expansionRequest.mode === 'all'])
      )
    );
  }, [expansionRequest, rows]);

  const table = (
    <table
      className={cn(diffStyles.tree, reference ? diffStyles.referenceTree : diffStyles.historyTree)}
    >
      {reference ? (
        <ReviewDiffColumns />
      ) : (
        <>
          <colgroup>
            <col className="w-[29%]" />
            <col className="w-[34%]" />
            <col />
            <col className="w-[108px]" />
          </colgroup>
          <thead className={diffStyles.treeHeader}>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Value</th>
              <th scope="col">Auto-generated summary</th>
              <th scope="col">Commit date</th>
            </tr>
          </thead>
        </>
      )}
      <tbody>
        {visibleRows.map((row) => (
          <WorkspaceReviewStructureTableRow
            reference={reference}
            expanded={filtering || isWorkspaceReviewRowExpanded(row, expansionOverrides)}
            key={row.id}
            modifiedLabel={modifiedLabel}
            onSelect={() => onSelectRow(row.id)}
            onToggle={() => toggleRow(row)}
            row={row}
            selected={activeRowId === row.id}
          />
        ))}
      </tbody>
    </table>
  );
  return reference ? (
    <section className={diffStyles.treePane} aria-label="Workspace structure rows">
      {table}
    </section>
  ) : (
    <StateScrollArea horizontal className={diffStyles.treePane} label="Structure diff rows">
      {table}
    </StateScrollArea>
  );
}

function WorkspaceReviewStructureTableRow({
  reference,
  expanded,
  modifiedLabel,
  onSelect,
  onToggle,
  row,
  selected,
}: {
  reference?: boolean;
  expanded: boolean;
  modifiedLabel: string;
  onSelect: () => void;
  onToggle: () => void;
  row: WorkspaceReviewStructureRow;
  selected: boolean;
}) {
  return (
    <tr
      aria-selected={selected}
      className={cn(
        'group cursor-pointer text-[var(--text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]/45',
        diffStyles.treeRow,
        row.expandable && diffStyles.parentRow,
        row.diff?.exact && row.diff.kind === 'modified' && diffStyles.modifiedRow,
        selected && diffStyles.selectedRow
      )}
      data-parent={row.expandable ? 'true' : undefined}
      data-diff-exact={row.diff?.exact ? 'true' : undefined}
      data-diff-kind={row.diff?.kind}
      data-selected={selected ? 'true' : undefined}
      onClick={() => {
        onSelect();
        if (row.expandable) onToggle();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onSelect();
        if (row.expandable) onToggle();
      }}
      tabIndex={0}
    >
      <td className="sticky left-0 z-10 border-b border-[var(--stroke-divider)] bg-inherit py-0 pl-[18px] pr-4">
        <span
          className={diffStyles.fieldCell}
          style={{
            backgroundImage:
              row.depth > 0 && !reference
                ? 'repeating-linear-gradient(to right, transparent 0 9px, var(--stroke-default) 9px 10px, transparent 10px 28px)'
                : undefined,
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${String(row.depth * (reference ? 20 : 28))}px 100%`,
            paddingLeft: row.depth * (reference ? 20 : 28),
          }}
        >
          {row.depth > 0 ? (
            <span
              aria-hidden="true"
              className={diffStyles.treeElbow}
              style={{ left: row.depth * (reference ? 20 : 28) - 18 }}
            />
          ) : null}
          {row.expandable ? (
            <button
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${row.key}`}
              className="-m-1 inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40"
              onClick={(event) => {
                event.stopPropagation();
                onSelect();
                onToggle();
              }}
              type="button"
            >
              {expanded ? (
                <ChevronDown aria-hidden="true" className="size-4" />
              ) : (
                <ChevronRight aria-hidden="true" className="size-4" />
              )}
            </button>
          ) : null}
          {reference && !row.expandable ? (
            <FileText aria-hidden="true" className={diffStyles.scalarIcon} />
          ) : null}
          {row.expandable ? (
            <BoxIcon
              aria-hidden="true"
              className={cn('size-4 shrink-0', diffStyles.objectIcon)}
              strokeWidth={2}
            />
          ) : null}
          <span
            className={cn(
              diffStyles.fieldKey,
              row.expandable && diffStyles.parentKey,
              workspaceReviewMachineKey(row.key) && diffStyles.machineKey
            )}
            title={row.path}
          >
            {row.key}
          </span>
        </span>
      </td>
      {reference ? (
        <>
          <td className={diffStyles.referenceValue}>
            {row.diff?.exact && row.diff.kind === 'added' ? (
              <span className={diffStyles.empty}>—</span>
            ) : row.expandable && !row.diff?.exact ? (
              ''
            ) : row.diff?.exact ? (
              <del>{row.diff.beforeValue}</del>
            ) : row.value === '-' ? (
              <span className={diffStyles.empty}>empty</span>
            ) : (
              row.value
            )}
          </td>
          <td className={diffStyles.referenceValue}>
            {row.diff?.exact && row.diff.kind === 'removed' ? (
              <span className={diffStyles.empty}>—</span>
            ) : row.expandable && !row.diff?.exact ? (
              ''
            ) : row.diff?.exact ? (
              <ins>{row.diff.afterValue}</ins>
            ) : row.value === '-' ? (
              <span className={diffStyles.empty}>empty</span>
            ) : (
              row.value
            )}
          </td>
        </>
      ) : (
        <>
          <td className={diffStyles.valueCell}>
            <WorkspaceReviewValueCell row={row} />
          </td>
          <td className={diffStyles.summaryCell}>{row.diff?.summary ?? '—'}</td>
          <td className={diffStyles.changedCell}>{row.diff?.exact ? modifiedLabel : '—'}</td>
        </>
      )}
    </tr>
  );
}

function WorkspaceReviewValueCell({ row }: { row: WorkspaceReviewStructureRow }) {
  if (row.diff?.exact && row.diff.kind === 'modified') {
    return (
      <span className={diffStyles.changedValue}>
        <WorkspaceReviewDiffMarker kind={row.diff.kind} />
        <span className={diffStyles.valueStack}>
          <span className={cn(diffStyles.valueLine, diffStyles.before)}>
            {row.diff.beforeValue}
          </span>
          <span className={cn(diffStyles.valueLine, diffStyles.after)}>{row.diff.afterValue}</span>
        </span>
      </span>
    );
  }
  if (row.diff?.exact && row.diff.kind === 'removed') {
    return (
      <span className={diffStyles.changedValue}>
        <WorkspaceReviewDiffMarker kind={row.diff.kind} />
        <span className={cn(diffStyles.valueLine, diffStyles.before)}>{row.diff.beforeValue}</span>
      </span>
    );
  }
  if (row.diff?.exact && row.diff.kind === 'added') {
    return (
      <span className={diffStyles.changedValue}>
        <WorkspaceReviewDiffMarker kind={row.diff.kind} />
        <span className={cn(diffStyles.valueLine, diffStyles.after)}>{row.diff.afterValue}</span>
      </span>
    );
  }
  return (
    <span className={diffStyles.plainValue} title={row.value}>
      {row.value === '-' ? '' : row.value}
    </span>
  );
}

function WorkspaceReviewDiffMarker({ kind }: { kind: StructuredDiffKind }) {
  return (
    <span aria-hidden="true" className={cn(diffStyles.diffMarker, diffStyles[kind])}>
      {kind === 'modified' ? (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M4 12c4-4 4 4 8 0s4 4 8 0" />
        </svg>
      ) : kind === 'added' ? (
        <Plus />
      ) : (
        <Minus />
      )}
    </span>
  );
}

function WorkspaceReviewNodeInspector({
  candidate,
  controller,
  onEditInCompose,
  selectedRow,
  sourceLabel,
}: {
  candidate: WorkspaceCandidate;
  controller: WorkspaceComposeReviewController;
  onEditInCompose: () => void;
  selectedRow: WorkspaceReviewStructureRow | null;
  sourceLabel: string;
}) {
  const source = selectedRow
    ? workspaceReviewSourceDisplay(candidate, selectedRow, sourceLabel)
    : { href: null, label: sourceLabel };
  return (
    <aside aria-label="Workspace selected change" className={diffStyles.inspector}>
      <WorkspaceReviewChangeReviewPanel
        controller={controller}
        onEditInCompose={onEditInCompose}
        row={selectedRow}
        source={source}
      />
    </aside>
  );
}

function WorkspaceReviewChangeReviewPanel({
  controller,
  onEditInCompose,
  row,
  source,
}: {
  controller: WorkspaceComposeReviewController;
  onEditInCompose: () => void;
  row: WorkspaceReviewStructureRow | null;
  source: { href: string | null; label: string };
}) {
  if (!row) {
    return <div className={diffStyles.card}>No state point selected.</div>;
  }
  const beforeValue = workspaceReviewBeforeValue(row);
  const resultValue = workspaceReviewResultValue(row);
  const revise = () => {
    controller.prefillAssistant(`Revise ${row.path}: `);
    onEditInCompose();
  };
  const copyPath = () => {
    if (navigator.clipboard) void navigator.clipboard.writeText(row.path);
  };

  return (
    <section className={diffStyles.card} aria-label="Selected change">
      <header className={diffStyles.cardHeader}>
        <h2>Selected change</h2>
        <button className={diffStyles.copyButton} onClick={copyPath} type="button">
          <Copy aria-hidden="true" className="size-3.5" /> Copy path
        </button>
      </header>
      <div className={diffStyles.changeContent}>
        <code className={diffStyles.path} title={row.path}>
          {row.path.split('/').filter(Boolean).join('.')}
        </code>
        <span
          className={cn(
            diffStyles.badge,
            workspaceReviewDiffBadgeClass(row.diff?.kind ?? 'modified')
          )}
        >
          {workspaceReviewDiffSymbol(row.diff?.kind ?? 'modified')} {workspaceReviewKindLabel(row)}
        </span>
        <div className={diffStyles.field}>
          <span className={diffStyles.fieldLabel}>Before</span>
          <div className={cn(diffStyles.fieldValue, diffStyles.before)}>{beforeValue}</div>
        </div>
        <div className={diffStyles.field}>
          <span className={diffStyles.fieldLabel}>After</span>
          <div className={cn(diffStyles.fieldValue, diffStyles.after)}>{resultValue}</div>
        </div>
        <p className={diffStyles.why}>
          <strong>Why</strong>
          {workspaceReviewEffectText(row)}
        </p>
        <span className={diffStyles.fieldLabel}>Source</span>
        {source.href ? (
          <NextLink className={diffStyles.source} href={source.href}>
            <FileText aria-hidden="true" className="size-4 shrink-0 text-[var(--source)]" />
            <span>{source.label}</span>
          </NextLink>
        ) : (
          <div className={diffStyles.source}>
            <FileText aria-hidden="true" className="size-4 shrink-0 text-[var(--source)]" />
            <span>{source.label}</span>
          </div>
        )}
        <button className={diffStyles.revise} onClick={revise} type="button">
          <Sparkles aria-hidden="true" className="size-4" /> Ask AI to revise
        </button>
      </div>
    </section>
  );
}

interface ReviewCheckView {
  detail: string;
  label: string;
  requirement: 'required' | 'system';
  status: ReviewCheckStatus;
}

function buildWorkspaceReviewStructureModel(
  candidate: WorkspaceCandidate,
  review: WorkspaceComposeReviewController['review']
): WorkspaceReviewStructureModel {
  const content = buildWorkspaceReviewContent(candidate, review);
  const operations = workspaceDraftOperationsToStateOperations(candidate.yopsDraft.operations);
  const rows = buildStatePointRows(content.head, {
    gaps: candidate.schemaReview.gaps.map((path) => ({ path })),
    operations,
  });
  const hasReplayContent = Boolean(
    review.deterministicValidation?.baselineTrees &&
      (review.content?.trees || review.deterministicValidation?.previewTrees)
  );
  const diffChanges = hasReplayContent
    ? buildStructuredStateDiff({
        baseline: content.baseline,
        head: content.head,
        includeEmptyArrayParent: true,
        workspace: candidate,
      })
    : [];

  return {
    baseline: content.baseline,
    head: content.head,
    hasReplayContent: Boolean(
      review.deterministicValidation?.baselineTrees &&
        (review.content?.trees || review.deterministicValidation?.previewTrees)
    ),
    rootKey: content.rootKey,
    rows: buildWorkspaceReviewStructureRows(rows, diffChanges),
  };
}

function buildWorkspaceReviewContent(
  candidate: WorkspaceCandidate,
  review: WorkspaceComposeReviewController['review']
): { baseline: SemanticContent; head: SemanticContent; rootKey: string } {
  const rootKey = workspaceReviewRootKey(candidate);
  const validation = review.deterministicValidation;
  const reviewContent = review.content;
  if (validation?.baselineTrees && (reviewContent?.trees || validation.previewTrees)) {
    return {
      baseline: workspaceReviewSemanticContent(
        validation.baselineTrees,
        validation.baselineRelations
      ),
      head: workspaceReviewSemanticContent(
        reviewContent?.trees ?? validation.previewTrees ?? validation.baselineTrees,
        reviewContent?.relations ?? validation.previewRelations ?? validation.baselineRelations
      ),
      rootKey,
    };
  }

  return buildWorkspaceDraftReviewContent(candidate, rootKey);
}

interface WorkspaceReviewTreeNode {
  children: WorkspaceReviewTreeNode[];
  key: string;
  slots: Record<string, unknown>;
}

function buildWorkspaceDraftReviewContent(
  candidate: WorkspaceCandidate,
  rootKey: string
): { baseline: SemanticContent; head: SemanticContent; rootKey: string } {
  const baselineRoot = workspaceReviewRootNode(rootKey, candidate.title);
  const headRoot = workspaceReviewRootNode(rootKey, candidate.title);

  for (const field of candidate.schemaCandidate.fields) {
    addWorkspaceReviewField(baselineRoot, field);
    addWorkspaceReviewField(headRoot, field);
  }

  for (const operation of candidate.yopsDraft.operations) {
    applyWorkspaceReviewOperation(baselineRoot, headRoot, operation);
  }

  return {
    baseline: workspaceReviewSemanticContent([baselineRoot], []),
    head: workspaceReviewSemanticContent([headRoot], []),
    rootKey,
  };
}

function workspaceReviewSemanticContent(trees: unknown[], relations: unknown[]): SemanticContent {
  return { relations, trees } as SemanticContent;
}

function workspaceReviewRootNode(rootKey: string, title: string): WorkspaceReviewTreeNode {
  return {
    children: [],
    key: rootKey,
    slots: title.trim() ? { title } : {},
  };
}

function addWorkspaceReviewField(
  root: WorkspaceReviewTreeNode,
  field: WorkspaceSchemaCandidateField
) {
  const path = normalizeWorkspaceReviewPath(field.path, root.key);
  const segments = path.split('/').filter(Boolean);
  if (segments.length < 2) return;

  const hasChildren = Boolean(field.children?.length);
  const parentSegments = hasChildren ? segments : segments.slice(0, -1);
  ensureWorkspaceReviewPath(root, parentSegments.slice(1));

  if (!hasChildren && field.status !== 'missing') {
    const value = field.value ?? '';
    setWorkspaceReviewSlot(root, path, value);
  }

  for (const child of field.children ?? []) addWorkspaceReviewField(root, child);
}

function applyWorkspaceReviewOperation(
  baselineRoot: WorkspaceReviewTreeNode,
  headRoot: WorkspaceReviewTreeNode,
  operation: WorkspaceYOpsDraftOperation
) {
  const normalizedPath = normalizeWorkspaceReviewPath(operation.path, headRoot.key);
  const targetPath = normalizedPath.replace(/\/-$/, '');
  const appendsToArray = normalizedPath.endsWith('/-') || /^(add|append)$/i.test(operation.op);
  const removesValue = isRemovalOperation(operation.op);

  if (removesValue) {
    setWorkspaceReviewSlot(baselineRoot, targetPath, operation.beforeValue ?? operation.summary);
    deleteWorkspaceReviewSlot(headRoot, targetPath);
    return;
  }

  if (
    operation.beforeValue === undefined ||
    isEmptyWorkspaceReviewBaseline(operation.beforeValue)
  ) {
    deleteWorkspaceReviewSlot(baselineRoot, targetPath);
  } else if (appendsToArray) {
    setWorkspaceReviewSlot(baselineRoot, targetPath, workspaceReviewArrayBaseline(operation));
  } else {
    setWorkspaceReviewSlot(baselineRoot, targetPath, operation.beforeValue);
  }

  const resultValue = operation.afterValue ?? operation.summary;
  if (appendsToArray) {
    const baselineItems = workspaceReviewArrayBaseline(operation);
    setWorkspaceReviewSlot(headRoot, targetPath, [...baselineItems, resultValue]);
    return;
  }

  setWorkspaceReviewSlot(headRoot, targetPath, resultValue);
}

function workspaceReviewArrayBaseline(
  operation: WorkspaceYOpsDraftOperation
): WorkspaceYOpsValue[] {
  const beforeValue = operation.beforeValue;
  if (beforeValue === undefined || isEmptyWorkspaceReviewBaseline(beforeValue)) return [];
  return Array.isArray(beforeValue) ? beforeValue : [beforeValue];
}

function ensureWorkspaceReviewPath(
  root: WorkspaceReviewTreeNode,
  segments: string[]
): WorkspaceReviewTreeNode {
  let node = root;
  for (const segment of segments) {
    node = ensureWorkspaceReviewChild(node, segment);
  }
  return node;
}

function ensureWorkspaceReviewChild(
  node: WorkspaceReviewTreeNode,
  key: string
): WorkspaceReviewTreeNode {
  const existing = node.children.find((child) => child.key === key);
  if (existing) return existing;
  const child = { children: [], key, slots: {} };
  node.children.push(child);
  return child;
}

function setWorkspaceReviewSlot(
  root: WorkspaceReviewTreeNode,
  path: string,
  value: WorkspaceYOpsValue
) {
  const segments = path.split('/').filter(Boolean);
  if (segments[0] !== root.key || segments.length < 2) return;
  const slotKey = segments.at(-1);
  if (!slotKey) return;
  const node = ensureWorkspaceReviewPath(root, segments.slice(1, -1));
  node.slots[slotKey] = value;
}

function deleteWorkspaceReviewSlot(root: WorkspaceReviewTreeNode, path: string) {
  const segments = path.split('/').filter(Boolean);
  if (segments[0] !== root.key || segments.length < 2) return;
  const slotKey = segments.at(-1);
  if (!slotKey) return;
  const node = ensureWorkspaceReviewPath(root, segments.slice(1, -1));
  delete node.slots[slotKey];
}

function isEmptyWorkspaceReviewBaseline(value: WorkspaceYOpsValue): boolean {
  if (value === null) return true;
  if (typeof value === 'string') return !value.trim() || /^no\b/i.test(value);
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

export function buildWorkspaceReviewStructureRows(
  rows: StatePointRow[],
  diffChanges: StructuredDiffChange[]
): WorkspaceReviewStructureRow[] {
  const normalizedChanges: WorkspaceReviewDiffChange[] = [];
  const addChange = (change: StructuredDiffChange) => {
    normalizedChanges.push({
      ...change,
      path: normalizeWorkspaceReviewStructurePath(change.structurePath ?? change.path),
    });
    change.children?.forEach(addChange);
  };
  diffChanges.forEach(addChange);
  const baseRows = rows.map((row) => ({
    ...row,
    parentPath: parentWorkspaceReviewPath(row.path),
  }));
  const rowsWithRemoved = insertRemovedWorkspaceReviewRows(baseRows, normalizedChanges);
  const annotatedRows = annotateWorkspaceReviewRowsWithDiff(rowsWithRemoved, normalizedChanges);
  return annotateWorkspaceReviewChildCounts(annotatedRows);
}

function insertRemovedWorkspaceReviewRows(
  rows: WorkspaceReviewStructureRow[],
  diffChanges: WorkspaceReviewDiffChange[]
): WorkspaceReviewStructureRow[] {
  const existingIds = new Set(rows.map((row) => row.id));
  const rowByPath = new Map(rows.map((row) => [row.path, row]));
  const removedRowsByParent = new Map<string | null, WorkspaceReviewStructureRow[]>();

  diffChanges.forEach((change, index) => {
    if (change.kind !== 'removed' || rowByPath.has(change.path)) return;
    const parentPath = nearestWorkspaceReviewParentPath(change.path, rowByPath);
    const parentRow = parentPath ? rowByPath.get(parentPath) : undefined;
    const key = change.path.split('/').filter(Boolean).at(-1) ?? change.path;
    const removedRow: WorkspaceReviewStructureRow = {
      depth: parentRow ? parentRow.depth + 1 : 0,
      expandable: false,
      id: `removed:${change.path}:${String(index)}`,
      issueCount: 0,
      key,
      parentPath,
      path: change.path,
      removedFromParent: true,
      sourceOp: change.op,
      status: 'changed',
      statusLabel: 'removed',
      type: 'removed',
      value: change.beforeValue,
      diff: workspaceReviewDiffMeta(change, true),
    };
    if (existingIds.has(removedRow.id)) return;
    existingIds.add(removedRow.id);
    const siblings = removedRowsByParent.get(parentPath) ?? [];
    siblings.push(removedRow);
    removedRowsByParent.set(parentPath, siblings);
  });

  if (removedRowsByParent.size === 0) return rows;

  const result: WorkspaceReviewStructureRow[] = [];
  for (const row of rows) {
    result.push(row);
    const removedChildren = removedRowsByParent.get(row.path);
    if (removedChildren) result.push(...removedChildren);
  }

  const detachedRemovedRows = removedRowsByParent.get(null);
  if (detachedRemovedRows) result.push(...detachedRemovedRows);
  return result;
}

function annotateWorkspaceReviewRowsWithDiff(
  rows: WorkspaceReviewStructureRow[],
  diffChanges: WorkspaceReviewDiffChange[]
): WorkspaceReviewStructureRow[] {
  const exactChangeByPath = new Map<string, WorkspaceReviewDiffChange>();
  for (const change of diffChanges) {
    if (!exactChangeByPath.has(change.path)) exactChangeByPath.set(change.path, change);
  }

  return rows.map((row) => {
    const exactChange = row.diff ? null : exactChangeByPath.get(row.path);
    if (exactChange) return { ...row, diff: workspaceReviewDiffMeta(exactChange, true) };
    if (row.diff) return row;

    const addedParent = diffChanges.find(
      (change) => change.kind === 'added' && row.path.startsWith(`${change.path}/`)
    );
    if (addedParent)
      return {
        ...row,
        diff: {
          ...workspaceReviewDiffMeta(addedParent, true),
          beforeValue: '—',
          afterValue: row.value,
        },
      };

    const childChanges = diffChanges.filter((change) => change.path.startsWith(`${row.path}/`));
    if (childChanges.length === 0) return row;
    return { ...row, diff: aggregateWorkspaceReviewDiffMeta(childChanges) };
  });
}

function annotateWorkspaceReviewChildCounts(
  rows: WorkspaceReviewStructureRow[]
): WorkspaceReviewStructureRow[] {
  const childCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.parentPath) continue;
    childCounts.set(row.parentPath, (childCounts.get(row.parentPath) ?? 0) + 1);
  }
  return rows.map((row) => ({
    ...row,
    childCount: childCounts.get(row.path),
  }));
}

function workspaceReviewDiffMeta(
  change: WorkspaceReviewDiffChange,
  exact: boolean
): WorkspaceReviewDiffMeta {
  return {
    afterValue: change.afterValue,
    beforeValue: change.beforeValue,
    count: 1,
    evidence: change.evidence,
    evidenceSource: change.evidenceSource,
    exact,
    kind: change.kind,
    op: change.op,
    reason: change.reason,
    summary: change.summary,
  };
}

function aggregateWorkspaceReviewDiffMeta(
  changes: WorkspaceReviewDiffChange[]
): WorkspaceReviewDiffMeta {
  const kind = aggregateWorkspaceReviewDiffKind(changes);
  return {
    afterValue: '',
    beforeValue: '',
    count: changes.length,
    evidence: aggregateWorkspaceReviewValue(changes.map((change) => change.evidence)),
    evidenceSource: aggregateWorkspaceReviewValue(changes.map((change) => change.evidenceSource)),
    exact: false,
    kind,
    op: '',
    reason: '',
    summary: `${String(changes.length)} changed path${changes.length === 1 ? '' : 's'}`,
  };
}

function aggregateWorkspaceReviewDiffKind(
  changes: WorkspaceReviewDiffChange[]
): StructuredDiffKind {
  const kinds = new Set(changes.map((change) => change.kind));
  if (kinds.size === 1) return changes[0]?.kind ?? 'modified';
  return 'modified';
}

function filterWorkspaceReviewStructureRows(
  rows: WorkspaceReviewStructureRow[],
  query: string,
  modifiedOnly: boolean
): WorkspaceReviewStructureRow[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized && !modifiedOnly) return rows;

  const rowById = new Map(rows.map((row) => [row.id, row]));
  const includedIds = new Set<string>();
  for (const row of rows) {
    const matchesQuery =
      !normalized ||
      [row.path, row.key, row.type, row.value, row.statusLabel].some((value) =>
        value.toLowerCase().includes(normalized)
      );
    const matchesChange = !modifiedOnly || Boolean(row.diff);
    if (!matchesQuery || !matchesChange) continue;

    includedIds.add(row.id);
    let ancestorPath = row.parentPath;
    while (ancestorPath) {
      includedIds.add(ancestorPath);
      ancestorPath = rowById.get(ancestorPath)?.parentPath ?? null;
    }
  }

  return rows.filter((row) => includedIds.has(row.id));
}

function filterCollapsedWorkspaceReviewRows(
  rows: WorkspaceReviewStructureRow[],
  isExpanded: (row: WorkspaceReviewStructureRow) => boolean
): WorkspaceReviewStructureRow[] {
  const rowById = new Map(rows.map((row) => [row.id, row]));
  return rows.filter((row) => {
    let ancestorPath = row.parentPath;
    while (ancestorPath) {
      const ancestor = rowById.get(ancestorPath);
      if (ancestor?.expandable && !isExpanded(ancestor)) return false;
      ancestorPath = ancestor?.parentPath ?? null;
    }
    return true;
  });
}

function isWorkspaceReviewRowExpanded(
  row: WorkspaceReviewStructureRow,
  overrides: Record<string, boolean>
): boolean {
  if (overrides[row.id] !== undefined) return overrides[row.id];
  if (row.collapseByDefault) return false;
  return row.depth < 2 || Boolean(row.diff);
}

function nearestWorkspaceReviewParentPath(
  path: string,
  rowByPath: Map<string, WorkspaceReviewStructureRow>
): string | null {
  let parentPath = parentWorkspaceReviewPath(path);
  while (parentPath) {
    if (rowByPath.has(parentPath)) return parentPath;
    parentPath = parentWorkspaceReviewPath(parentPath);
  }
  return null;
}

function parentWorkspaceReviewPath(path: string): string | null {
  const separatorIndex = path.lastIndexOf('/');
  return separatorIndex < 0 ? null : path.slice(0, separatorIndex);
}

function normalizeWorkspaceReviewStructurePath(path: string): string {
  return path
    .trim()
    .replace(/^\/+/, '')
    .replace(/\.+/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '');
}

function normalizeWorkspaceReviewPath(path: string, rootKey: string): string {
  const segments = path
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/$/, '')
    .split(/[./]+/)
    .map((segment) => toWorkspaceReviewKey(segment))
    .filter(Boolean);
  if (segments[0] === rootKey) return segments.join('/');
  return [rootKey, ...segments].join('/');
}

function workspaceReviewRootKey(candidate: WorkspaceCandidate): string {
  const primary = candidate.schemaBindings[0];
  const canonicalName = primary?.canonicalName?.trim().toLowerCase();
  if (canonicalName === 't3x/esphome-device') return 'device';
  if (canonicalName) return toWorkspaceReviewKey(canonicalName.split('/').at(-1) ?? 'candidate');

  const primaryName = primary?.schemaName.replace(/\s+Schema$/i, '') ?? 'candidate';
  if (/esphome\s+device/i.test(primaryName)) return 'device';
  return toWorkspaceReviewKey(primaryName);
}

function toWorkspaceReviewKey(value: string): string {
  return (
    value
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '_')
      .replace(/-+/g, '_')
      .replace(/^_+|_+$/g, '') || 'field'
  );
}

function _workspaceReviewDiffGutterClass(kind: StructuredDiffKind): string {
  if (kind === 'added') return 'bg-[var(--diff-added-accent)]';
  if (kind === 'removed') return 'bg-[var(--diff-removed-accent)]';
  return 'bg-[var(--diff-modified-accent)]';
}

function workspaceReviewDiffBadgeClass(kind: StructuredDiffKind): string {
  if (kind === 'added') {
    return 'border border-[var(--diff-added-border)] bg-[var(--diff-added-bg)] text-[var(--diff-added-text)]';
  }
  if (kind === 'removed') {
    return 'border border-[var(--diff-removed-border)] bg-[var(--diff-removed-bg)] text-[var(--diff-removed-text)]';
  }
  return 'border border-[var(--diff-modified-border)] bg-[var(--diff-modified-bg)] text-[var(--diff-modified-text)]';
}

function _workspaceReviewDiffTextClass(kind: StructuredDiffKind): string {
  if (kind === 'added') return 'text-[var(--diff-added-text)]';
  if (kind === 'removed') return 'text-[var(--diff-removed-text)]';
  return 'text-[var(--diff-modified-text)]';
}

function workspaceReviewDiffSymbol(kind: StructuredDiffKind): string {
  if (kind === 'added') return '+';
  if (kind === 'removed') return '\u2212';
  return '~';
}

function _workspaceReviewDiffOperationLabel(
  diff: WorkspaceReviewDiffMeta,
  sourceOp: string
): string {
  const operation = sourceOp === '-' ? diff.op : sourceOp;
  if (operation) return operation;
  if (diff.kind === 'added') return 'ADD';
  if (diff.kind === 'removed') return 'REMOVE';
  return 'SET';
}

function workspaceReviewMachineKey(value: string): boolean {
  return value.includes('_') || value.includes('/') || /\d/.test(value);
}

function workspaceReviewBeforeValue(row: WorkspaceReviewStructureRow): string {
  if (!row.diff?.exact) return workspaceReviewCurrentValue(row);
  if (row.diff.kind === 'added') return 'No parent value';
  return row.diff.beforeValue || 'No parent value';
}

function workspaceReviewResultValue(row: WorkspaceReviewStructureRow): string {
  if (!row.diff?.exact) return workspaceReviewCurrentValue(row);
  if (row.diff.kind === 'removed') return 'No value recorded';
  return row.diff.afterValue || workspaceReviewCurrentValue(row);
}

function workspaceReviewCurrentValue(row: WorkspaceReviewStructureRow): string {
  if (row.value && row.value !== '-') return row.value;
  return `${row.type} node`;
}

function workspaceReviewKindLabel(row: WorkspaceReviewStructureRow): string {
  if (row.diff?.kind === 'added') return 'Added';
  if (row.diff?.kind === 'removed') return 'Removed';
  if (row.diff?.kind === 'modified') return 'Modified';
  if (row.status === 'missing') return 'Missing';
  return row.statusLabel;
}

function workspaceReviewEffectText(row: WorkspaceReviewStructureRow): string {
  if (row.diff?.exact) return row.diff.reason || row.diff.summary;
  if (row.diff) return row.diff.summary;
  if (row.status === 'missing') return row.statusLabel;
  if (row.status !== 'unchanged') return row.statusLabel;
  return 'No direct draft effect recorded for this state path.';
}

function workspaceReviewSourceDisplay(
  candidate: WorkspaceCandidate,
  row: WorkspaceReviewStructureRow,
  fallbackLabel: string
): { href: string | null; label: string } {
  const operation = findWorkspaceReviewOperation(candidate.yopsDraft.operations, row.path);
  const sourceRef = operation?.sourceRefs?.[0];
  const source = findWorkspaceReviewSource(candidate.sourceBundle, sourceRef);
  const label =
    source?.fileName ??
    source?.title ??
    row.diff?.evidenceSource ??
    sourceRef ??
    'No source material linked';

  return {
    href: workspaceReviewSourceHref(candidate, source, sourceRef ?? fallbackLabel),
    label,
  };
}

function workspaceReviewSourceHref(
  candidate: WorkspaceCandidate,
  source: SourceBundleItem | undefined,
  sourceRef: string | undefined
): string | null {
  const conversationId =
    source?.conversationId ??
    (source?.type === 'chat' ? normalizeWorkspaceReviewSourceChatId(source.id) : null) ??
    normalizeWorkspaceReviewSourceChatId(sourceRef);
  if (!conversationId) return null;

  return repositoryConversationSourceHref({
    branch: candidate.targetBranch,
    conversationId,
    projectId: candidate.projectId,
  });
}

function normalizeWorkspaceReviewSourceChatId(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (normalized.startsWith('source_chat:')) return normalized.slice('source_chat:'.length);
  if (normalized.startsWith('chat:')) return normalized.slice('chat:'.length);
  return null;
}

function findWorkspaceReviewSource(
  sources: SourceBundleItem[],
  sourceRef: string | undefined
): SourceBundleItem | undefined {
  if (!sourceRef) return undefined;
  const normalizedRef = sourceRef.replace(/^(material|source_chat|chat):/, '');
  return sources.find(
    (item) =>
      item.id === sourceRef ||
      item.id === normalizedRef ||
      item.materialId === sourceRef ||
      item.materialId === normalizedRef ||
      item.conversationId === sourceRef ||
      item.conversationId === normalizedRef ||
      sourceRef.includes(item.id)
  );
}

function findWorkspaceReviewOperation(
  operations: WorkspaceYOpsDraftOperation[],
  rowPath: string
): WorkspaceYOpsDraftOperation | undefined {
  const normalizedRow = normalizeWorkspaceReviewStructurePath(rowPath);
  return operations.find((operation) => {
    const normalizedOperation = normalizeWorkspaceReviewStructurePath(operation.path).replace(
      /\/-$/,
      ''
    );
    return (
      normalizedRow === normalizedOperation ||
      normalizedRow.replace(/\/\d+$/, '/-') ===
        normalizeWorkspaceReviewStructurePath(operation.path) ||
      normalizedRow.startsWith(`${normalizedOperation}/`)
    );
  });
}

function aggregateWorkspaceReviewValue(values: Array<string | undefined>): string | undefined {
  const unique = Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean)));
  return unique.length === 1 ? unique[0] : undefined;
}

function isRemovalOperation(operation: string): boolean {
  return /^(delete|remove|unset)$/i.test(operation);
}

function compareScenarioOperations(
  current: WorkspaceYOpsDraftOperation[],
  comparison: WorkspaceYOpsDraftOperation[]
) {
  const currentByPath = new Map(current.map((operation) => [operation.path, operation]));
  const comparisonByPath = new Map(comparison.map((operation) => [operation.path, operation]));
  let currentOnlyCount = 0;
  let comparisonOnlyCount = 0;
  let differentValueCount = 0;

  for (const [path, operation] of currentByPath) {
    const other = comparisonByPath.get(path);
    if (!other) {
      currentOnlyCount += 1;
      continue;
    }
    const value = operation.afterValue ?? operation.summary;
    const otherValue = other.afterValue ?? other.summary;
    if (operation.op !== other.op || JSON.stringify(value) !== JSON.stringify(otherValue)) {
      differentValueCount += 1;
    }
  }
  for (const path of comparisonByPath.keys()) {
    if (!currentByPath.has(path)) comparisonOnlyCount += 1;
  }

  return { comparisonOnlyCount, currentOnlyCount, differentValueCount };
}

function getReviewChecks(controller: WorkspaceComposeReviewController): ReviewCheckView[] {
  const deterministic = controller.review.deterministicValidation;
  const view = controller.review.view;
  const replayStatementStatus = statementStatus(view?.checks.replay);
  const replayStatus: ReviewCheckStatus =
    deterministic?.ok === false || replayStatementStatus === 'failed'
      ? 'failed'
      : deterministic?.ok === true && replayStatementStatus === 'passed'
        ? 'passed'
        : 'pending';
  const checks: ReviewCheckView[] = [
    {
      label: 'Deterministic YOps replay',
      requirement: 'required',
      status: replayStatus,
      detail: deterministic
        ? deterministic.ok
          ? replayStatementStatus === 'passed'
            ? `${deterministic.applied} operations produced the exact result and a verified Replay Statement.`
            : `${deterministic.applied} operations produced the result; the immutable Replay Statement is still pending.`
          : (deterministic.error?.message ?? 'Replay failed.')
        : 'Apply the YOps draft to the exact base and verify the resulting State.',
    },
    statementCheck(
      'Schema validation',
      view?.checks.validation,
      'required',
      'Check the projected result against the Workspace schema and bound context.'
    ),
  ];

  checks.push({
    label: 'Object integrity',
    requirement: 'system',
    status: view?.checks.objectIntegrity === 'verified' ? 'passed' : 'pending',
    detail:
      view?.checks.objectIntegrity === 'verified'
        ? 'The exact State, Effect, Proposal, and Statements passed protocol integrity checks.'
        : 'Protocol object integrity will be checked when the review snapshot is prepared.',
  });
  return checks;
}

function statementCheck(
  label: string,
  check: { observation: string; outcomes: string[] } | undefined,
  requirement: ReviewCheckView['requirement'],
  pendingDetail: string
): ReviewCheckView {
  const status = statementStatus(check);
  return {
    label,
    requirement,
    status,
    detail:
      check?.observation === 'observed'
        ? check.outcomes.length > 0
          ? status === 'passed'
            ? `Passed: ${check.outcomes.join(', ')}.`
            : `Needs attention: ${check.outcomes.join(', ')}.`
          : 'Observed without a reported outcome.'
        : pendingDetail,
  };
}

function statementStatus(
  check: { observation: string; outcomes: string[] } | undefined
): ReviewCheckStatus {
  if (!check || check.observation !== 'observed' || check.outcomes.length === 0) return 'pending';
  if (check.outcomes.every((item) => item === 'passed' || item === 'verified')) return 'passed';
  return check.outcomes.some((item) =>
    ['failed', 'invalid', 'denied', 'error', 'false'].includes(item)
  )
    ? 'failed'
    : 'pending';
}

function committedReviewId(
  view: WorkspaceComposeReviewController['review']['view']
): string | null {
  if (!view || view.history.observation !== 'committed') return null;
  return view.history.commit.id;
}
