import type {
  WorkspaceAuthoringCard,
  WorkspaceTransitionReviewSnapshotEnvelope,
} from '@t3x-dev/api-client';
import type { SemanticContent } from '@t3x-dev/core';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  Box as BoxIcon,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  ClipboardPaste,
  Clock3,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  FileCode2,
  FileText,
  FileUp,
  GitBranch,
  Globe2,
  Hash,
  Layers,
  ListTree,
  MessageSquare,
  Minus,
  PanelRight,
  Pencil,
  Percent,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Share2,
  Sparkles,
  Square,
  Type,
  UserRound,
  X,
} from 'lucide-react';
import NextImage from 'next/image';
import NextLink from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ChangeEvent, ClipboardEvent, CSSProperties, KeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clipboardImageFiles,
  fileToAttachedImage,
} from '@/components/generation/attachedImageFile';
import { GenerationModelSelector } from '@/components/generation/GenerationModelSelector';
import { DOCUMENT_SOURCE_ACCEPTED_TYPES } from '@/components/import/documentAcceptTypes';
import { StateBranchControls } from '@/components/project/StateBranchControls';
import navigationStyles from '@/components/project/StateNavigationControls.module.css';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OutputTargetsTab } from '@/components/workspaces/OutputTargetsTab';
import { SourceArtifactRoleEditor } from '@/components/workspaces/SourcesTab';
import { SourceTransitionTab } from '@/components/workspaces/SourceTransitionTab';
import { WorkspaceComposeChat } from '@/components/workspaces/WorkspaceComposeChat';
import { WorkspaceContentEditor } from '@/components/workspaces/WorkspaceContentEditor';
import type { WorkspaceYOpsFlowView } from '@/components/workspaces/YOpsDraftTab';
import { getSchemaRegistryPreview } from '@/data/schemaReleases';
import {
  activityChannelLabel,
  activityOperation,
  type ComposeActivityMeta,
  type ComposeActivitySelection,
  composeEventCards,
  groupComposeActivity,
} from '@/domain/composeActivity';
import {
  composeActorLabel,
  composeNodeContent,
  composeNodeTitle,
  composePathLabel,
  composeTextDiff,
  composeValueChangeLabels,
  composeValueLabel,
} from '@/domain/composePresentation';
import { buildStateYamlReview } from '@/domain/diff/stateYamlReview';
import {
  buildStructuredStateDiff,
  type StructuredDiffChange,
  type StructuredDiffKind,
} from '@/domain/diff/structuredStateDiff';
import {
  buildCanonicalStateYaml,
  buildStatePointRows,
  type StatePointRow,
  selectPrdRenderModel,
  workspaceDraftOperationsToStateOperations,
} from '@/domain/project/stateViewModel';
import { mergePublishedSchemaVersions } from '@/domain/schemas/publishedSchemaVersions';
import { repositoryConversationSourceHref } from '@/domain/sourceEvidenceNavigation';
import {
  authoringVisibleCards,
  buildAuthoringReviewProjection,
} from '@/domain/workspaces/authoringReview';
import {
  DEFAULT_WORKSPACE_SCHEMA_CHOICE_ID,
  listWorkspaceSchemaChoices,
  workspaceSchemaChoiceId,
} from '@/domain/workspaces/schemaBindings';
import { useProjectYSchemaVersions } from '@/hooks/schemas/useProjectYSchemaVersions';
import { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';
import { useWorkspaceAuthoringBootstrap } from '@/hooks/workspaces/useWorkspaceAuthoringBootstrap';
import type { WorkspaceComposeReviewController } from '@/hooks/workspaces/useWorkspaceComposeReviewController';
import { useWorkspaceReviewHistory } from '@/hooks/workspaces/useWorkspaceReviewHistory';
import { validateWorkspaceCandidateYOps } from '@/hooks/workspaces/useWorkspaceYOps';
import type { AttachedImage } from '@/types/generation';
import type {
  SourceBundleItem,
  WorkspaceCandidate,
  WorkspaceSchemaCandidateField,
  WorkspaceYOpsDraftOperation,
} from '@/types/workspaces';
import type { WorkspaceYOpsValue } from '@/types/workspaceYops';
import { cn } from '@/utils/cn';
import { ComposeActivityTimeline } from './ComposeActivityTimeline';
import { ComposeAuthoringAssistant } from './ComposeAuthoringAssistant';
import { ComposeNodeHistoryPanel } from './ComposeNodeHistoryPanel';
import composeStyles from './WorkspaceComposeSurface.module.css';
import checksStyles from './WorkspaceReviewChecks.module.css';
import { WorkspaceReviewCodeView } from './WorkspaceReviewCodeView';
import diffStyles from './WorkspaceReviewDiff.module.css';
import reviewStyles from './WorkspaceReviewReference.module.css';
import stageHeaderStyles from './WorkspaceStageHeader.module.css';

type WorkspaceSurfaceMode = 'compose' | 'review';
type ReviewPane = 'rendered' | 'changes' | 'yaml' | 'checks' | 'source' | 'edit' | 'delivery';
type ReviewCheckStatus = 'failed' | 'passed' | 'pending';
type ComposeChangeFilter = 'all' | 'modified' | 'added' | 'attention';

function parseReviewPane(value: string | null): ReviewPane {
  return value === 'changes' ||
    value === 'yaml' ||
    value === 'checks' ||
    value === 'source' ||
    value === 'edit' ||
    value === 'delivery'
    ? value
    : 'rendered';
}

function parseWorkspaceSurfaceMode(
  modeValue: string | null,
  paneValue: string | null
): WorkspaceSurfaceMode | null {
  if (modeValue === 'compose' || modeValue === 'review') return modeValue;
  if (
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
  onBranchChange?: (branch: string) => Promise<void> | void;
  onModeChange: (mode: WorkspaceSurfaceMode) => void;
}

export function WorkspaceComposeReviewSurface({
  branchOptions = [],
  candidate,
  controller,
  mode,
  onBranchChange,
  onModeChange,
}: WorkspaceComposeReviewSurfaceProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeQuery = searchParams.toString();
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

  const writeWorkspaceSurfaceUrl = useCallback(
    (nextMode: WorkspaceSurfaceMode, nextPane?: ReviewPane) => {
      const params = new URLSearchParams(routeQuery);
      if (nextMode === 'review') {
        params.set('workspaceMode', 'review');
        if (nextPane && nextPane !== 'rendered') {
          params.set('reviewPane', nextPane);
        } else {
          params.delete('reviewPane');
        }
      } else {
        params.delete('workspaceMode');
        params.delete('reviewPane');
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, routeQuery, router]
  );

  const setSurfaceMode = useCallback(
    (nextMode: WorkspaceSurfaceMode) => {
      writeWorkspaceSurfaceUrl(nextMode, reviewPane);
      onModeChange(nextMode);
    },
    [onModeChange, reviewPane, writeWorkspaceSurfaceUrl]
  );

  const setReviewPane = useCallback(
    (nextPane: ReviewPane) => {
      setReviewPaneState(nextPane);
      writeWorkspaceSurfaceUrl('review', nextPane);
    },
    [writeWorkspaceSurfaceUrl]
  );

  useEffect(() => {
    if (lastSyncedRouteQueryRef.current === routeQuery) return;
    lastSyncedRouteQueryRef.current = routeQuery;
    const params = new URLSearchParams(routeQuery);
    const rawPane = params.get('reviewPane');
    setReviewPaneState(parseReviewPane(rawPane));
    const routeMode = parseWorkspaceSurfaceMode(params.get('workspaceMode'), rawPane) ?? 'compose';
    if (routeMode !== mode) onModeChange(routeMode);
    if (rawPane === 'validation') {
      writeWorkspaceSurfaceUrl('review', 'rendered');
    }
  }, [mode, onModeChange, routeQuery, writeWorkspaceSurfaceUrl]);

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white text-[var(--text-primary)]',
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
          {mode === 'review' ? (
            <>
              <WorkspaceStageHeader
                branchOptions={branchOptions}
                candidate={controller.candidate ?? candidate}
                controller={controller}
                mode={mode}
                onBranchChange={onBranchChange}
                onModeChange={setSurfaceMode}
              />
              <WorkspaceReviewToolbar
                controller={controller}
                onPaneChange={setReviewPane}
                pane={reviewPane}
              />
              <ReviewSurface
                activity={activity}
                compareScenarioId=""
                controller={controller}
                pane={reviewPane}
                setPane={setReviewPane}
                onModeChange={setSurfaceMode}
              />
            </>
          ) : (
            <ComposeSurface
              activity={activity}
              authoringBootstrap={authoringBootstrap}
              branchOptions={branchOptions}
              candidate={controller.candidate ?? candidate}
              controller={controller}
              onBranchChange={onBranchChange}
              onModeChange={setSurfaceMode}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function WorkspaceSchemaSelect({
  candidate,
  controller,
}: {
  candidate: WorkspaceCandidate;
  controller: WorkspaceComposeReviewController;
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
  const selectedId = candidate.schemaBindings[0]
    ? workspaceSchemaChoiceId(candidate.schemaBindings[0])
    : DEFAULT_WORKSPACE_SCHEMA_CHOICE_ID;

  return (
    <select
      aria-label="Workspace schema"
      className="min-w-0 max-w-52 truncate rounded border border-[var(--stroke-divider)] bg-white px-2 py-1 text-xs text-[var(--text-secondary)]"
      disabled={controller.isBusy || !controller.bindSchema}
      onChange={(event) => {
        const choice = choices.find((item) => item.id === event.target.value);
        if (choice) void controller.bindSchema(choice.binding);
      }}
      value={selectedId}
    >
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
  controller,
  mode,
  onBranchChange,
  onModeChange,
}: {
  branchOptions: string[];
  candidate: WorkspaceCandidate;
  controller?: WorkspaceComposeReviewController;
  mode: WorkspaceSurfaceMode;
  onBranchChange?: (branch: string) => Promise<void> | void;
  onModeChange: (mode: WorkspaceSurfaceMode) => void;
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
          branch={selectedBranch}
          branchOptions={availableBranches}
          disabled={!onBranchChange || availableBranches.length <= 1}
          headCommitHash={null}
          onBranchChange={(branch) => void onBranchChange?.(branch)}
          onCreateBranch={async () => {}}
          showCreate={false}
        />
      </div>
      <div aria-label="Workspace stage" className={navigationStyles.segments} role="tablist">
        <button
          aria-selected={mode === 'compose'}
          onClick={() => onModeChange('compose')}
          role="tab"
          type="button"
        >
          <Pencil aria-hidden="true" /> Compose
        </button>
        <button
          aria-selected={mode === 'review'}
          onClick={() => onModeChange('review')}
          role="tab"
          type="button"
        >
          <CheckCircle2 aria-hidden="true" /> Review
        </button>
      </div>
      <div className={stageHeaderStyles.meta}>
        {controller ? (
          <WorkspaceSchemaSelect candidate={candidate} controller={controller} />
        ) : null}
      </div>
    </header>
  );
}

function WorkspaceReviewToolbar({
  controller,
  onPaneChange,
  pane,
}: {
  controller: WorkspaceComposeReviewController;
  onPaneChange: (pane: ReviewPane) => void;
  pane: ReviewPane;
}) {
  const toolClassName = (toolPane: ReviewPane) =>
    cn(composeStyles.reviewTool, pane === toolPane && composeStyles.reviewToolActive);

  return (
    <nav aria-label="Review views" className={cn(composeStyles.reviewToolbar, reviewStyles.views)}>
      <div className={composeStyles.reviewToolbarGroup}>
        <button
          aria-current={pane === 'rendered' ? 'page' : undefined}
          className={toolClassName('rendered')}
          onClick={() => onPaneChange('rendered')}
          type="button"
        >
          <Eye aria-hidden="true" /> Render
        </button>
        <button
          aria-current={pane === 'changes' ? 'page' : undefined}
          className={toolClassName('changes')}
          onClick={() => onPaneChange('changes')}
          type="button"
        >
          <GitBranch aria-hidden="true" /> Structure diff
        </button>
        <button
          aria-current={pane === 'yaml' ? 'page' : undefined}
          className={toolClassName('yaml')}
          onClick={() => onPaneChange('yaml')}
          type="button"
        >
          <Code2 aria-hidden="true" /> Rendered YAML
        </button>
      </div>
      <div className={cn(composeStyles.reviewToolbarGroup, reviewStyles.secondaryViews)}>
        {controller.candidate.sourceBundle.some(
          (source) =>
            source.materialId &&
            (source.format === 'yaml' || /\.ya?ml$/i.test(source.fileName ?? ''))
        ) ? (
          <button
            aria-current={pane === 'source' ? 'page' : undefined}
            className={toolClassName('source')}
            onClick={() => onPaneChange('source')}
            type="button"
          >
            <FileCode2 aria-hidden="true" /> Source configuration
          </button>
        ) : null}
        <button
          aria-current={pane === 'edit' ? 'page' : undefined}
          className={toolClassName('edit')}
          onClick={() => onPaneChange('edit')}
          type="button"
        >
          Edit structured State
        </button>
        <button
          aria-current={pane === 'delivery' ? 'page' : undefined}
          className={toolClassName('delivery')}
          onClick={() => onPaneChange('delivery')}
          type="button"
        >
          Delivery
        </button>
      </div>
    </nav>
  );
}

function ComposeSurface({
  activity,
  authoringBootstrap,
  branchOptions,
  candidate,
  controller,
  onBranchChange,
  onModeChange,
}: {
  activity: ReturnType<typeof useComposeActivity>;
  authoringBootstrap: ReturnType<typeof useWorkspaceAuthoringBootstrap>;
  branchOptions: string[];
  candidate: WorkspaceCandidate;
  controller: WorkspaceComposeReviewController;
  onBranchChange?: (branch: string) => Promise<void> | void;
  onModeChange: (mode: WorkspaceSurfaceMode) => void;
}) {
  const [draftEditing, setDraftEditing] = useState(true);
  const editingEnabled = activity.enabled && draftEditing;
  const toggleEditing = async () => {
    if (editingEnabled) {
      setDraftEditing(false);
      setSidePanel('chat');
      return;
    }
    if (await authoringBootstrap.start()) {
      setDraftEditing(true);
      setSidePanel('chat');
      setDiscussionOpen(true);
    }
  };
  const [currentStep, setCurrentStep] = useState(0);
  const [discussionOpen, setDiscussionOpen] = useState(true);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef<{ x: number; width: number } | null>(null);
  const [discussionWidth, setDiscussionWidth] = useState(440);
  const [resizing, setResizing] = useState(false);
  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem('t3x-workspace-discussion-width'));
      if (stored >= 320 && stored <= 680) setDiscussionWidth(stored);
    } catch {
      /* Storage can be unavailable in private browser contexts. */
    }
  }, []);
  const resizeDiscussion = (width: number) => {
    const maximum = Math.min(680, Math.max(320, (boardRef.current?.clientWidth ?? 1264) - 400));
    const next = Math.round(Math.max(320, Math.min(maximum, width)));
    setDiscussionWidth(next);
    try {
      localStorage.setItem('t3x-workspace-discussion-width', String(next));
    } catch {
      /* Resizing still works without storage. */
    }
  };

  const [sidePanel, setSidePanel] = useState<'history' | 'chat'>(
    candidate.authoringLedger ? 'history' : 'chat'
  );
  const [changeScope, setChangeScope] = useState<'latest' | 'all'>('latest');
  const [activitySelection, setActivitySelection] = useState<ComposeActivitySelection | null>(null);
  useEffect(() => {
    if (activity.enabled) setSidePanel('history');
  }, [activity.enabled, candidate.id]);
  useEffect(() => {
    setActivitySelection(null);
    setDraftEditing(true);
    setCurrentStep(0);
  }, [candidate.id]);
  const operation =
    activitySelection?.operation ?? candidate.yopsDraft.operations[currentStep] ?? null;
  const selectStep = (step: number) => {
    setActivitySelection(null);
    setCurrentStep(step);
    setSidePanel('chat');
    setDiscussionOpen(true);
  };
  const selectActivity = useCallback(
    (selection: ComposeActivitySelection, panel: 'history' | 'chat' = 'history') => {
      setActivitySelection(selection);
      setSidePanel(panel);
      setDiscussionOpen(true);
    },
    []
  );
  const openHistoryAction = useCallback(
    (actionId: string, nodeId: string) => {
      void activity.selectActionNode(actionId, nodeId).then((selection) => {
        if (!selection) return;
        setChangeScope('latest');
        selectActivity(selection, 'history');
      });
    },
    [activity.selectActionNode, selectActivity]
  );
  const sourceConversationId = candidate.sourceBundle.find(
    (source) =>
      source.type === 'chat' && source.title === 'Compose assistant' && source.conversationId
  )?.conversationId;
  const sourceMaterialIds = candidate.sourceBundle.flatMap((source) =>
    source.materialId ? [source.materialId] : []
  );

  return (
    <div
      ref={boardRef}
      style={{ '--discussion-width': `${discussionWidth}px` } as CSSProperties}
      data-resizing={resizing || undefined}
      className={cn(composeStyles.composeBoard, !discussionOpen && composeStyles.discussionClosed)}
    >
      <WorkspaceStageHeader
        branchOptions={branchOptions}
        candidate={candidate}
        controller={controller}
        mode="compose"
        onBranchChange={onBranchChange}
        onModeChange={onModeChange}
      />
      <SourceToolbar
        proposedChangeCount={
          activity.view
            ? changeScope === 'all'
              ? activity.view.netDiff.length
              : groupComposeActivity(activity.actions).reduce(
                  (count, event) => count + composeEventCards(event, activity.cards).length,
                  0
                )
            : candidate.yopsDraft.operations.length
        }
        authoringBootstrap={authoringBootstrap}
        authoringEnabled={editingEnabled}
        onToggleEditing={toggleEditing}
        candidate={candidate}
        changeScope={changeScope}
        controller={controller}
        onChangeScope={setChangeScope}
        onDiscuss={() => {
          setSidePanel('chat');
          setDiscussionOpen(true);
        }}
      />

      {discussionOpen && (
        // biome-ignore lint/a11y/useSemanticElements: This is an interactive window splitter, not a thematic break.
        <div
          role="separator"
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
            const sidebar = boardRef.current?.querySelector('aside[aria-label="Discuss change"]');
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
          onDoubleClick={() => resizeDiscussion(440)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              resizeDiscussion(discussionWidth + (event.key === 'ArrowLeft' ? 20 : -20));
            }
          }}
        />
      )}
      <main className={composeStyles.composeMain}>
        {!discussionOpen ? (
          <button
            aria-label="Show discussion"
            title="Expand sidebar"
            className={composeStyles.discussionExpand}
            onClick={() => setDiscussionOpen(true)}
            type="button"
          >
            <PanelRight aria-hidden="true" strokeWidth={1.5} />
          </button>
        ) : null}
        {activity.newActivity ? (
          <output className={composeStyles.newActivity}>
            <span>
              New activity · Draft r{activity.newActivity.compositionRevision}. Your inspected node
              remains open.
            </span>
            <button onClick={() => void activity.loadLatest()} type="button">
              Load latest
            </button>
          </output>
        ) : null}

        <ProposedDraftPanel
          activity={activity}
          activitySelection={activitySelection}
          onActivitySelect={selectActivity}
          candidate={candidate}
          changeFilter="all"
          changeScope={changeScope}
          controller={controller}
          currentStep={currentStep}
          onStepChange={selectStep}
        />
      </main>

      {discussionOpen ? (
        <aside aria-label="Discuss change" className={composeStyles.discussionSidebar}>
          <header className={composeStyles.discussionHeader}>
            {editingEnabled ? (
              <div
                className={composeStyles.discussionTabs}
                role="tablist"
                aria-label="Change context"
              >
                <button
                  aria-selected={sidePanel === 'history'}
                  onClick={() => setSidePanel('history')}
                  role="tab"
                  type="button"
                >
                  <Clock3 aria-hidden="true" /> Node history
                </button>
                <button
                  aria-selected={sidePanel === 'chat'}
                  onClick={() => setSidePanel('chat')}
                  role="tab"
                  type="button"
                >
                  <MessageSquare aria-hidden="true" /> Chat
                </button>
              </div>
            ) : (
              <>
                <MessageSquare aria-hidden="true" />
                <h2>Discuss change</h2>
              </>
            )}
            <button
              aria-label="Close discussion"
              title="Collapse sidebar"
              className={composeStyles.discussionClose}
              onClick={() => setDiscussionOpen(false)}
              type="button"
            >
              <PanelRight aria-hidden="true" strokeWidth={1.5} />
            </button>
          </header>
          {editingEnabled && sidePanel === 'history' ? (
            <ComposeNodeHistoryPanel
              activity={activity}
              selection={activitySelection}
              onOpenAction={openHistoryAction}
            />
          ) : null}
          {editingEnabled && activity.view && sidePanel === 'chat' ? (
            <ComposeAuthoringAssistant
              context={{
                workspaceId: candidate.id,
                workspaceRevision: activity.view.workspaceRevision,
                sourceMaterialIds,
                selectedActionId: activitySelection?.meta.actionId,
                selectedNodeId: activitySelection?.operation.id,
              }}
              conversationId={sourceConversationId}
              initialPendingCandidate={
                activity.view?.pendingCandidates?.find((item) => item.status === 'candidate')
                  ?.transitionId
              }
              onCreateConversation={activity.createAssistantConversation}
              onPublishCandidate={activity.publishCandidate}
              activityActions={activity.actions}
              activityCards={activity.cards}
              projectId={candidate.projectId}
            />
          ) : sidePanel === 'chat' ? (
            <>
              <WorkspaceComposeChat
                chat={controller.chat}
                variant="discussion"
                discussionAction={
                  operation ? (
                    <button
                      className={composeStyles.inspectDiscussion}
                      disabled={controller.isBusy}
                      onClick={() => void prepareAndOpenReview(controller, onModeChange)}
                      type="button"
                    >
                      <ListTree aria-hidden="true" /> Inspect this change
                    </button>
                  ) : undefined
                }
              />
              <ComposerBar controller={controller} variant="discussion" />
            </>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}

function ComposerBar({
  controller,
  variant = 'default',
}: {
  controller: WorkspaceComposeReviewController;
  variant?: 'default' | 'discussion';
}) {
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [sourceForm, setSourceForm] = useState<'paste' | 'url' | null>(null);
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceValue, setSourceValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const sendDisabled =
    controller.chat.isLoading ||
    controller.model.loading ||
    !controller.model.ready ||
    (!controller.chat.input.trim() && attachedImages.length === 0);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
  }, [controller.chat.input]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) void controller.uploadFile(file);
    setSourceMenuOpen(false);
  };

  const submitSourceForm = async () => {
    const imported = await controller.addPaste(sourceTitle, sourceValue);
    if (!imported) return;
    setSourceForm(null);
    setSourceMenuOpen(false);
    setSourceTitle('');
    setSourceValue('');
  };

  const removeImage = (id: string) => {
    setAttachedImages((current) => {
      const removed = current.find((image) => image.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return current.filter((image) => image.id !== id);
    });
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = clipboardImageFiles(event.clipboardData);
    if (!files.length) return;
    if (!event.clipboardData.getData('text/plain')) event.preventDefault();
    void Promise.all(files.map(fileToAttachedImage)).then((images) => {
      setAttachedImages((current) => [...current, ...images]);
    });
  };

  const sendComposer = () => {
    if (controller.chat.isLoading || controller.chat.isStreaming || sendDisabled) return;
    const images = attachedImages;
    controller.chat.send(images.length ? images : undefined);
    for (const image of images) URL.revokeObjectURL(image.preview);
    setAttachedImages([]);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    sendComposer();
  };

  const imagePreview =
    attachedImages.length > 0 ? (
      <div className={composeStyles.imagePreview}>
        {attachedImages.map((image) => (
          <span className={composeStyles.imagePreviewItem} key={image.id}>
            <NextImage alt="" height={48} src={image.preview} unoptimized width={48} />
            <button aria-label="Remove image" onClick={() => removeImage(image.id)} type="button">
              <X aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
    ) : null;

  if (variant === 'discussion') {
    return (
      <div className={composeStyles.discussionComposerWrap}>
        {controller.error || controller.chat.warning || controller.notice ? (
          <div
            className={composeStyles.composerNotice}
            role={controller.error ? 'alert' : 'status'}
          >
            {controller.error ?? controller.chat.warning ?? controller.notice}
            {controller.hasCollaborationConflict ? (
              <button
                disabled={controller.isBusy}
                onClick={() => void controller.resolveCollaborationConflict()}
                type="button"
              >
                Refresh and apply mine
              </button>
            ) : null}
          </div>
        ) : null}
        <fieldset className={composeStyles.discussionComposer} aria-label="Message composer">
          <textarea
            aria-label="Workspace instruction"
            disabled={controller.chat.isLoading}
            onChange={(event) => controller.chat.setInput(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            onPaste={handlePaste}
            placeholder="Ask about this change…"
            ref={textareaRef}
            rows={3}
            value={controller.chat.input}
          />
          {imagePreview}
          <div className={composeStyles.discussionComposerFooter}>
            <GenerationModelSelector
              onModelChange={controller.model.change}
              onThinkingChange={controller.model.setThinking}
              selectedModel={controller.model.selectedModel}
              selectedProvider={controller.model.selectedProvider}
              supportsThinking={controller.model.supportsThinking}
              thinkingEnabled={controller.model.thinkingEnabled}
            />
            <button
              aria-label={controller.chat.isStreaming ? 'Stop generating' : 'Send message'}
              className={composeStyles.send}
              disabled={!controller.chat.isStreaming && sendDisabled}
              onClick={controller.chat.isStreaming ? controller.chat.stop : sendComposer}
              type="button"
            >
              {controller.chat.isStreaming ? (
                <Square aria-hidden="true" className="size-4 fill-current text-current" />
              ) : (
                <ArrowUp aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>
        </fieldset>
      </div>
    );
  }

  return (
    <div className={composeStyles.composerWrap}>
      <div>
        {controller.error || controller.chat.warning || controller.notice ? (
          <div
            className={cn(
              'mb-2 flex flex-wrap items-center gap-2 px-1 py-1 text-xs',
              controller.error
                ? 'border-[var(--status-error)]/30 bg-[var(--status-error-muted)] text-[var(--status-error)]'
                : 'text-[var(--text-tertiary)]'
            )}
            role={controller.error ? 'alert' : 'status'}
          >
            {controller.error ??
              controller.chat.warning ??
              (controller.notice === 'Immutable review prepared from the current draft.' ? (
                <>
                  <CheckCircle2 aria-hidden="true" className="size-3.5" />
                  Review ready
                </>
              ) : (
                controller.notice
              ))}
            {controller.hasCollaborationConflict ? (
              <button
                className="ml-3 rounded-md border border-current px-2 py-1 font-semibold"
                disabled={controller.isBusy}
                onClick={() => void controller.resolveCollaborationConflict()}
                type="button"
              >
                Refresh and apply mine
              </button>
            ) : null}
          </div>
        ) : null}
        <div className={cn(composeStyles.composer, 'relative')}>
          <input
            accept={DOCUMENT_SOURCE_ACCEPTED_TYPES}
            aria-label="Upload source material"
            className="hidden"
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />
          <textarea
            aria-label="Workspace instruction"
            className=""
            disabled={controller.chat.isLoading}
            onChange={(event) => controller.chat.setInput(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            onPaste={handlePaste}
            placeholder="Ask T3X anything about your workspace…"
            ref={textareaRef}
            rows={1}
            value={controller.chat.input}
          />
          {imagePreview}
          <div className={composeStyles.composerTools}>
            <div className="relative flex shrink-0 items-center gap-2 text-[var(--text-tertiary)]">
              <button
                aria-expanded={sourceMenuOpen}
                aria-haspopup="menu"
                aria-label="Add source"
                title="Add source"
                className={composeStyles.addButton}
                onClick={() => setSourceMenuOpen((open) => !open)}
                type="button"
              >
                <Plus aria-hidden="true" className="size-4" />
                <span className="sr-only">Add source</span>
              </button>
              {controller.materialSources.find((source) => source.included) ? (
                <span className={composeStyles.sourceChip}>
                  <FileText aria-hidden="true" className="size-4" />
                  <span>{controller.materialSources.find((source) => source.included)?.title}</span>
                </span>
              ) : null}
              {sourceMenuOpen ? (
                <div
                  className="absolute bottom-[calc(100%+8px)] left-0 z-30 min-w-64 rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-elevated)] p-2 shadow-[var(--fx-shadow-lg)]"
                  role="menu"
                >
                  {sourceForm ? (
                    <div className="grid gap-2">
                      <input
                        aria-label="Source title"
                        className="h-8 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-commit)]"
                        onChange={(event) => setSourceTitle(event.target.value)}
                        placeholder="Optional title"
                        value={sourceTitle}
                      />
                      {sourceForm === 'url' ? (
                        <input
                          aria-label="Source URL"
                          className="h-8 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-commit)]"
                          onChange={(event) => setSourceValue(event.target.value)}
                          placeholder="https://example.com/source"
                          type="url"
                          value={sourceValue}
                        />
                      ) : (
                        <textarea
                          aria-label="Pasted source text"
                          className="min-h-24 resize-y rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-commit)]"
                          onChange={(event) => setSourceValue(event.target.value)}
                          placeholder="Paste exact source text"
                          value={sourceValue}
                        />
                      )}
                      <div className="flex justify-end gap-2">
                        <button
                          className="h-8 rounded-md border border-[var(--stroke-default)] px-3 text-xs text-[var(--text-secondary)]"
                          onClick={() => setSourceForm(null)}
                          type="button"
                        >
                          Back
                        </button>
                        <button
                          className="h-8 rounded-md bg-[var(--accent-commit)] px-3 text-xs font-semibold text-[var(--on-accent)]"
                          disabled={!sourceValue.trim() || controller.sourceBusy}
                          onClick={() => void submitSourceForm()}
                          type="button"
                        >
                          {controller.sourceBusy ? 'Adding…' : 'Add source'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-1">
                      <SourceMenuButton
                        icon={FileUp}
                        label="Upload file"
                        onClick={() => fileInputRef.current?.click()}
                      />
                      <SourceMenuButton
                        icon={ClipboardPaste}
                        label="Paste text"
                        onClick={() => setSourceForm('paste')}
                      />

                      {controller.materialSources.length > 0 ? (
                        <div className="mt-1 border-t border-[var(--stroke-divider)] pt-2">
                          <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                            Project materials
                          </p>
                          {controller.materialSources.map((source) => (
                            <button
                              aria-pressed={source.included}
                              className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-app)]"
                              key={source.id}
                              onClick={() =>
                                void controller.toggleMaterialSource(source.materialId)
                              }
                              type="button"
                            >
                              <FileCode2 aria-hidden="true" className="size-4 shrink-0" />
                              <span className="min-w-0 flex-1 truncate">{source.title}</span>
                              <span className="text-[10px] font-semibold text-[var(--accent-commit)]">
                                {source.included ? 'Included' : 'Include'}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            <div className={composeStyles.modelSend}>
              <GenerationModelSelector
                onModelChange={controller.model.change}
                onThinkingChange={controller.model.setThinking}
                selectedModel={controller.model.selectedModel}
                selectedProvider={controller.model.selectedProvider}
                supportsThinking={controller.model.supportsThinking}
                thinkingEnabled={controller.model.thinkingEnabled}
              />
              <button
                aria-label={controller.chat.isStreaming ? 'Stop generating' : 'Send message'}
                className={composeStyles.send}
                disabled={!controller.chat.isStreaming && sendDisabled}
                onClick={controller.chat.isStreaming ? controller.chat.stop : sendComposer}
                type="button"
              >
                {controller.chat.isStreaming ? (
                  <Square aria-hidden="true" className="size-4 fill-current text-current" />
                ) : (
                  <ArrowUp aria-hidden="true" className="size-4" />
                )}
              </button>
            </div>
          </div>
        </div>
        <div className={composeStyles.composerHints}>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <GitBranch className="size-3" aria-hidden="true" />
            <span className="truncate">{controller.candidate.targetBranch}</span>
          </span>
          <span>
            <kbd className="font-sans">Enter</kbd> to send ·{' '}
            <kbd className="font-sans">Shift Enter</kbd> for a new line
          </span>
        </div>
      </div>
    </div>
  );
}

function SourceMenuButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-app)] hover:text-[var(--text-primary)]"
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </button>
  );
}

function SourceToolbar({
  proposedChangeCount,
  authoringBootstrap,
  onToggleEditing,
  authoringEnabled,
  candidate,
  changeScope,
  controller,
  onChangeScope,
  onDiscuss,
}: {
  proposedChangeCount: number;
  authoringBootstrap: ReturnType<typeof useWorkspaceAuthoringBootstrap>;
  onToggleEditing: () => Promise<void>;
  authoringEnabled: boolean;
  candidate: WorkspaceCandidate;
  changeScope: 'latest' | 'all';
  controller: WorkspaceComposeReviewController;
  onChangeScope: (scope: 'latest' | 'all') => void;
  onDiscuss: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const primaryMaterial = controller.materialSources[0];
  const primarySource = primaryMaterial
    ? candidate.sourceBundle.find(
        (item) => item.id === primaryMaterial.id || item.materialId === primaryMaterial.materialId
      )
    : undefined;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) void controller.uploadFile(file);
  };

  const generateChanges = () => {
    if (!authoringEnabled) {
      void controller.generateChanges();
      return;
    }
    onDiscuss();
    requestAnimationFrame(() =>
      document.querySelector<HTMLTextAreaElement>('[aria-label="Workspace instruction"]')?.focus()
    );
  };

  const addManually = () => {
    onDiscuss();
    if (!authoringEnabled)
      controller.chat.setInput(
        'Add a structured change while preserving the selected source evidence.'
      );
    requestAnimationFrame(() =>
      document.querySelector<HTMLTextAreaElement>('[aria-label="Workspace instruction"]')?.focus()
    );
  };

  return (
    <section className={composeStyles.sourcesSection}>
      <div className={composeStyles.sourcesHeading}>
        <h2 className="sr-only">Proposed changes</h2>
        <span className="sr-only">{proposedChangeCount} changes</span>
        <h3 className="sr-only">Sources</h3>
        <div className={composeStyles.sourceChips}>
          {primaryMaterial ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`Open ${controller.materialSources.length} workspace source${controller.materialSources.length === 1 ? '' : 's'}`}
                  className={composeStyles.materialChip}
                  disabled={controller.sourceBusy}
                  title={controller.materialSources.map((material) => material.title).join(', ')}
                  type="button"
                >
                  <FileText aria-hidden="true" />
                  <span>{primaryMaterial.title}</span>
                  {controller.materialSources.length > 1 ? (
                    <small>+{controller.materialSources.length - 1}</small>
                  ) : primarySource?.tokenEstimate ? (
                    <small>{primarySource.tokenEstimate} tokens</small>
                  ) : null}
                  <ChevronDown aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className={composeStyles.sourceMaterialMenu}>
                <DropdownMenuLabel>Workspace sources</DropdownMenuLabel>
                {controller.materialSources.map((material) => {
                  const source = candidate.sourceBundle.find(
                    (item) => item.id === material.id || item.materialId === material.materialId
                  );
                  return (
                    <DropdownMenuCheckboxItem
                      checked={material.included}
                      disabled={controller.sourceBusy}
                      key={material.id}
                      onCheckedChange={() =>
                        void controller.toggleMaterialSource(material.materialId)
                      }
                    >
                      <span className={composeStyles.sourceMaterialName}>{material.title}</span>
                      {source?.tokenEstimate ? <small>{source.tokenEstimate} tokens</small> : null}
                    </DropdownMenuCheckboxItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                  <FileUp aria-hidden="true" /> Add source
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <input
            accept={DOCUMENT_SOURCE_ACCEPTED_TYPES}
            aria-label="Upload source material"
            className="hidden"
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />
          {!primaryMaterial ? (
            <button onClick={() => fileInputRef.current?.click()} type="button">
              <FileUp aria-hidden="true" /> Add source
            </button>
          ) : null}
        </div>
        <div className={composeStyles.composeToolbarActions}>
          <button
            className={cn(composeStyles.addManually, composeStyles.editingMode)}
            disabled={authoringBootstrap.busy || controller.isBusy || controller.chat.isLoading}
            onClick={() => void onToggleEditing()}
            title="Switch between discussion only and Draft editing; existing history is preserved"
            type="button"
          >
            <Play aria-hidden="true" />
            {authoringEnabled
              ? 'Draft editing · Switch to discuss'
              : authoringBootstrap.busy
                ? 'Enabling Draft activity…'
                : authoringBootstrap.importSnapshot !== undefined
                  ? 'Confirm import and enable'
                  : 'Enable Draft activity'}
          </button>
          <button className={composeStyles.addManually} onClick={addManually} type="button">
            <Plus aria-hidden="true" /> Add manually
          </button>
          <div className={composeStyles.generateControls}>
            <span>
              From sources <ChevronDown aria-hidden="true" />
            </span>
            <button
              disabled={!authoringEnabled && controller.isBusy}
              onClick={generateChanges}
              type="button"
            >
              <Layers aria-hidden="true" /> Generate changes
            </button>
          </div>
          <div className={composeStyles.changeScope} role="tablist" aria-label="Change scope">
            <button
              aria-selected={changeScope === 'latest'}
              onClick={() => onChangeScope('latest')}
              role="tab"
              type="button"
            >
              Latest
            </button>
            <button
              aria-selected={changeScope === 'all'}
              onClick={() => onChangeScope('all')}
              role="tab"
              type="button"
            >
              All changes
            </button>
          </div>
        </div>
      </div>
      {authoringBootstrap.importSnapshot !== undefined && !authoringEnabled ? (
        <div
          className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"
          aria-live="polite"
        >
          Import the current Draft snapshot to enable activity. Existing changes will be preserved.
          <button
            className={composeStyles.addManually}
            onClick={authoringBootstrap.cancel}
            type="button"
          >
            Cancel import
          </button>
        </div>
      ) : null}
      {authoringBootstrap.error ? (
        <p className="text-xs text-[var(--status-error)]" role="alert">
          {authoringBootstrap.error}
        </p>
      ) : null}
    </section>
  );
}

function ProposedDraftPanel({
  activity,
  activitySelection,
  onActivitySelect,
  candidate,
  changeFilter,
  changeScope,
  controller,
  currentStep,
  onStepChange,
}: {
  activity: ReturnType<typeof useComposeActivity>;
  activitySelection: ComposeActivitySelection | null;
  onActivitySelect: (selection: ComposeActivitySelection, panel?: 'history' | 'chat') => void;
  candidate: WorkspaceCandidate;
  changeFilter: ComposeChangeFilter;
  changeScope: 'latest' | 'all';
  controller: WorkspaceComposeReviewController;
  currentStep: number;
  onStepChange: (step: number) => void;
}) {
  const operations = candidate.yopsDraft.operations;
  useEffect(() => {
    if (!activity.view) return;
    if (changeScope === 'all') {
      if (activitySelection?.meta.comparison === 'draft') return;
      const card =
        activity.view.netDiff.find(
          (item) =>
            item.nodeId === activitySelection?.operation.id &&
            item.path === activitySelection.operation.path
        ) ?? activity.view.netDiff[0];
      if (card)
        onActivitySelect({
          operation: activityOperation(card),
          meta: { eventId: 'all', comparison: 'draft' },
        });
      return;
    }
    if (activitySelection?.meta.comparison === 'event') return;
    const event = groupComposeActivity(activity.actions)[0];
    if (!event) return;
    const card = composeEventCards(event, activity.cards)[0];
    if (!card) return;
    const action = event.actions.findLast((entry) =>
      activity.cards[entry.actionId]?.some((item) => item.nodeId === card.nodeId)
    )!;
    onActivitySelect({
      operation: activityOperation(card, action.reason),
      meta: {
        eventId: event.id,
        actionId: action.actionId,
        actor: action.actor.id === 'human:local-user' ? 'You' : action.actor.id,
        channel: action.channel,
        timestamp: action.publishedAt,
        comparison: 'event',
      },
    });
  }, [
    activity.view,
    activity.actions,
    activity.cards,
    activitySelection,
    onActivitySelect,
    changeScope,
  ]);
  const renderChangeCard = (
    operation: WorkspaceYOpsDraftOperation,
    index: number,
    meta?: ComposeActivityMeta
  ) => {
    const selected = meta
      ? activitySelection?.meta.eventId === meta.eventId &&
        activitySelection.operation.id === operation.id &&
        activitySelection.operation.path === operation.path
      : !activitySelection && currentStep === index;
    const selectChange = (panel: 'history' | 'chat' = 'history') =>
      meta ? onActivitySelect({ operation, meta }, panel) : onStepChange(index);
    const stamp = meta?.timestamp ?? candidate.updatedAt;
    const field = composeFieldPresentation(candidate, operation);
    const FieldIcon = field.icon;
    const operationSource =
      meta && !operation.sourceRefs?.length
        ? undefined
        : findWorkspaceReviewSource(candidate.sourceBundle, operation.sourceRefs?.[0]);
    const beforeValue = operation.beforeValue;
    const afterValue = meta ? operation.afterValue : (operation.afterValue ?? operation.summary);
    const addedRequirement =
      field.label === 'Requirement' && beforeValue === undefined && afterValue !== undefined;
    const valueLabels = addedRequirement
      ? { before: 'Absent', after: composeNodeContent(afterValue) ?? 'No content recorded' }
      : composeValueChangeLabels(
          beforeValue,
          afterValue,
          meta ? 'Absent' : 'Current value',
          meta ? 'Absent' : 'Updated'
        );
    const cardTitle =
      composeNodeTitle(afterValue) ??
      composeNodeTitle(beforeValue) ??
      (meta?.comparison === 'draft' && field.label === 'Requirement' && afterValue !== undefined
        ? valueLabels.after
        : composePathLabel(operation.path, operation.id));
    const cardReason = operation.reason ?? operation.summary;
    const showReason =
      cardReason !== `Change ${operation.path}` &&
      cardReason.trim() !== '' &&
      cardReason !== cardTitle &&
      cardReason !== valueLabels.after;
    const valueChange = composeTextDiff(valueLabels.before, valueLabels.after);
    const changedValue = (kind: 'removed' | 'added') =>
      [...new Set(valueChange.filter((part) => part.kind === kind).map((part) => part.text.trim()))]
        .filter(Boolean)
        .join(' … ') || '—';
    const isValueModification = beforeValue !== undefined && afterValue !== undefined;
    const beforeDisplay = isValueModification ? changedValue('removed') : valueLabels.before;
    const afterDisplay = isValueModification ? changedValue('added') : valueLabels.after;
    return (
      <section
        className={cn(composeStyles.actionCard, selected && composeStyles.current)}
        data-history-available={Boolean(meta)}
        key={`${meta?.eventId ?? 'proposal'}:${operation.id}:${operation.path}`}
        onClick={meta ? () => selectChange() : undefined}
      >
        <div className={composeStyles.actionTop}>
          <span className={composeStyles.actionNumber}>
            <FieldIcon aria-hidden="true" />
          </span>
          <button
            className={composeStyles.actionHeading}
            disabled={!meta}
            onClick={(event) => {
              event.stopPropagation();
              if (meta) selectChange();
            }}
            title={cardTitle}
            type="button"
          >
            <span className={composeStyles.actionTitle}>{cardTitle}</span>
            <span className={composeStyles.fieldType}>
              {field.label}
              {addedRequirement ? ' · Added' : ''}
            </span>
          </button>
          <button
            aria-label={`Discuss ${cardTitle}`}
            onClick={(event) => {
              event.stopPropagation();
              selectChange('chat');
              document
                .querySelector<HTMLTextAreaElement>('[aria-label="Workspace instruction"]')
                ?.focus();
            }}
            type="button"
          >
            <MessageSquare aria-hidden="true" />
          </button>
          <button
            aria-label={`Revise ${cardTitle}`}
            onClick={(event) => {
              event.stopPropagation();
              selectChange('chat');
              if (!activity.enabled)
                controller.chat.setInput(
                  `Revise “${cardTitle}” while preserving its source evidence.`
                );
              document
                .querySelector<HTMLTextAreaElement>('[aria-label="Workspace instruction"]')
                ?.focus();
            }}
            type="button"
          >
            <Pencil aria-hidden="true" />
          </button>
        </div>
        <div className={composeStyles.collapsedDetail}>
          {beforeValue === undefined && afterValue !== undefined ? (
            <div className={composeStyles.addedValue}>
              <span
                className={`${composeStyles.value} ${composeStyles.after}`}
                title={valueLabels.after}
              >
                {valueLabels.after}
              </span>
            </div>
          ) : (
            <div className={composeStyles.values}>
              <div>
                <span
                  className={`${composeStyles.value} ${composeStyles.before}`}
                  title={valueLabels.before}
                >
                  <del>{beforeDisplay}</del>
                </span>
                <span className={composeStyles.valueLabel}>
                  {meta?.comparison === 'event' ? 'Before event' : 'Current (base)'}
                </span>
              </div>
              <ArrowRight aria-hidden="true" className={composeStyles.valueArrow} />
              <div>
                <span
                  className={`${composeStyles.value} ${composeStyles.after}`}
                  title={valueLabels.after}
                >
                  <ins>{afterDisplay}</ins>
                </span>
                <span className={composeStyles.valueLabel}>
                  {meta?.comparison === 'event' ? 'After event' : 'Proposed (draft)'}
                </span>
              </div>
            </div>
          )}
          {operationSource ? (
            <div className={composeStyles.sourceRow}>
              <FileText aria-hidden="true" className="size-4" />
              <span className="truncate">{operationSource.title}</span>
            </div>
          ) : null}
          {showReason ? <p title={cardReason}>{cardReason}</p> : null}
          <div className={composeStyles.actionMeta}>
            <span className={composeStyles.actionAttribution}>
              {(
                meta
                  ? meta.channel === 'assistant'
                  : candidate.yopsDraft.proposalMode === 'llm'
              ) ? (
                <Bot aria-hidden="true" />
              ) : (
                <UserRound aria-hidden="true" />
              )}
              {meta?.actor ? (
                <span title={composeActorLabel(meta.actor)} className="max-w-28 truncate">
                  {composeActorLabel(meta.actor)}
                </span>
              ) : null}
              <time className={composeStyles.updatedBadge} dateTime={stamp} title={stamp}>
                {formatRelativeTime(stamp)}
              </time>
            </span>
            <span
              className={composeStyles.sourceBadge}
              data-tone={operationSource ? 'source' : 'draft'}
            >
              {operationSource
                ? 'Source-backed'
                : meta
                  ? activityChannelLabel(meta.channel)
                  : 'Draft'}
            </span>
            <button
              aria-label={`Inspect ${cardTitle}`}
              disabled={controller.isBusy || !meta}
              onClick={(event) => {
                event.stopPropagation();
                selectChange();
              }}
              title={meta ? 'View this node history' : 'Enable Draft activity to view node history'}
              type="button"
            >
              <ListTree aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className={composeStyles.panel} data-change-scope={changeScope}>
      <ComposeActivityTimeline
        key={candidate.id}
        activity={activity}
        filter={changeFilter}
        scope={changeScope}
        updatedAt={candidate.updatedAt}
        renderCard={(operation, meta) => renderChangeCard(operation, -1, meta)}
        fallback={
          <div className={composeStyles.actionList}>
            {operations.length ? (
              operations.map((operation, index) => renderChangeCard(operation, index))
            ) : (
              <section className={composeStyles.actionCard}>
                <p className="text-xs leading-5 text-[var(--text-secondary)]">
                  Add source evidence, then generate structured actions.
                </p>
              </section>
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
  const authoringReview = useMemo(
    () => buildAuthoringReviewProjection(controller.candidate, activity.view, controller.review),
    [activity.view, controller.candidate, controller.review]
  );
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
  const [selectedStructureRowId, setSelectedStructureRowId] = useState<string | null>(null);
  const projection = controller.review.changeProjection;
  const view = controller.review.view;
  const checks = getReviewChecks(controller);
  const preparing = controller.busyAction === 'review.prepare';
  const currentness = preparing ? 'preparing' : projection && view ? 'ready' : 'drafting';
  const snapshotCurrent = currentness === 'ready' && Boolean(view);
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

  if (pane === 'source') {
    return <WorkspaceSourceTools key={controller.candidate.id} controller={controller} />;
  }

  if (pane === 'edit') {
    return (
      <WorkspaceContentEditor key={controller.candidate.id} candidate={controller.candidate} />
    );
  }

  if (pane === 'delivery') {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface-app)] p-4 md:p-6">
        <OutputTargetsTab candidate={controller.candidate} />
      </div>
    );
  }

  if (pane === 'rendered') {
    return (
      <WorkspaceRenderedReview
        authoringCards={authoringVisibleCards(activity.view?.netDiff ?? [])}
        authoringPreview={Boolean(authoringReview)}
        candidate={candidate}
        review={comparisonReview}
        controller={controller}
        onModeChange={onModeChange}
        onOpenChecks={() => setPane('checks')}
        onStructureDiff={() => setPane('changes')}
      />
    );
  }

  if (pane === 'checks') {
    return (
      <WorkspaceReviewChecksView
        checks={checks}
        controller={controller}
        onBack={() => setPane('rendered')}
        onOpenCompose={() => onModeChange('compose')}
        onOpenStructure={() => setPane('changes')}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-[var(--text-primary)]">
      {comparisonScenario ? (
        <div className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--status-info-muted)] px-4 py-2 text-[11px] text-[var(--text-secondary)] md:px-6">
          Compared with {comparisonScenario.label}: {comparisonScenario.operationCount} operations ·{' '}
          {scenarioComparison?.differentValueCount ?? 0} value differences ·{' '}
          {scenarioComparison?.currentOnlyCount ?? 0} current-only paths ·{' '}
          {scenarioComparison?.comparisonOnlyCount ?? 0} comparison-only paths.
        </div>
      ) : null}

      {controller.error ? (
        <div
          className="shrink-0 border-b border-[var(--status-error)]/30 bg-[var(--status-error-muted)] px-4 py-2 text-xs text-[var(--status-error)] md:px-6"
          role="alert"
        >
          {controller.error}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <main className="min-w-0 flex-1 overflow-hidden bg-white">
              {operations.length > 0 && !structureModel.hasReplayContent ? (
                <div className="p-5 text-[13px] text-[var(--text-secondary)]">
                  <output>
                    {comparisonError ||
                      comparisonResult?.error?.message ||
                      'Loading the exact before and after values…'}
                  </output>
                  {(comparisonError || comparisonResult?.error) && (
                    <button
                      type="button"
                      className="mt-3 text-[var(--accent-commit)]"
                      onClick={() => void controller.prepareReview()}
                    >
                      Prepare exact review
                    </button>
                  )}
                </div>
              ) : structureModel.rows.length > 0 && operations.length > 0 ? (
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
                  yamlModel={pane === 'yaml' ? structureModel : undefined}
                  snapshotCurrent={snapshotCurrent}
                />
              ) : (
                <div className="flex h-full min-h-[360px] flex-1 items-center justify-center border border-dashed border-[var(--stroke-default)] bg-[var(--surface-card)] p-6 text-center">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      No structured changes are prepared yet
                    </h3>
                    <p className="mt-2 max-w-md text-xs leading-5 text-[var(--text-secondary)]">
                      Add source evidence in Compose, then prepare Review to inspect the structure
                      tree.
                    </p>
                    {committedId ? (
                      <button
                        className="mt-4 inline-flex h-8 items-center justify-center rounded-[5px] bg-[var(--accent-commit)] px-3 text-[13px] font-semibold leading-5 text-[var(--on-accent)] shadow-[var(--fx-shadow-sm)] transition-colors hover:bg-[var(--commit-hover)]"
                        onClick={controller.viewCommit}
                        type="button"
                      >
                        View in State
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
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
  changeCounts,
  branch,
  selectedRow,
  onSelectRow,
  preparing,
  snapshotCurrent,
  validationReady,
}: {
  model: WorkspaceReviewStructureModel;
  changeCounts: { added: number; modified: number; removed: number };
  branch: string;
  selectedRow: WorkspaceReviewStructureRow | null;
  onSelectRow: (id: string) => void;
  preparing: boolean;
  snapshotCurrent: boolean;
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
    ? 'Preparing review…'
    : !model.hasReplayContent
      ? 'Draft preview — base not verified'
      : snapshotCurrent
        ? 'Current review snapshot'
        : 'Snapshot not current';

  return (
    <WorkspaceReviewCodeView
      changeCounts={changeCounts}
      branch={branch}
      rootKey={model.rootKey}
      validationReady={validationReady}
      yamlText={yamlText}
      review={{ lines, selectedPath: selectedRow?.path, onSelectPath: selectPath, statusLabel }}
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
  authoringCards = [],
  authoringPreview = false,
  candidate,
  review,
  controller,
  onModeChange,
  onOpenChecks,
  onStructureDiff,
}: {
  authoringCards?: WorkspaceAuthoringCard[];
  authoringPreview?: boolean;
  candidate: WorkspaceCandidate;
  review: WorkspaceComposeReviewController['review'];
  controller: WorkspaceComposeReviewController;
  onModeChange: (mode: WorkspaceSurfaceMode) => void;
  onOpenChecks: () => void;
  onStructureDiff: () => void;
}) {
  const router = useRouter();
  const reviewSnapshot = controller.review.reviewSnapshot;
  const structure = useMemo(
    () => buildWorkspaceReviewStructureModel(candidate, review),
    [candidate, review]
  );
  const rendered = useMemo(() => selectPrdRenderModel(structure.head), [structure.head]);
  const rolloutSection = rendered.sections.find(
    (section) => section.key === 'rollout_plan' || section.key === 'rollout'
  );
  const rolloutRows = reviewSectionRows(rolloutSection?.value);
  const rollback = rolloutRows.find(([label]) => /rollback/i.test(label))?.[1];
  const notes = rendered.sections.find(
    (section) => section.key === 'notes' || section.key === 'handoff_notes'
  );
  const changedRows = useMemo(
    () => structure.rows.filter((row) => row.diff?.exact),
    [structure.rows]
  );
  const proposedChanges = authoringPreview ? authoringVisibleCards(authoringCards) : [];
  const authoringTitle =
    rendered.requirements[0]?.title?.trim() ||
    (proposedChanges[0]
      ? composeValueLabel(proposedChanges[0].after, composePathLabel(proposedChanges[0].path))
      : '');
  const renderTitle = authoringPreview
    ? authoringTitle || rendered.title || candidate.title
    : rendered.title || candidate.title;
  const priorTitle = authoringPreview
    ? selectPrdRenderModel(structure.baseline).requirements.find(
        (entry) => entry.key === rendered.requirements[0]?.key
      )?.title
    : selectPrdRenderModel(structure.baseline).title;
  const renderLede = authoringPreview
    ? rendered.audience || rendered.problem || rendered.lede
    : rendered.audience || rendered.problem || candidate.summary;
  const showPrdBoilerplate = !authoringPreview;
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const selectedRow =
    structure.rows.find((row) => row.path === selectedPath) ??
    changedRows[0] ??
    structure.rows[0] ??
    null;
  const selectPath = (path: string) => {
    const exact = structure.rows.find((row) => row.path === path);
    const child = changedRows.find((row) => row.path.startsWith(`${path}/`));
    setSelectedPath((exact ?? child)?.path ?? path);
  };
  const selectedKind = selectedRow?.diff?.kind;
  const reviewChecks = getReviewChecks(controller);
  const copyPath = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(selectedRow?.path ?? 'prd');
    }
  };
  const revise = () => {
    controller.chat.setInput(`Revise ${selectedRow?.path ?? 'prd'}: `);
    onModeChange('compose');
  };

  return (
    <div className={reviewStyles.renderSurface}>
      {controller.error ? <p role="alert">{controller.error}</p> : null}
      <main className={reviewStyles.columns}>
        <section aria-label="Rendered result" className={reviewStyles.document}>
          <h1>{renderTitle}</h1>
          {priorTitle && priorTitle !== renderTitle ? (
            <p className={reviewStyles.lead}>
              Replaces <span className={reviewStyles.previousTitle}>{priorTitle}</span>
            </p>
          ) : renderLede ? (
            <p className={reviewStyles.lead}>{renderLede}</p>
          ) : null}
          <div className={reviewStyles.documentMeta}>
            Preview generated from draft r{candidate.revision ?? 1}
            <button onClick={onStructureDiff} type="button">
              Open structure diff <ExternalLink aria-hidden="true" />
            </button>
          </div>
          {showPrdBoilerplate ? (
            <>
              <h3>Summary</h3>
              <p>{rendered.outcome || 'No outcome has been recorded.'}</p>
              <h3>Purpose</h3>
              <p>{rendered.problem || candidate.summary}</p>
              <h3>Rollout plan</h3>
              {rolloutRows.length ? (
                <dl>
                  {rolloutRows.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p>No rollout plan recorded.</p>
              )}
              <h3>Rollback readiness</h3>
              <p>{rollback || 'No rollback detail is present in the current draft.'}</p>
            </>
          ) : null}
          {proposedChanges.length > 0 ? (
            <section>
              <h3>
                Proposed changes <span>{proposedChanges.length}</span>
              </h3>
              <div className={reviewStyles.tableScroll}>
                <table className={reviewStyles.changes}>
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Before</th>
                      <th>After</th>
                      <th aria-label="Change type" />
                    </tr>
                  </thead>
                  <tbody>
                    {proposedChanges.map((card) => {
                      const values = composeValueChangeLabels(card.before, card.after);
                      const kind =
                        card.before === undefined
                          ? 'added'
                          : card.after === undefined
                            ? 'removed'
                            : 'modified';
                      return (
                        <tr
                          key={`${card.nodeId}:${card.path}`}
                          data-selected={selectedPath === card.path}
                        >
                          <th>
                            <button
                              onClick={() => selectPath(card.path ?? card.nodeId)}
                              type="button"
                            >
                              {composePathLabel(card.path)}
                            </button>
                          </th>
                          <td>{card.before === undefined ? '—' : <del>{values.before}</del>}</td>
                          <td>{card.after === undefined ? '—' : <ins>{values.after}</ins>}</td>
                          <td>
                            <span className={reviewStyles.kind} data-kind={kind}>
                              {kind === 'added'
                                ? 'Added'
                                : kind === 'removed'
                                  ? 'Removed'
                                  : 'Modified'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
          {rendered.requirements.length > 0 ? (
            <section>
              <h3>
                Requirements <span>{rendered.requirements.length}</span>
              </h3>
              <div className={reviewStyles.requirements}>
                {rendered.requirements.map((requirement) => {
                  const row = structure.rows.find(
                    (entry) =>
                      entry.path.split('/').includes(requirement.key) && entry.key === 'title'
                  );
                  return (
                    <button
                      key={requirement.key}
                      type="button"
                      data-selected={Boolean(row && selectedRow?.path === row.path)}
                      disabled={!row}
                      onClick={() => row && setSelectedPath(row.path)}
                    >
                      <CheckCircle2 aria-hidden="true" />
                      <span>{requirement.title}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
          {showPrdBoilerplate || notes ? (
            <section>
              <h3>Notes</h3>
              <p>{notes ? formatOperationValue(notes.value) : 'No notes recorded.'}</p>
            </section>
          ) : null}
          <footer className={reviewStyles.commitFooter}>
            <button
              disabled={!reviewSnapshot}
              onClick={() => {
                if (reviewSnapshot)
                  router.push(
                    `/project/${encodeURIComponent(reviewSnapshot.projectId)}/changes/${encodeURIComponent(reviewSnapshot.workspaceId)}/${encodeURIComponent(reviewSnapshot.snapshotId)}`
                  );
              }}
              type="button"
            >
              <Share2 aria-hidden="true" /> Commit changes
            </button>
            <span>
              {reviewSnapshot
                ? 'Review snapshot ready for decision.'
                : 'Review snapshot not prepared.'}
            </span>
          </footer>
        </section>
        <aside aria-label="Review details" className={reviewStyles.rail}>
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
          <section
            aria-label={`Checks for draft r${candidate.revision ?? 1}`}
            className={reviewStyles.panel}
          >
            <header>
              <h2>
                <CheckCircle2 aria-hidden="true" /> Checks for draft r{candidate.revision ?? 1}
              </h2>
            </header>
            {reviewChecks.map((check) => (
              <div className={reviewStyles.check} key={check.label}>
                <CheckStatusMark status={check.status} />
                <div>
                  <strong>{check.label}</strong>
                  <small>{check.detail}</small>
                </div>
                <CheckStatusBadge status={check.status} />
              </div>
            ))}
            <div className={reviewStyles.check}>
              <CircleDot aria-hidden="true" />
              <div>
                <strong>Review snapshot</strong>
                <small>{reviewSnapshot ? 'Prepared' : 'Not prepared'}</small>
              </div>
              <button
                disabled={controller.isBusy}
                onClick={() => void controller.prepareReview()}
                type="button"
              >
                {controller.isBusy ? 'Preparing…' : 'Prepare review'}
              </button>
            </div>
            <button className={reviewStyles.primary} onClick={onOpenChecks} type="button">
              Open checks <ArrowRight aria-hidden="true" />
            </button>
          </section>
        </aside>
      </main>
    </div>
  );
}

function WorkspaceReviewChecksView({
  checks,
  controller,
  onBack,
  onOpenCompose,
  onOpenStructure,
}: {
  checks: ReviewCheckView[];
  controller: WorkspaceComposeReviewController;
  onBack: () => void;
  onOpenCompose: () => void;
  onOpenStructure: () => void;
}) {
  const candidate = controller.candidate;
  const projectId = candidate.projectId;
  const workspaceId = candidate.id;
  const currentSnapshotId = controller.review.reviewSnapshot?.snapshotId ?? null;
  const {
    history,
    historyError,
    historyLoading,
    selectedSnapshotId,
    setSelectedSnapshotId,
    selectedSnapshot,
    snapshotError,
    snapshotLoading,
  } = useWorkspaceReviewHistory(projectId, workspaceId, currentSnapshotId);

  const activeSnapshot = selectedSnapshotId ? selectedSnapshot : null;
  const activeChecks = selectedSnapshotId
    ? activeSnapshot
      ? checksFromSnapshot(activeSnapshot)
      : []
    : checks;
  const initialIndex = Math.max(
    0,
    activeChecks.findIndex((check) => check.status === 'failed')
  );
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  useEffect(() => {
    setSelectedIndex(initialIndex);
  }, [selectedSnapshotId, initialIndex]);
  const selected = activeChecks[selectedIndex] ?? activeChecks[0];
  const passedCount = activeChecks.filter((check) => check.status === 'passed').length;
  const failedCount = activeChecks.filter((check) => check.status === 'failed').length;
  const pendingCount = activeChecks.length - passedCount - failedCount;
  const candidateLabel = candidate.id || `draft-v${String(candidate.revision ?? 1)}`;
  const compactCandidate =
    candidateLabel.length > 18 ? `${candidateLabel.slice(0, 15)}…` : candidateLabel;
  const schemaLabel = activeSnapshot
    ? 'Snapshot projection'
    : _formatProposalSchemaLabel(candidate);
  const selectedStatus = selected?.status ?? 'pending';
  const gap = selectedSnapshotId ? null : candidate.schemaReview.gaps[0];
  const selectedReady = selectedStatus === 'passed';

  return (
    <section aria-label="Workspace review checks" className={checksStyles.surface}>
      <header className={checksStyles.breadcrumbBar}>
        <div>
          <button onClick={onBack} type="button">
            <ArrowLeft aria-hidden="true" /> Back to Review
          </button>
          <i />
          <nav aria-label="Checks breadcrumb">
            <span>Workspaces</span>
            <b>/</b>
            <span>Review</span>
            <b>/</b>
            <strong>Checks</strong>
          </nav>
        </div>
        <div className={checksStyles.draftBadge}>
          <BoxIcon aria-hidden="true" />
          <span>Draft v{candidate.revision ?? 1}</span>
          <b>·</b>
          <code>candidate {compactCandidate}</code>
        </div>
      </header>

      <div className={checksStyles.titleBar}>
        <div>
          <h1>Checks</h1>
          <span className={checksStyles.passedSummary}>
            <Check aria-hidden="true" />
            {passedCount} passed
          </span>
          {failedCount > 0 ? (
            <>
              <i />
              <span className={checksStyles.failedSummary}>
                <X aria-hidden="true" />
                {failedCount} failed
              </span>
            </>
          ) : null}
          {pendingCount > 0 ? (
            <>
              <i />
              <span className={checksStyles.pendingSummary}>
                <CircleDot aria-hidden="true" />
                {pendingCount} pending
              </span>
            </>
          ) : null}
        </div>
        <button onClick={onOpenCompose} type="button">
          <Settings aria-hidden="true" />
          Configure checks
        </button>
      </div>

      <div className={checksStyles.checksBody}>
        <aside className={checksStyles.projectChecks}>
          <h2>Project checks</h2>
          <div>
            {activeChecks.map((check, index) => (
              <button
                className={index === selectedIndex ? checksStyles.selectedItem : undefined}
                key={check.label}
                onClick={() => setSelectedIndex(index)}
                type="button"
              >
                <CheckStatusMark status={check.status} />
                <span>
                  <b>{check.label}</b>
                  <small>
                    {check.requirement === 'system'
                      ? 'T3X system check'
                      : `${schemaLabel} · required`}
                  </small>
                </span>
                <CheckStatusBadge status={check.status} />
              </button>
            ))}
          </div>
        </aside>

        <aside className={checksStyles.runHistory}>
          <h2>Run history</h2>
          {historyLoading ? <output>Loading review snapshots…</output> : null}
          {historyError ? <p role="alert">{historyError}</p> : null}
          <button
            className={!selectedSnapshotId ? checksStyles.selectedItem : undefined}
            onClick={() => setSelectedSnapshotId(null)}
            type="button"
          >
            <CheckStatusMark
              status={
                checks.some((check) => check.status === 'failed')
                  ? 'failed'
                  : currentSnapshotId && checks.every((check) => check.status === 'passed')
                    ? 'passed'
                    : 'pending'
              }
            />
            <span>
              <b>Current candidate</b>
              <small>{currentSnapshotId ?? 'Not reviewed yet'}</small>
            </span>
          </button>
          {history.map((snapshot) => (
            <button
              className={
                selectedSnapshotId === snapshot.snapshot_id ? checksStyles.selectedItem : undefined
              }
              key={snapshot.snapshot_id}
              onClick={() => setSelectedSnapshotId(snapshot.snapshot_id)}
              type="button"
            >
              <CheckStatusMark status={snapshotCheckStatus(snapshot)} />
              <span>
                <b>Revision {snapshot.snapshot.review.precondition.workspaceRevision}</b>
                <small>
                  {new Date(snapshot.created_at).toLocaleString()} · {snapshot.snapshot_id}
                </small>
              </span>
              <CheckStatusBadge status={snapshotCheckStatus(snapshot)} />
            </button>
          ))}
          {!historyLoading && !historyError && history.length === 0 ? (
            <div className={checksStyles.noHistory}>No review snapshots recorded.</div>
          ) : null}
        </aside>

        <main className={checksStyles.checkDetail}>
          <div className={checksStyles.detailHeading}>
            <div>
              <CheckStatusMark status={selectedStatus} large />
              <h2>
                {selected?.label ?? 'Check'} ·{' '}
                {selectedSnapshotId ? 'Saved review' : 'Current candidate'}
              </h2>
              <CheckStatusBadge status={selectedStatus} ready />
            </div>
            <button
              disabled={controller.isBusy}
              onClick={() => void controller.prepareReview()}
              type="button"
            >
              <RefreshCw aria-hidden="true" />
              {controller.isBusy ? 'Preparing…' : 'Prepare current review'}
            </button>
          </div>

          <section className={checksStyles.metadataCard}>
            {[
              [
                'Candidate',
                activeSnapshot
                  ? activeSnapshot.snapshot.request.id
                  : selectedSnapshotId
                    ? 'Loading saved review'
                    : compactCandidate,
              ],
              ['Schema', selectedSnapshotId ? 'Snapshot projection' : schemaLabel],
              ['Profile', selected?.requirement ?? 'required'],
              ['Snapshot', selectedSnapshotId ?? currentSnapshotId ?? 'Not prepared'],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <p>
                  <b>{value}</b>
                  <Copy aria-hidden="true" />
                </p>
              </div>
            ))}
          </section>

          {snapshotLoading ? <output>Loading selected review…</output> : null}
          {snapshotError ? <p role="alert">{snapshotError}</p> : null}

          {!selectedSnapshotId || activeSnapshot ? (
            <section className={checksStyles.detailCard}>
              <h3>Validation result</h3>
              <div className={checksStyles.validationResult}>
                <span
                  className={
                    selectedStatus === 'passed'
                      ? checksStyles.validResult
                      : checksStyles.invalidResult
                  }
                >
                  <Check aria-hidden="true" />
                  <b>Status:</b> {selectedStatus}
                </span>
                <span
                  className={selectedReady ? checksStyles.validResult : checksStyles.invalidResult}
                >
                  {selectedReady ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
                  <b>Ready:</b> {selectedReady ? 'Yes' : 'No'}
                </span>
                <p>
                  {failedCount} failed · {pendingCount} pending · {passedCount} passed
                </p>
              </div>
            </section>
          ) : null}

          {gap ? (
            <section className={checksStyles.detailCard}>
              <h3>Gap (1)</h3>
              <div className={checksStyles.gapCard}>
                <AlertTriangle aria-hidden="true" />
                <div>
                  <strong>REQUIRED_SLOT_MISSING</strong>
                  <code>{gap}</code>
                  <p>{gap} is required before this state is ready.</p>
                </div>
                <button onClick={onOpenStructure} type="button">
                  <ExternalLink aria-hidden="true" />
                  View in structure
                </button>
              </div>
            </section>
          ) : null}

          {!selectedSnapshotId || activeSnapshot ? (
            <section className={checksStyles.detailCard}>
              <div className={checksStyles.cardTitle}>
                <h3>Check detail</h3>
                <button onClick={onOpenCompose} type="button">
                  <ExternalLink aria-hidden="true" />
                  Open current Compose
                </button>
              </div>
              <p className={checksStyles.suggestion}>
                {gap
                  ? 'Add the required field with a valid value.'
                  : (selected?.detail ?? 'No check detail is available.')}
              </p>
            </section>
          ) : null}

          {gap ? (
            <section className={checksStyles.detailCard}>
              <h3>Definition</h3>
              <div className={checksStyles.definition}>
                <code>{gap}</code>
                <b>·</b>
                <span>value</span>
                <b>·</b>
                <em>required</em>
              </div>
            </section>
          ) : null}
        </main>
      </div>
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
  yamlModel,
  snapshotCurrent,
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
  yamlModel?: WorkspaceReviewStructureModel;
  snapshotCurrent: boolean;
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
      <div className={diffStyles.body}>
        <div className={diffStyles.mainColumn}>
          {!yamlModel ? (
            <header className={diffStyles.toolbar}>
              <div className={diffStyles.diffHeading}>
                <h1>Structure diff</h1>
                <p>
                  Base <code>{candidate.baseCommitHash?.slice(0, 7) || 'State'}</code> compared with
                  draft <code>r{candidate.revision ?? 1}</code>
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
          {yamlModel ? (
            <ResultYamlPane
              changeCounts={changeCounts}
              branch={candidate.targetBranch}
              model={yamlModel}
              onSelectRow={onSelectRow}
              preparing={preparing}
              selectedRow={selectedRow}
              snapshotCurrent={snapshotCurrent}
              validationReady={
                snapshotCurrent &&
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
        <WorkspaceReviewNodeInspector
          candidate={candidate}
          checks={checks}
          controller={controller}
          onEditInCompose={onEditInCompose}
          selectedRow={selectedRow}
          sourceLabel={sourceLabel}
        />
      </div>
    </section>
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

  return (
    <StateScrollArea className={diffStyles.treePane} label="Workspace structure rows">
      <table className={cn(diffStyles.tree, reference && diffStyles.referenceTree)}>
        {reference ? (
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
        ) : (
          <colgroup>
            <col className="w-[29%]" />
            <col className="w-[34%]" />
            <col className="w-[25%]" />
            <col className="w-[12%]" />
          </colgroup>
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
                ? 'repeating-linear-gradient(to right, transparent 0 9px, #e5e7eb 9px 10px, transparent 10px 28px)'
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
          <td className={diffStyles.whyCell}>
            <WorkspaceReviewWhyCell row={row} />
          </td>
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

function WorkspaceReviewWhyCell({ row }: { row: WorkspaceReviewStructureRow }) {
  if (!row.diff && row.status === 'unchanged') return <span>—</span>;
  const reason = workspaceReviewEffectText(row);
  return (
    <span className={diffStyles.whyText} title={reason}>
      {reason}
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
  checks,
  controller,
  onEditInCompose,
  selectedRow,
  sourceLabel,
}: {
  candidate: WorkspaceCandidate;
  checks: ReviewCheckView[];
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
        candidate={candidate}
        checks={checks}
        controller={controller}
        onEditInCompose={onEditInCompose}
        row={selectedRow}
        source={source}
      />
    </aside>
  );
}

function WorkspaceReviewChangeReviewPanel({
  candidate,
  checks,
  controller,
  onEditInCompose,
  row,
  source,
}: {
  candidate: WorkspaceCandidate;
  checks: ReviewCheckView[];
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
    controller.chat.setInput(`Revise ${row.path}: `);
    onEditInCompose();
  };
  const copyPath = () => {
    if (navigator.clipboard) void navigator.clipboard.writeText(row.path);
  };

  return (
    <>
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
            {workspaceReviewDiffSymbol(row.diff?.kind ?? 'modified')}{' '}
            {workspaceReviewKindLabel(row)}
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
      <section
        className={diffStyles.card}
        aria-label={`Checks for draft r${candidate.revision ?? 1}`}
      >
        <header className={diffStyles.cardHeader}>
          <h2>Checks for draft r{candidate.revision ?? 1}</h2>
        </header>
        <div className={diffStyles.checkList}>
          {checks.map((check) => (
            <div className={diffStyles.checkRow} key={check.label}>
              <span
                className={diffStyles.checkIcon}
                style={{
                  background:
                    check.status === 'passed' ? 'var(--status-success)' : 'var(--surface-app)',
                  color: check.status === 'passed' ? 'var(--on-status)' : 'var(--text-tertiary)',
                }}
              >
                {check.status === 'passed' ? (
                  <Check aria-hidden="true" className="size-3" />
                ) : (
                  <CircleDot aria-hidden="true" className="size-3" />
                )}
              </span>
              <span className={diffStyles.checkCopy}>
                <strong>{check.label}</strong>
                <span title={check.detail}>{check.detail}</span>
              </span>
              <span
                className={diffStyles.checkStatus}
                style={{
                  background:
                    check.status === 'passed'
                      ? 'var(--status-success-muted)'
                      : 'var(--surface-app)',
                  color:
                    check.status === 'passed' ? 'var(--status-success)' : 'var(--text-secondary)',
                }}
              >
                {check.status === 'passed'
                  ? 'Passed'
                  : check.status === 'failed'
                    ? 'Failed'
                    : check.status === 'pending'
                      ? 'Pending'
                      : 'Not run'}
              </span>
            </div>
          ))}
          {checks.some((check) => check.status === 'pending') ? (
            <button
              className={diffStyles.runChecks}
              onClick={() => void controller.prepareReview()}
              type="button"
            >
              Run checks
            </button>
          ) : null}
        </div>
      </section>
    </>
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
  const normalizedChanges = diffChanges.map((change) => ({
    ...change,
    path: normalizeWorkspaceReviewStructurePath(change.path),
  }));
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
    const exactChange = row.diff
      ? null
      : (exactChangeByPath.get(row.path) ?? findArrayAppendDiffForWorkspaceRow(row, diffChanges));
    if (exactChange) return { ...row, diff: workspaceReviewDiffMeta(exactChange, true) };
    if (row.diff) return row;

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

function findArrayAppendDiffForWorkspaceRow(
  row: WorkspaceReviewStructureRow,
  changes: WorkspaceReviewDiffChange[]
): WorkspaceReviewDiffChange | undefined {
  return changes.find((change) => {
    if (change.kind !== 'added' || !change.path.endsWith('/-')) return false;
    const parentPath = change.path.slice(0, -2);
    return row.parentPath === parentPath && row.value === change.afterValue;
  });
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
    return 'border border-[#d1fae5] bg-[#ecfdf5] text-[#047857]';
  }
  if (kind === 'removed') {
    return 'border border-[#ffe4e6] bg-[#fff1f2] text-[#be123c]';
  }
  return 'border border-[#fef3c7] bg-[#fffbeb] text-[#b45309]';
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

async function prepareAndOpenReview(
  controller: WorkspaceComposeReviewController,
  onModeChange: (mode: WorkspaceSurfaceMode) => void
) {
  onModeChange('review');
  await controller.prepareReview();
}

function reviewSectionRows(value: unknown): Array<[string, string]> {
  if (value === undefined || value === null) return [];
  if (typeof value !== 'object' || Array.isArray(value)) {
    return [['Detail', formatOperationValue(value)]];
  }
  return Object.entries(value).flatMap(([key, entry]) => {
    const label = key.replace(/[_-]+/g, ' ');
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return Object.entries(entry).map(
        ([field, fieldValue]) =>
          [`${label} · ${field.replace(/[_-]+/g, ' ')}`, formatOperationValue(fieldValue)] as [
            string,
            string,
          ]
      );
    }
    return [[label, formatOperationValue(entry)] as [string, string]];
  });
}

function formatOperationValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'Not set';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
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

function checksFromSnapshot(
  snapshot: WorkspaceTransitionReviewSnapshotEnvelope
): ReviewCheckView[] {
  const checks = snapshot.snapshot.transition.checks;
  return [
    statementCheck('Deterministic replay', checks.replay, 'required', 'Replay not observed.'),
    statementCheck('Schema validation', checks.validation, 'required', 'Validation not observed.'),
    {
      label: 'Object integrity',
      requirement: 'system',
      status: checks.objectIntegrity === 'verified' ? 'passed' : 'pending',
      detail:
        checks.objectIntegrity === 'verified'
          ? 'Protocol object integrity verified.'
          : 'Object integrity was not verified in this snapshot.',
    },
  ];
}

function snapshotCheckStatus(
  snapshot: WorkspaceTransitionReviewSnapshotEnvelope
): ReviewCheckStatus {
  const checks = checksFromSnapshot(snapshot);
  if (checks.some((check) => check.status === 'failed')) return 'failed';
  return checks.every((check) => check.status === 'passed') ? 'passed' : 'pending';
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
