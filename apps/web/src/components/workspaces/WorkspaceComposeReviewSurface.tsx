import type { SemanticContent } from '@t3x-dev/core';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Box as BoxIcon,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  CircleHelp,
  ClipboardPaste,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  FileUp,
  GitBranch,
  MessageSquare,
  Minus,
  MinusCircle,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Settings,
  Share2,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import NextLink from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GenerationModelSelector } from '@/components/generation/GenerationModelSelector';
import { DOCUMENT_SOURCE_ACCEPTED_TYPES } from '@/components/import/documentAcceptTypes';
import { StateBranchControls } from '@/components/project/StateBranchControls';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import { WorkspaceComposeChat } from '@/components/workspaces/WorkspaceComposeChat';
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
  workspaceDraftOperationsToStateOperations,
} from '@/domain/project/stateViewModel';
import { repositoryConversationSourceHref } from '@/domain/sourceEvidenceNavigation';
import { getPrimarySchemaBinding } from '@/domain/workspaces/selectors';
import { workspaceHasSchemaBinding } from '@/domain/workspaces/studioTargets';
import type { WorkspaceComposeReviewController } from '@/hooks/workspaces/useWorkspaceComposeReviewController';
import { useWorkspaceDefinitionApply } from '@/hooks/workspaces/useWorkspaceDefinitionApply';
import { validateWorkspaceCandidateYOps } from '@/hooks/workspaces/useWorkspaceYOps';
import type {
  SourceBundleItem,
  WorkspaceCandidate,
  WorkspaceSchemaCandidateField,
  WorkspaceYOpsDraftOperation,
} from '@/types/workspaces';
import type { WorkspaceYOpsValue } from '@/types/workspaceYops';
import { cn } from '@/utils/cn';
import composeStyles from './WorkspaceComposeSurface.module.css';
import checksStyles from './WorkspaceReviewChecks.module.css';
import { WorkspaceReviewCodeView } from './WorkspaceReviewCodeView';
import diffStyles from './WorkspaceReviewDiff.module.css';

type WorkspaceSurfaceMode = 'compose' | 'review';
type ReviewPane = 'rendered' | 'changes' | 'yaml' | 'checks';
type ReviewCheckStatus = 'failed' | 'passed' | 'pending';

function parseReviewPane(value: string | null): ReviewPane {
  return value === 'changes' || value === 'yaml' || value === 'checks' ? value : 'rendered';
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
  onWorkspacesRefresh?: (workspace?: WorkspaceCandidate) => Promise<void> | void;
}

export function WorkspaceComposeReviewSurface({
  branchOptions = [],
  candidate,
  controller,
  mode,
  onBranchChange,
  onModeChange,
  onWorkspacesRefresh,
}: WorkspaceComposeReviewSurfaceProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeQuery = searchParams.toString();
  const initialRouteAppliedRef = useRef(false);
  const lastSyncedRouteQueryRef = useRef<string | null>(null);
  const [reviewPane, setReviewPaneState] = useState<ReviewPane>(() =>
    parseReviewPane(new URLSearchParams(routeQuery).get('reviewPane'))
  );

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
    if (rawPane === 'validation') {
      writeWorkspaceSurfaceUrl('review', 'rendered');
    }
  }, [routeQuery, writeWorkspaceSurfaceUrl]);

  useEffect(() => {
    if (initialRouteAppliedRef.current) return;
    initialRouteAppliedRef.current = true;
    const params = new URLSearchParams(routeQuery);
    const routeMode = parseWorkspaceSurfaceMode(
      params.get('workspaceMode'),
      params.get('reviewPane')
    );
    if (routeMode && routeMode !== mode) onModeChange(routeMode);
  }, [mode, onModeChange, routeQuery]);

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white text-[var(--text-primary)]',
        mode === 'review' && reviewPane === 'rendered' && 'workspace-rendered-review-theme'
      )}
    >
      <div className={composeStyles.workspaceBody}>
        {mode === 'review' ? (
          <WorkspaceNavigation
            branchOptions={branchOptions}
            controller={controller}
            mode={mode}
            onBranchChange={onBranchChange}
            onModeChange={setSurfaceMode}
            onPaneChange={setReviewPane}
            pane={reviewPane}
          />
        ) : null}
        <div className={composeStyles.workspaceContent}>
          {mode === 'review' ? (
            <ReviewSurface
              compareScenarioId=""
              controller={controller}
              pane={reviewPane}
              setPane={setReviewPane}
              onModeChange={setSurfaceMode}
            />
          ) : (
            <ComposeSurface
              branchOptions={branchOptions}
              candidate={controller.candidate ?? candidate}
              controller={controller}
              onBranchChange={onBranchChange}
              onModeChange={setSurfaceMode}
              onWorkspacesRefresh={onWorkspacesRefresh}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function WorkspaceNavigation({
  branchOptions,
  controller,
  mode,
  onBranchChange,
  onModeChange,
  onPaneChange,
  pane,
}: {
  branchOptions: string[];
  controller: WorkspaceComposeReviewController;
  mode: WorkspaceSurfaceMode;
  onBranchChange?: (branch: string) => Promise<void> | void;
  onModeChange: (mode: WorkspaceSurfaceMode) => void;
  onPaneChange: (pane: ReviewPane) => void;
  pane: ReviewPane;
}) {
  const selectedBranch = controller.candidate.targetBranch || 'main';
  const availableBranches = Array.from(
    new Set([selectedBranch, ...branchOptions.map((branch) => branch.trim()).filter(Boolean)])
  );
  const navigateReview = (nextPane: ReviewPane) => {
    if (mode !== 'review') onModeChange('review');
    onPaneChange(nextPane);
  };

  return (
    <nav aria-label="Workspace navigation" className={composeStyles.workspaceNav}>
      <div className={composeStyles.branchControl}>
        <StateBranchControls
          branch={selectedBranch}
          branchOptions={availableBranches}
          canCreateFromSearch={false}
          disabled={!onBranchChange || availableBranches.length <= 1}
          headCommitHash={null}
          onBranchChange={(branch) => void onBranchChange?.(branch)}
          onCreateBranch={async () => {}}
          showCreate={false}
        />
      </div>
      <button
        aria-current={mode === 'compose' ? 'page' : undefined}
        className={cn(composeStyles.navItem, mode === 'compose' && composeStyles.navItemActive)}
        onClick={() => onModeChange('compose')}
        type="button"
      >
        <MessageSquare aria-hidden="true" /> Compose
      </button>
      <div className={composeStyles.navDivider} />
      <div className={composeStyles.navGroup}>
        <h2 className={composeStyles.navLabel}>Review</h2>
        <button
          aria-current={mode === 'review' && pane === 'rendered' ? 'page' : undefined}
          className={cn(composeStyles.navItem, composeStyles.navItemNoHighlight)}
          onClick={() => navigateReview('rendered')}
          type="button"
        >
          <PanelRightOpen aria-hidden="true" /> Render
        </button>
        <button
          aria-current={mode === 'review' && pane === 'changes' ? 'page' : undefined}
          className={cn(
            composeStyles.navItem,
            mode === 'review' && pane === 'changes' && composeStyles.navItemActive
          )}
          onClick={() => navigateReview('changes')}
          type="button"
        >
          <GitBranch aria-hidden="true" /> Structure diff
        </button>
        <button
          aria-current={mode === 'review' && pane === 'yaml' ? 'page' : undefined}
          className={cn(
            composeStyles.navItem,
            mode === 'review' && pane === 'yaml' && composeStyles.navItemActive
          )}
          onClick={() => navigateReview('yaml')}
          type="button"
        >
          <Code2 aria-hidden="true" /> Rendered YAML
        </button>
      </div>
    </nav>
  );
}

function ComposeSurface({
  branchOptions,
  candidate,
  controller,
  onBranchChange,
  onModeChange,
  onWorkspacesRefresh,
}: {
  branchOptions: string[];
  candidate: WorkspaceCandidate;
  controller: WorkspaceComposeReviewController;
  onBranchChange?: (branch: string) => Promise<void> | void;
  onModeChange: (mode: WorkspaceSurfaceMode) => void;
  onWorkspacesRefresh?: (workspace?: WorkspaceCandidate) => Promise<void> | void;
}) {
  const operations = candidate.yopsDraft.operations;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedOperation = operations[Math.min(selectedIndex, Math.max(operations.length - 1, 0))];

  useEffect(() => {
    if (selectedIndex >= operations.length) setSelectedIndex(0);
  }, [operations.length, selectedIndex]);

  return (
    <div className={composeStyles.composePage}>
      <ComposeWorkspaceHeader
        branchOptions={branchOptions}
        candidate={candidate}
        controller={controller}
        onBranchChange={onBranchChange}
        onModeChange={onModeChange}
      />
      <div className={composeStyles.composeBody}>
        <ProposedChangesBoard
          candidate={candidate}
          controller={controller}
          onModeChange={onModeChange}
          onSelect={setSelectedIndex}
          onWorkspacesRefresh={onWorkspacesRefresh}
          selectedIndex={selectedIndex}
        />
        <aside aria-label="Discuss change" className={composeStyles.discussRail}>
          <header className={composeStyles.discussHeader}>
            <h3>Discuss change</h3>
            <p className={composeStyles.discussContext}>
              {selectedOperation
                ? `Selected ${selectedOperation.path}`
                : 'Context: current draft and selected sources'}
            </p>
          </header>
          <div className={composeStyles.discussChat}>
            <WorkspaceComposeChat chat={controller.chat} variant="discuss" />
          </div>
          <ComposerBar controller={controller} />
        </aside>
      </div>
    </div>
  );
}

function ComposeWorkspaceHeader({
  branchOptions,
  candidate,
  controller,
  onBranchChange,
  onModeChange,
}: {
  branchOptions: string[];
  candidate: WorkspaceCandidate;
  controller: WorkspaceComposeReviewController;
  onBranchChange?: (branch: string) => Promise<void> | void;
  onModeChange: (mode: WorkspaceSurfaceMode) => void;
}) {
  const selectedBranch = controller.candidate.targetBranch || 'main';
  const availableBranches = Array.from(
    new Set([selectedBranch, ...branchOptions.map((branch) => branch.trim()).filter(Boolean)])
  );
  const schema = getPrimarySchemaBinding(candidate.schemaBindings);
  const schemaLabel = schema
    ? `${schema.schemaName}${schema.version ? ` ${schema.version}` : ''}`
    : 'No schema';

  return (
    <header className={composeStyles.composeHeader}>
      <div className={composeStyles.composeTitle}>
        <h2>{candidate.title}</h2>
        <div className={composeStyles.composeMeta}>
          {controller.scenarios.options.length > 1 ? (
            <label className="inline-flex min-w-0 items-center gap-2">
              <span className="sr-only">Workspace scenario</span>
              <select
                aria-label="Workspace scenario"
                className="h-8 max-w-56 truncate rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2 text-xs text-[var(--text-primary)]"
                onChange={(event) => controller.scenarios.select(event.target.value)}
                value={controller.scenarios.selectedId}
              >
                {controller.scenarios.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <StateBranchControls
            branch={selectedBranch}
            branchOptions={availableBranches}
            canCreateFromSearch={false}
            disabled={!onBranchChange || availableBranches.length <= 1}
            headCommitHash={null}
            onBranchChange={(branch) => void onBranchChange?.(branch)}
            onCreateBranch={async () => {}}
            showCreate={false}
          />
          <span>
            Schema <strong>{schemaLabel}</strong>
          </span>
          {candidate.baseCommitHash ? <code>{candidate.baseCommitHash}</code> : null}
        </div>
      </div>
      <div className={composeStyles.composeStepper} role="tablist" aria-label="Workspace mode">
        <button
          aria-selected="true"
          onClick={() => onModeChange('compose')}
          role="tab"
          type="button"
        >
          <span aria-hidden="true" className={composeStyles.stepIndex}>
            1
          </span>
          Compose
        </button>
        <button
          aria-selected="false"
          onClick={() => onModeChange('review')}
          role="tab"
          type="button"
        >
          <span aria-hidden="true" className={composeStyles.stepIndex}>
            2
          </span>
          Review
        </button>
      </div>
      <span className={composeStyles.draftBadge}>
        Draft{candidate.revision === undefined ? '' : ` r${candidate.revision}`}
      </span>
    </header>
  );
}

function ComposerBar({ controller }: { controller: WorkspaceComposeReviewController }) {
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [sourceForm, setSourceForm] = useState<'paste' | 'url' | null>(null);
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceValue, setSourceValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const includedSource = controller.materialSources.find((source) => source.included);
  const sendDisabled =
    controller.chat.isLoading ||
    controller.model.loading ||
    !controller.model.ready ||
    !controller.chat.input.trim();

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

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!sendDisabled) controller.chat.send();
  };

  return (
    <div className={composeStyles.composerWrap}>
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
      <div className={composeStyles.composer}>
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
          disabled={controller.chat.isLoading}
          onChange={(event) => controller.chat.setInput(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Ask about this change…"
          ref={textareaRef}
          rows={1}
          value={controller.chat.input}
        />
        <div className={composeStyles.composerTools}>
          <div className="relative flex min-w-0 items-center gap-2">
            <button
              aria-expanded={sourceMenuOpen}
              aria-haspopup="menu"
              aria-label="Add source"
              className={composeStyles.addButton}
              onClick={() => setSourceMenuOpen((open) => !open)}
              title="Add source"
              type="button"
            >
              <Plus aria-hidden="true" className="size-4" />
              <span className="sr-only">Add source</span>
            </button>
            {includedSource ? (
              <span className={composeStyles.composerSourceChip}>
                <FileText aria-hidden="true" className="size-3.5" />
                <span>{includedSource.title}</span>
              </span>
            ) : null}
            {sourceMenuOpen ? (
              <div className={composeStyles.sourceMenu} role="menu">
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
                            onClick={() => void controller.toggleMaterialSource(source.materialId)}
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
              onClick={controller.chat.isStreaming ? controller.chat.stop : controller.chat.send}
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

function ProposedChangesBoard({
  candidate,
  controller,
  onModeChange,
  onSelect,
  onWorkspacesRefresh,
  selectedIndex,
}: {
  candidate: WorkspaceCandidate;
  controller: WorkspaceComposeReviewController;
  onModeChange: (mode: WorkspaceSurfaceMode) => void;
  onSelect: (index: number) => void;
  onWorkspacesRefresh?: (workspace?: WorkspaceCandidate) => Promise<void> | void;
  selectedIndex: number;
}) {
  const operations = candidate.yopsDraft.operations;
  const source = candidate.sourceBundle[0];
  const schemaBound = workspaceHasSchemaBinding(candidate);
  const definitionApply = useWorkspaceDefinitionApply({
    candidate,
    onApplied: onWorkspacesRefresh,
    persistCandidate: controller.persistCandidate
      ? (workspace) => controller.persistCandidate(workspace, 'schema.bind')
      : undefined,
  });
  const canReviewDraft = schemaBound && !controller.isBusy && !definitionApply.applying;
  const gaps = (candidate.schemaCandidate.fields ?? []).filter(
    (field) => field.status !== 'covered' && field.required
  );

  return (
    <section aria-label="Proposed changes" className={composeStyles.changesColumn}>
      <div className={composeStyles.changeBoard}>
        <div className={composeStyles.changeBoardHeader}>
          <h3>
            Proposed changes
            <span aria-hidden="true" className={composeStyles.changeCount}>
              {operations.length}
            </span>
          </h3>
          {!schemaBound ? (
            <button
              className={composeStyles.generateButton}
              disabled={controller.isBusy || definitionApply.applying || definitionApply.loading}
              onClick={() => void definitionApply.apply()}
              type="button"
            >
              <BoxIcon aria-hidden="true" className="size-4" />
              {definitionApply.applying ? 'Applying schema…' : 'Apply schema'}
            </button>
          ) : (
            <button
              className={composeStyles.generateButton}
              disabled={controller.isBusy || definitionApply.applying}
              onClick={() => void controller.summarizeWithAi()}
              type="button"
            >
              {controller.busyAction === 'proposal.summarize' ? 'Summarizing…' : 'AI总结'}
            </button>
          )}
        </div>
        <div className={cn(composeStyles.changeGrid, 'chat-scrollbar')}>
          {operations.length ? (
            operations.map((operation, index) => {
              const selected = selectedIndex === index;
              const reviewPath = normalizeWorkspaceReviewStructurePath(operation.path);
              const origin = operation.sourceRefs?.length ? 'Source-backed' : 'Recommended';
              return (
                <article
                  className={cn(composeStyles.changeCard, selected && composeStyles.current)}
                  key={operation.id}
                >
                  <button
                    className={composeStyles.changeTop}
                    onClick={() => onSelect(index)}
                    type="button"
                  >
                    <code className={composeStyles.changePath}>/{operation.path}</code>
                    <span className={composeStyles.changeType}>
                      {proposalValueType(operation.afterValue ?? operation.beforeValue)}
                    </span>
                  </button>
                  <div className={composeStyles.changeValues}>
                    <div className={cn(composeStyles.changeValue, composeStyles.before)}>
                      <span>Current (base)</span>
                      <strong>{proposalActionValue(operation.beforeValue, 'Current value')}</strong>
                    </div>
                    <ArrowRight
                      aria-hidden="true"
                      className={cn(composeStyles.valueArrow, 'size-3.5')}
                    />
                    <div className={cn(composeStyles.changeValue, composeStyles.after)}>
                      <span>Proposed (draft)</span>
                      <strong>
                        {proposalActionValue(operation.afterValue ?? operation.summary, 'Updated')}
                      </strong>
                    </div>
                  </div>
                  <div className={composeStyles.changeFoot}>
                    <span>
                      {source?.title ??
                        (operation.sourceRefs?.[0] ? String(operation.sourceRefs[0]) : 'No source')}
                    </span>
                    <span className={composeStyles.origin}>{origin}</span>
                  </div>
                  {selected ? (
                    <div className={composeStyles.evidence}>
                      <p>{operation.reason ?? operation.summary}</p>
                      <button
                        aria-label={
                          reviewPath ? `Review change ${reviewPath}` : `Preview step ${index + 1}`
                        }
                        className={composeStyles.sourceAction}
                        disabled={!canReviewDraft}
                        onClick={() => void prepareAndOpenReview(controller, onModeChange)}
                        type="button"
                      >
                        {controller.busyAction === 'review.prepare'
                          ? 'Preparing…'
                          : 'Inspect this change'}
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })
          ) : (
            <div className={composeStyles.emptyBoard}>
              <p>Add source evidence, then generate structured changes from the bound schema.</p>
            </div>
          )}
          {gaps.slice(0, 2).map((field) => (
            <article className={cn(composeStyles.changeCard, composeStyles.gapCard)} key={field.id}>
              <code className={composeStyles.changePath}>/{field.path}</code>
              <p className="text-xs leading-5 text-[var(--text-secondary)]">
                {field.label} is still open
                {field.required ? ' · Required' : ''}. Keep it as a gap until a source covers it.
              </p>
            </article>
          ))}
        </div>
      </div>
      <footer className={composeStyles.changesFooter}>
        <p className={composeStyles.footerMeta}>
          Draft{candidate.revision === undefined ? '' : ` r${candidate.revision}`} ·{' '}
          {operations.length} {operations.length === 1 ? 'change' : 'changes'}
          {gaps.length ? ` · ${gaps.length} open ${gaps.length === 1 ? 'gap' : 'gaps'}` : ''}
        </p>
        <div className="flex flex-col items-end gap-2">
          {!schemaBound ? (
            <output className={composeStyles.applyHint}>
              {definitionApply.error ??
                'Apply the schema selected in Schemas to build the workspace tree.'}
            </output>
          ) : null}
          <button
            aria-label="Review full draft"
            className={composeStyles.reviewButton}
            disabled={!canReviewDraft}
            onClick={() => void prepareAndOpenReview(controller, onModeChange)}
            title={schemaBound ? undefined : 'Apply a schema before reviewing the draft.'}
            type="button"
          >
            {operations.length > 0 ? `Review ${operations.length} changes` : 'Review full draft'}
            <ArrowRight aria-hidden="true" className="size-4" />
          </button>
        </div>
      </footer>
    </section>
  );
}

function proposalActionValue(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === '') return fallback;
  const formatted = formatOperationValue(value).replace(/\s+/g, ' ').trim();
  return formatted.length > 26 ? `${formatted.slice(0, 23)}…` : formatted;
}

function proposalValueType(value: unknown): string {
  if (Array.isArray(value)) return 'Array';
  if (typeof value === 'boolean') return 'Boolean';
  if (typeof value === 'number') return 'Number';
  if (value && typeof value === 'object') return 'Object';
  return 'String';
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
  compareScenarioId,
  controller,
  onModeChange,
  pane,
  setPane,
}: {
  compareScenarioId: string;
  controller: WorkspaceComposeReviewController;
  onModeChange: (mode: WorkspaceSurfaceMode) => void;
  pane: ReviewPane;
  setPane: (pane: ReviewPane) => void;
}) {
  const operations = controller.candidate.yopsDraft.operations;
  const [comparison, setComparison] = useState<{
    candidate: WorkspaceCandidate;
    result?: Awaited<ReturnType<typeof validateWorkspaceCandidateYOps>>;
    error?: string;
  } | null>(null);
  const candidate = controller.candidate;
  const exactValidation = controller.review.deterministicValidation;
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
      exactValidation
        ? controller.review
        : {
            ...controller.review,
            deterministicValidation: comparisonResult ?? null,
          },
    [controller.review, exactValidation, comparisonResult]
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

  if (pane === 'rendered') {
    return (
      <WorkspaceRenderedReview
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
                  <div className="mt-4">
                    <WorkspaceDraftCommitBar controller={controller} />
                  </div>
                </div>
              ) : structureModel.rows.length > 0 && operations.length > 0 ? (
                <WorkspaceReviewStructureView
                  activeRowId={activeStructureRow?.id ?? null}
                  candidate={controller.candidate}
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
                    <div className="mt-4 flex flex-col items-center gap-3">
                      {operations.length === 0 || !structureModel.hasReplayContent ? (
                        <button
                          className="inline-flex h-8 items-center justify-center rounded-[5px] border border-[var(--accent-commit)] px-3 text-[13px] font-semibold leading-5 text-[var(--accent-commit)]"
                          disabled={controller.isBusy}
                          onClick={() => void controller.prepareReview()}
                          type="button"
                        >
                          Prepare exact review
                        </button>
                      ) : null}
                      {committedId ? (
                        <button
                          className="inline-flex h-8 items-center justify-center rounded-[5px] bg-[var(--accent-commit)] px-3 text-[13px] font-semibold leading-5 text-[var(--on-accent)] shadow-[var(--fx-shadow-sm)] transition-colors hover:bg-[var(--commit-hover)]"
                          onClick={controller.viewCommit}
                          type="button"
                        >
                          View in State
                        </button>
                      ) : (
                        <WorkspaceDraftCommitBar controller={controller} />
                      )}
                    </div>
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

function ResultYamlPane({
  model,
  branch,
  selectedRow,
  onSelectRow,
  preparing,
  snapshotCurrent,
}: {
  model: WorkspaceReviewStructureModel;
  branch: string;
  selectedRow: WorkspaceReviewStructureRow | null;
  onSelectRow: (id: string) => void;
  preparing: boolean;
  snapshotCurrent: boolean;
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
      branch={branch}
      rootKey={model.rootKey}
      validationReady={false}
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
  controller,
  onModeChange,
  onOpenChecks,
  onStructureDiff,
}: {
  controller: WorkspaceComposeReviewController;
  onModeChange: (mode: WorkspaceSurfaceMode) => void;
  onOpenChecks: () => void;
  onStructureDiff: () => void;
}) {
  const candidate = controller.candidate;
  const content = buildWorkspaceReviewContent(candidate, controller.review);
  const trees = Array.isArray(content.head.trees)
    ? content.head.trees.flatMap((node) => {
        const tree = asWorkspaceReviewTree(node);
        return tree ? [tree] : [];
      })
    : [];
  const checks = getReviewChecks(controller);
  const binding = getPrimarySchemaBinding(candidate.schemaBindings);
  const selected = selectRenderedSection(trees, candidate);
  const selectedPath = selected?.path ?? content.rootKey;
  const copyPath = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(selectedPath.replaceAll('/', '.'));
    }
  };
  const revise = () => {
    controller.chat.setInput(`Revise ${selectedPath}: `);
    onModeChange('compose');
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      {controller.error ? (
        <div
          role="alert"
          className="border-b border-[var(--status-error)]/30 bg-[var(--status-error-muted)] px-7 py-2 text-xs text-[var(--status-error)]"
        >
          {controller.error}
        </div>
      ) : null}
      <main className="flex min-h-0 w-full flex-1 overflow-hidden bg-white max-lg:flex-col max-lg:overflow-y-auto">
        <section
          aria-label="Rendered result"
          className="flex min-h-0 w-[60%] shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white max-lg:min-h-[680px] max-lg:w-full max-lg:border-b max-lg:border-r-0"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white px-6 py-3">
            <div>
              <h2 className="text-[14px] font-semibold leading-tight text-slate-900">
                Rendered result · {binding?.schemaName ?? humanizeWorkspaceKey(content.rootKey)}
              </h2>
              <p className="mt-0.5 text-[12px] text-slate-500">
                {candidate.summary || 'Preview generated from the current draft'}
              </p>
            </div>
            <button
              className="flex items-center gap-1.5 text-[13px] font-medium text-blue-600 transition-colors hover:text-blue-700"
              onClick={onStructureDiff}
              type="button"
            >
              <ExternalLink aria-hidden="true" className="size-4" /> Open structure diff
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-white px-6 py-3">
            {trees.length === 0 ? (
              <p className="text-[13px] leading-5 text-slate-500">
                Prepare review to render the draft tree from the bound schema.
              </p>
            ) : (
              trees.map((tree) => <RenderedDraftTree key={tree.key} depth={0} node={tree} />)
            )}
          </div>

          <footer className="flex shrink-0 items-center gap-4 border-t border-gray-100 bg-white px-4 py-3">
            <WorkspaceDraftCommitBar controller={controller} />
          </footer>
        </section>

        <aside
          aria-label="Review details"
          className="flex min-h-0 min-w-[340px] w-[40%] flex-col overflow-y-auto bg-white max-lg:w-full"
        >
          <section aria-label="Selected section" className="shrink-0 p-3">
            <h2 className="mb-2 text-[15px] font-bold text-slate-900">Selected section</h2>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-slate-900">
                {selected?.label ?? humanizeWorkspaceKey(content.rootKey)}
              </h3>
              <button
                className="flex items-center gap-1.5 text-[12px] font-medium text-blue-600 transition-colors hover:text-blue-700"
                onClick={copyPath}
                type="button"
              >
                <Copy aria-hidden="true" className="size-3.5" /> Copy path
              </button>
            </div>
            <div className="mb-2 flex items-center gap-2">
              <code className="inline-block rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1 text-[11px] leading-4 text-gray-600">
                {selectedPath.replaceAll('/', '.')}
              </code>
              {selected?.changed ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-100 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-600">
                  <MinusCircle aria-hidden="true" className="size-3" /> Modified
                </span>
              ) : null}
            </div>
            <div className="mt-2">
              <div className="mb-1 text-[11px] text-slate-500">Source</div>
              <div className="flex items-center justify-between rounded-md border border-indigo-100/50 bg-indigo-50/40 px-3 py-1.5">
                <div className="flex items-center gap-2 text-[12px] text-slate-700">
                  <FileText aria-hidden="true" className="size-4 text-indigo-500" />
                  {candidate.sourceBundle[0]?.title ?? binding?.schemaName ?? candidate.title}
                </div>
              </div>
            </div>
            <div className="mt-2">
              {selected?.value ? (
                <p className="mb-2 text-[12px] leading-4 text-slate-600">{selected.value}</p>
              ) : null}
              <button
                className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-blue-600 transition-colors hover:text-blue-700"
                onClick={onStructureDiff}
                type="button"
              >
                <Share2 aria-hidden="true" className="size-4" /> Show in structure diff
              </button>
              <button
                className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-blue-700"
                onClick={revise}
                type="button"
              >
                <Sparkles aria-hidden="true" className="size-4" /> Ask AI to revise
              </button>
            </div>
          </section>
          <section
            aria-label={`Checks for draft v${candidate.revision ?? 1}`}
            className="border-t border-gray-200 p-3"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-bold text-slate-900">
                Checks for draft v{candidate.revision ?? 1}
              </h2>
              <span className="text-[11px] font-medium text-slate-500">Review evidence</span>
            </div>
            <div className="flex flex-col">
              {checks.map((check, index) => (
                <div
                  className={cn(
                    'flex items-start gap-3 border-b border-gray-100',
                    index === 0 ? 'pb-2' : 'py-2'
                  )}
                  key={check.label}
                >
                  <span
                    className={cn(
                      'mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full',
                      check.status === 'passed'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-100 text-gray-400'
                    )}
                  >
                    {check.status === 'passed' ? (
                      <Check aria-hidden="true" className="size-3" />
                    ) : (
                      <CircleDot aria-hidden="true" className="size-3" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="truncate text-[12px] font-bold text-slate-900">
                        {check.label}
                      </h4>
                      <span
                        className={cn(
                          'shrink-0 rounded border px-2 py-0.5 text-[10px] font-medium',
                          check.status === 'passed'
                            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                            : check.status === 'failed'
                              ? 'border-rose-100 bg-rose-50 text-rose-700'
                              : 'border-gray-200 bg-gray-100 text-gray-500'
                        )}
                      >
                        {check.status === 'passed'
                          ? 'Passed'
                          : check.status === 'failed'
                            ? 'Failed'
                            : 'Not run'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-md border border-indigo-100/50 bg-indigo-50/50 px-3 py-1.5">
              <CircleHelp aria-hidden="true" className="size-4 shrink-0 text-indigo-500" />
              <p className="text-[12px] text-indigo-700">
                Results tied to this draft; edits require recheck.
              </p>
            </div>
            <button
              className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
              onClick={onOpenChecks}
              type="button"
            >
              <CheckCircle2 aria-hidden="true" className="size-[18px]" />
              Open checks
              <ArrowRight aria-hidden="true" className="ml-1 size-4" />
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
  const initialIndex = Math.max(
    0,
    checks.findIndex((check) => check.status === 'failed')
  );
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const selected = checks[selectedIndex] ?? checks[0];
  const candidate = controller.candidate;
  const passedCount = checks.filter((check) => check.status === 'passed').length;
  const failedCount = checks.filter((check) => check.status === 'failed').length;
  const pendingCount = checks.length - passedCount - failedCount;
  const candidateLabel = candidate.id || `draft-v${String(candidate.revision ?? 1)}`;
  const compactCandidate =
    candidateLabel.length > 18 ? `${candidateLabel.slice(0, 15)}…` : candidateLabel;
  const schemaLabel = _formatProposalSchemaLabel(candidate);
  const selectedStatus = selected?.status ?? 'pending';
  const gap = candidate.schemaReview.gaps[0];
  const selectedReady = selectedStatus === 'passed';
  const runLabel = `${selected?.label ?? 'Check'} · draft v${String(candidate.revision ?? 1)}`;
  const logText = [
    `INFO  Bound schema ${schemaLabel}`,
    `INFO  Checking candidate ${candidateLabel}`,
    selected?.detail ?? 'No check detail is available.',
    `${selectedStatus.toUpperCase()}  ${selectedReady ? 'Check passed.' : selectedStatus === 'failed' ? 'Check failed.' : 'Check has not completed.'}`,
  ].join('\n');
  const downloadLog = () => {
    if (typeof document === 'undefined') return;
    const url = URL.createObjectURL(new Blob([logText], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `workspace-check-${String(candidate.revision ?? 1)}.log`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

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
            {checks.map((check, index) => (
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
          <button className={checksStyles.selectedItem} type="button">
            <CheckStatusMark status={selectedStatus} />
            <span>
              <b>
                #{candidate.revision ?? 1} · {compactCandidate}
              </b>
              <small>{formatRelativeTime(candidate.updatedAt)}</small>
            </span>
            <CheckStatusBadge status={selectedStatus} />
          </button>
          <div className={checksStyles.noHistory}>
            No earlier run is recorded for this candidate.
          </div>
        </aside>

        <main className={checksStyles.checkDetail}>
          <div className={checksStyles.detailHeading}>
            <div>
              <CheckStatusMark status={selectedStatus} large />
              <h2>{selected?.label ?? 'Check'} · Current run</h2>
              <CheckStatusBadge status={selectedStatus} ready />
            </div>
            <button
              disabled={controller.isBusy}
              onClick={() => void controller.prepareReview()}
              type="button"
            >
              <RefreshCw aria-hidden="true" />
              {controller.isBusy ? 'Running…' : 'Re-run current'}
            </button>
          </div>

          <section className={checksStyles.metadataCard}>
            {[
              ['Candidate', compactCandidate],
              ['Schema', schemaLabel],
              ['Profile', selected?.requirement ?? 'required'],
              ['Run', `check-${String(candidate.revision ?? 1)}`],
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

          <section className={checksStyles.detailCard}>
            <h3>Validation result</h3>
            <div className={checksStyles.validationResult}>
              <span className={checksStyles.validResult}>
                <Check aria-hidden="true" />
                <b>Valid:</b> Yes
              </span>
              <span
                className={selectedReady ? checksStyles.validResult : checksStyles.invalidResult}
              >
                {selectedReady ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
                <b>Ready:</b> {selectedReady ? 'Yes' : 'No'}
              </span>
              <p>
                {selectedStatus === 'failed' ? '1 error' : '0 errors'}
                <i>·</i>
                <b>{gap ? '1 gap' : '0 gaps'}</b>
                <i>·</i>
                {gap ? '1 suggested fix' : '0 suggested fixes'}
              </p>
            </div>
          </section>

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

          <section className={checksStyles.detailCard}>
            <div className={checksStyles.cardTitle}>
              <h3>Suggested fix</h3>
              <button onClick={onOpenCompose} type="button">
                <ExternalLink aria-hidden="true" />
                Open in Compose
              </button>
            </div>
            <p className={checksStyles.suggestion}>
              {gap ? 'Add the required field with a valid value.' : selected?.detail}
            </p>
          </section>

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

          <section className={cn(checksStyles.detailCard, checksStyles.logCard)}>
            <div className={checksStyles.cardTitle}>
              <h3>
                Run log <code>{runLabel}</code>
              </h3>
              <div>
                <button type="button">
                  <ExternalLink aria-hidden="true" />
                  View full log
                </button>
                <button onClick={downloadLog} type="button">
                  <Download aria-hidden="true" />
                  Download
                </button>
              </div>
            </div>
            <pre>{logText}</pre>
          </section>
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
    <section aria-label="Workspace review structure" className={diffStyles.surface}>
      <header className={diffStyles.toolbar}>
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
      <div className={diffStyles.body}>
        {yamlModel ? (
          <ResultYamlPane
            branch={candidate.targetBranch}
            model={yamlModel}
            onSelectRow={onSelectRow}
            preparing={preparing}
            selectedRow={selectedRow}
            snapshotCurrent={snapshotCurrent}
          />
        ) : (
          <WorkspaceReviewStructureTree
            activeRowId={selectedRow?.id ?? null}
            modifiedLabel={modifiedLabel}
            modifiedOnly={modifiedOnly}
            onSelectRow={onSelectRow}
            query={query}
            rows={rows}
          />
        )}
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
  activeRowId,
  expansionRequest,
  modifiedLabel,
  modifiedOnly = false,
  onSelectRow,
  query = '',
  rows,
}: {
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
      <table className={diffStyles.tree}>
        <colgroup>
          <col className="w-[29%]" />
          <col className="w-[34%]" />
          <col className="w-[25%]" />
          <col className="w-[12%]" />
        </colgroup>
        <tbody>
          {visibleRows.map((row) => (
            <WorkspaceReviewStructureTableRow
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
  expanded,
  modifiedLabel,
  onSelect,
  onToggle,
  row,
  selected,
}: {
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
              row.depth > 0
                ? 'repeating-linear-gradient(to right, transparent 0 9px, #e5e7eb 9px 10px, transparent 10px 28px)'
                : undefined,
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${String(row.depth * 28)}px 100%`,
            paddingLeft: row.depth * 28,
          }}
        >
          {row.depth > 0 ? (
            <span
              aria-hidden="true"
              className={diffStyles.treeElbow}
              style={{ left: row.depth * 28 - 18 }}
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
      <td className={diffStyles.valueCell}>
        <WorkspaceReviewValueCell row={row} />
      </td>
      <td className={diffStyles.whyCell}>
        <WorkspaceReviewWhyCell row={row} />
      </td>
      <td className={diffStyles.changedCell}>{row.diff?.exact ? modifiedLabel : '—'}</td>
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
        aria-label={`Checks for draft v${candidate.revision ?? 1}`}
      >
        <header className={diffStyles.cardHeader}>
          <h2>Checks for draft v{candidate.revision ?? 1}</h2>
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
      <section className={diffStyles.card} aria-label="Commit draft">
        <WorkspaceDraftCommitBar controller={controller} />
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

function WorkspaceDraftCommitBar({ controller }: { controller: WorkspaceComposeReviewController }) {
  const ready = Boolean(
    controller.review.transitionId && controller.review.content && controller.review.precondition
  );
  const commitId =
    committedReviewId(controller.review.view) ??
    (controller.candidate.status === 'committed'
      ? (controller.candidate.lastCommitHash ?? null)
      : null);
  const checks = getReviewChecks(controller);
  const requiredFailed = checks.some(
    (check) => check.requirement === 'required' && check.status === 'failed'
  );
  const busy = controller.busyAction?.startsWith('decision:') === true;

  if (commitId) {
    return (
      <div className={diffStyles.commitBar}>
        <button className={diffStyles.commitAction} onClick={controller.viewCommit} type="button">
          <Share2 aria-hidden="true" className="size-4" /> View in State
        </button>
        <span className={diffStyles.commitHint}>Committed to branch history.</span>
      </div>
    );
  }

  return (
    <div className={diffStyles.commitBar}>
      <button
        aria-label="Commit draft"
        className={diffStyles.commitAction}
        disabled={controller.isBusy || !ready}
        onClick={() => {
          void controller.decide(
            requiredFailed ? 'overridden' : 'accepted',
            requiredFailed
              ? controller.decisionReason?.trim() || 'Continue after review checks.'
              : undefined
          );
        }}
        type="button"
      >
        <Share2 aria-hidden="true" className="size-4" />
        {busy ? 'Committing…' : requiredFailed ? 'Commit anyway' : 'Commit'}
      </button>
      <span className={diffStyles.commitHint}>
        {ready
          ? requiredFailed
            ? 'A required check failed. Commit records an override.'
            : 'Save the reviewed draft as committed state.'
          : 'Prepare review before committing.'}
      </span>
    </div>
  );
}

function asWorkspaceReviewTree(value: unknown): WorkspaceReviewTreeNode | null {
  if (!value || typeof value !== 'object') return null;
  const node = value as { children?: unknown; key?: unknown; slots?: unknown };
  if (typeof node.key !== 'string') return null;
  return {
    children: Array.isArray(node.children)
      ? node.children.flatMap((child) => {
          const parsed = asWorkspaceReviewTree(child);
          return parsed ? [parsed] : [];
        })
      : [],
    key: node.key,
    slots:
      node.slots && typeof node.slots === 'object' && !Array.isArray(node.slots)
        ? (node.slots as Record<string, unknown>)
        : {},
  };
}

function humanizeWorkspaceKey(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function formatRenderedValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => formatRenderedValue(item))
      .filter(Boolean)
      .join(', ');
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function RenderedDraftTree({ depth, node }: { depth: number; node: WorkspaceReviewTreeNode }) {
  const title =
    typeof node.slots.title === 'string' && node.slots.title.trim()
      ? node.slots.title
      : humanizeWorkspaceKey(node.key);
  const slots = Object.entries(node.slots).filter(([key, value]) => {
    return key !== 'title' && formatRenderedValue(value);
  });

  return (
    <section className={cn(depth === 0 ? 'mb-3' : 'relative mb-2 pl-4')}>
      {depth === 0 ? (
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900">
          {title}
        </h1>
      ) : (
        <h3 className="mb-1 text-[14px] font-bold text-slate-900">
          {humanizeWorkspaceKey(node.key)}
        </h3>
      )}
      {slots.length > 0 ? (
        <div className="mb-2 flex flex-col overflow-hidden rounded-md border border-gray-200">
          {slots.map(([key, value], index) => (
            <div
              className={cn('flex', index < slots.length - 1 && 'border-b border-gray-200')}
              key={key}
            >
              <div className="w-1/3 border-r border-gray-200 bg-gray-50/50 px-3 py-0.5 text-[12px] font-medium leading-5 text-slate-500">
                {humanizeWorkspaceKey(key)}
              </div>
              <div className="w-2/3 bg-white px-3 py-0.5 text-[12px] leading-5 text-slate-700">
                {formatRenderedValue(value)}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {node.children.map((child) => (
        <RenderedDraftTree depth={depth + 1} key={child.key} node={child} />
      ))}
    </section>
  );
}

function selectRenderedSection(
  trees: WorkspaceReviewTreeNode[],
  candidate: WorkspaceCandidate
): { changed: boolean; label: string; path: string; value: string } | null {
  const operation = candidate.yopsDraft.operations[0];
  if (operation) {
    const path = normalizeWorkspaceReviewStructurePath(operation.path);
    return {
      changed: true,
      label: path.split('/').filter(Boolean).slice(-2).map(humanizeWorkspaceKey).join(' · '),
      path,
      value: formatRenderedValue(operation.afterValue ?? operation.summary),
    };
  }
  const root = trees[0];
  if (!root) return null;
  const slotted = firstSlottedReviewPath(root, root.key);
  return {
    changed: false,
    label: slotted?.label ?? humanizeWorkspaceKey(root.key),
    path: slotted?.path ?? root.key,
    value: slotted?.value ?? formatRenderedValue(root.slots.title),
  };
}

function firstSlottedReviewPath(
  node: WorkspaceReviewTreeNode,
  path: string
): { label: string; path: string; value: string } | null {
  for (const [key, value] of Object.entries(node.slots)) {
    const formatted = formatRenderedValue(value);
    if (!formatted) continue;
    return {
      label: `${humanizeWorkspaceKey(node.key)} · ${humanizeWorkspaceKey(key)}`,
      path: `${path}/${key}`,
      value: formatted,
    };
  }
  for (const child of node.children) {
    const nested = firstSlottedReviewPath(child, `${path}/${child.key}`);
    if (nested) return nested;
  }
  return null;
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
  if (!sourceRef) return sources[0];
  const normalizedRef = sourceRef.replace(/^(material|source_chat|chat):/, '');
  return (
    sources.find(
      (item) =>
        item.id === sourceRef ||
        item.id === normalizedRef ||
        item.materialId === sourceRef ||
        item.materialId === normalizedRef ||
        item.conversationId === sourceRef ||
        item.conversationId === normalizedRef ||
        sourceRef.includes(item.id)
    ) ?? sources[0]
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
  if (!view || view.history?.observation !== 'committed') return null;
  return view.history.commit.id;
}
