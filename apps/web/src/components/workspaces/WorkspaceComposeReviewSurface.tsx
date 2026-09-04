import type { SemanticContent } from '@t3x-dev/core';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  ClipboardPaste,
  Clock3,
  Code2,
  Cuboid,
  Eye,
  FileCode2,
  FileUp,
  GitBranch,
  GitPullRequest,
  Layers3,
  Link,
  Link2,
  ListFilter,
  Loader2,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  ShieldCheck,
  Square,
  Wrench,
} from 'lucide-react';
import NextLink from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ChangeEvent, KeyboardEvent, ReactNode } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { GenerationModelSelector } from '@/components/generation/GenerationModelSelector';
import { DOCUMENT_SOURCE_ACCEPTED_TYPES } from '@/components/import/documentAcceptTypes';
import { StateCodeView } from '@/components/project/StateCodeView';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { WorkspaceComposeChat } from '@/components/workspaces/WorkspaceComposeChat';
import { buildStateYamlReview } from '@/domain/diff/stateYamlReview';
import {
  buildStructuredStateDiff,
  type StructuredDiffChange,
  type StructuredDiffKind,
} from '@/domain/diff/structuredStateDiff';
import { shortHash } from '@/domain/format/formatters';
import {
  buildCanonicalStateYaml,
  buildStatePointRows,
  type StatePointRow,
  workspaceDraftOperationsToStateOperations,
} from '@/domain/project/stateViewModel';
import { repositoryConversationSourceHref } from '@/domain/sourceEvidenceNavigation';
import type { WorkspaceComposeReviewController } from '@/hooks/workspaces/useWorkspaceComposeReviewController';
import type {
  SourceBundleItem,
  WorkspaceCandidate,
  WorkspaceSchemaCandidateField,
  WorkspaceYOpsDraftOperation,
} from '@/types/workspaces';
import type { WorkspaceYOpsValue } from '@/types/workspaceYops';
import { cn } from '@/utils/cn';

type WorkspaceSurfaceMode = 'compose' | 'review';
type ReviewPane = 'changes' | 'validation' | 'yaml';
type ReviewCheckStatus = 'failed' | 'passed' | 'pending';

function parseReviewPane(value: string | null): ReviewPane {
  return value === 'validation' || value === 'yaml' ? value : 'changes';
}

function parseWorkspaceSurfaceMode(
  modeValue: string | null,
  paneValue: string | null
): WorkspaceSurfaceMode | null {
  if (modeValue === 'compose' || modeValue === 'review') return modeValue;
  if (paneValue === 'validation' || paneValue === 'yaml') return 'review';
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
  const initialRouteAppliedRef = useRef(false);
  const [reviewPane, setReviewPaneState] = useState<ReviewPane>(() =>
    parseReviewPane(new URLSearchParams(routeQuery).get('reviewPane'))
  );
  const changeCount = controller.candidate.yopsDraft.operations.length;

  const writeWorkspaceSurfaceUrl = useCallback(
    (nextMode: WorkspaceSurfaceMode, nextPane?: ReviewPane) => {
      const params = new URLSearchParams(routeQuery);
      if (nextMode === 'review') {
        params.set('workspaceMode', 'review');
        if (nextPane && nextPane !== 'changes') {
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
    setReviewPaneState(parseReviewPane(new URLSearchParams(routeQuery).get('reviewPane')));
  }, [routeQuery]);

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
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface-panel)] text-[var(--text-primary)]">
      <WorkspaceSurfaceHeader
        branchOptions={branchOptions}
        controller={controller}
        mode={mode}
        onBranchChange={onBranchChange}
        onModeChange={setSurfaceMode}
      />
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
          candidate={controller.candidate ?? candidate}
          changeCount={changeCount}
          controller={controller}
          onModeChange={setSurfaceMode}
        />
      )}
    </div>
  );
}

function WorkspaceSurfaceHeader({
  branchOptions,
  controller,
  mode,
  onBranchChange,
  onModeChange,
}: {
  branchOptions: string[];
  controller: WorkspaceComposeReviewController;
  mode: WorkspaceSurfaceMode;
  onBranchChange?: (branch: string) => Promise<void> | void;
  onModeChange: (mode: WorkspaceSurfaceMode) => void;
}) {
  const selectedBranch = controller.candidate.targetBranch || 'main';
  const availableBranches = Array.from(
    new Set([selectedBranch, ...branchOptions.map((branch) => branch.trim()).filter(Boolean)])
  );
  const branchSelectorDisabled = !onBranchChange || availableBranches.length <= 1;

  return (
    <header className="flex min-h-[42px] shrink-0 items-center justify-between gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3">
      <div
        aria-label="Workspace workflow tabs"
        className="inline-flex h-8 shrink-0 items-center gap-[2px] rounded-[6px] bg-[var(--surface-app)] p-[2px] text-[13px] font-medium leading-[18px]"
        role="tablist"
      >
        <WorkspaceModeTab
          active={mode === 'compose'}
          icon={MessageSquare}
          label="Compose"
          onClick={() => onModeChange('compose')}
        />
        <WorkspaceModeTab
          active={mode === 'review'}
          icon={GitPullRequest}
          label="Review"
          onClick={() => onModeChange('review')}
        />
      </div>

      <div className="hidden shrink-0 md:block">
        <div className="relative">
          <GitBranch
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--accent-branch)] opacity-90"
          />
          <select
            aria-label="Branch workspace"
            className="h-7 w-[188px] appearance-none rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-card)] pl-8 pr-8 text-xs font-medium leading-4 text-[var(--text-primary)] shadow-[var(--fx-shadow-sm)] outline-none transition-colors hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)] focus-visible:border-[var(--accent-commit)] focus-visible:ring-2 focus-visible:ring-[var(--accent-commit)]/20 disabled:cursor-default disabled:opacity-100"
            disabled={branchSelectorDisabled}
            onChange={(event) => {
              const nextBranch = event.target.value;
              if (nextBranch !== selectedBranch) void onBranchChange?.(nextBranch);
            }}
            value={selectedBranch}
          >
            {availableBranches.map((branch) => (
              <option key={branch} value={branch}>
                Branch workspace: {branch}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 size-3 -translate-y-1/2 text-[var(--text-tertiary)]"
          />
        </div>
      </div>
    </header>
  );
}

function WorkspaceModeTab({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-selected={active}
      className={cn(
        'inline-flex h-7 min-w-[92px] items-center justify-center gap-1.5 rounded-[5px] border px-2.5 transition-[background-color,border-color,box-shadow,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-commit)]/40',
        active
          ? 'border-[var(--stroke-divider)] bg-[var(--surface-card)] text-[var(--accent-commit)] shadow-[var(--fx-shadow-sm)]'
          : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-panel)] hover:text-[var(--text-primary)]'
      )}
      onClick={onClick}
      role="tab"
      type="button"
    >
      <Icon
        aria-hidden="true"
        className={cn(
          'size-3.5 shrink-0',
          active ? 'text-[var(--accent-commit)]' : 'text-[var(--text-tertiary)]'
        )}
      />
      <span>{label}</span>
    </button>
  );
}

function ComposeSurface({
  candidate,
  changeCount,
  controller,
  onModeChange,
}: {
  candidate: WorkspaceCandidate;
  changeCount: number;
  controller: WorkspaceComposeReviewController;
  onModeChange: (mode: WorkspaceSurfaceMode) => void;
}) {
  const [draftSidebarOpen, setDraftSidebarOpen] = useState(true);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface-panel)] text-[var(--text-primary)] lg:flex-row">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--surface-app)]">
        <WorkspaceComposeChat chat={controller.chat} />
        <ComposerBar controller={controller} />
      </section>

      <aside
        aria-label="Proposed draft sidebar"
        className={cn(
          'relative hidden min-h-0 min-w-0 shrink-0 overflow-hidden border-t border-[var(--stroke-divider)] bg-[var(--surface-panel)] transition-[width] duration-200 ease-out lg:block lg:border-l lg:border-t-0',
          draftSidebarOpen ? 'lg:w-[440px] xl:w-[480px]' : 'lg:w-12'
        )}
        style={draftSidebarOpen ? undefined : { flexBasis: 48, width: 48 }}
      >
        {draftSidebarOpen ? (
          <ProposedDraftPanel
            candidate={candidate}
            changeCount={changeCount}
            controller={controller}
            onModeChange={onModeChange}
            onSidebarToggle={() => setDraftSidebarOpen(false)}
          />
        ) : (
          <CollapsedDraftSidebar
            changeCount={changeCount}
            onSidebarToggle={() => setDraftSidebarOpen(true)}
          />
        )}
      </aside>
    </div>
  );
}

function ComposerBar({ controller }: { controller: WorkspaceComposeReviewController }) {
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [sourceForm, setSourceForm] = useState<'paste' | 'url' | null>(null);
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceValue, setSourceValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
    const imported =
      sourceForm === 'url'
        ? await controller.addUrl(sourceValue, sourceTitle)
        : await controller.addPaste(sourceTitle, sourceValue);
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
    <div className="shrink-0 bg-[var(--surface-app)] px-4 pb-5 pt-2 md:px-8">
      <div className="mx-auto max-w-[780px]">
        {controller.error || controller.chat.warning || controller.notice ? (
          <div
            className={cn(
              'mb-2 rounded-md border px-3 py-2 text-xs',
              controller.error
                ? 'border-[var(--status-error)]/30 bg-[var(--status-error-muted)] text-[var(--status-error)]'
                : 'border-[var(--stroke-divider)] bg-[var(--surface-card)] text-[var(--text-secondary)]'
            )}
            role={controller.error ? 'alert' : 'status'}
          >
            {controller.error ?? controller.chat.warning ?? controller.notice}
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
        <div className="relative rounded-[var(--radius-workbench)] border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 pb-3 pt-3 shadow-[var(--fx-shadow-md)] transition-colors focus-within:border-[var(--stroke-strong)]">
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
            className="max-h-32 min-h-9 w-full resize-none bg-transparent px-2 py-0 text-[15px] font-medium leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
            disabled={controller.chat.isLoading}
            onChange={(event) => controller.chat.setInput(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Ask T3X to change, refine, or explain..."
            ref={textareaRef}
            rows={1}
            value={controller.chat.input}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="relative flex shrink-0 items-center gap-2 text-[var(--text-tertiary)]">
              <button
                aria-expanded={sourceMenuOpen}
                aria-haspopup="menu"
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-transparent bg-[var(--hover-bg)] px-3 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-app)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:border-[var(--accent-commit)] focus-visible:ring-1 focus-visible:ring-[var(--accent-commit)]"
                onClick={() => setSourceMenuOpen((open) => !open)}
                type="button"
              >
                <Plus aria-hidden="true" className="size-4" />
                Add source
              </button>
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
                      <SourceMenuButton
                        icon={Link}
                        label="Add URL"
                        onClick={() => setSourceForm('url')}
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
            <div className="flex min-w-0 items-center gap-2">
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
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-commit)] text-[var(--on-accent)] shadow-[var(--fx-shadow-sm)] transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!controller.chat.isStreaming && sendDisabled}
                onClick={controller.chat.isStreaming ? controller.chat.stop : controller.chat.send}
                type="button"
              >
                {controller.chat.isStreaming ? (
                  <Square
                    aria-hidden="true"
                    className="size-4 fill-[var(--on-accent)] text-[var(--on-accent)]"
                  />
                ) : (
                  <ArrowUp aria-hidden="true" className="size-4" />
                )}
              </button>
            </div>
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

function ProposedDraftPanel({
  candidate,
  changeCount,
  controller,
  onModeChange,
  onSidebarToggle,
}: {
  candidate: WorkspaceCandidate;
  changeCount: number;
  controller: WorkspaceComposeReviewController;
  onModeChange: (mode: WorkspaceSurfaceMode) => void;
  onSidebarToggle: () => void;
}) {
  const operations = candidate.yopsDraft.operations;
  const sourceRefs = getProposalSourceRefs(candidate);
  const sourceCount = sourceRefs.length;
  const attentionItems = getProposalAttentionItems(candidate);
  const proposalLabel = 'Proposal';
  const branchLabel = formatProposalWorkspaceLabel(candidate);
  const status = getProposalStatusMeta(changeCount, attentionItems.length);
  const description = formatProposalDescription(candidate, changeCount, sourceCount);
  const schemaLabel = formatProposalSchemaLabel(candidate);
  const reviewNotice = attentionItems[0] ?? description;
  const secondaryActionLabel = formatProposalSecondaryActionLabel(
    attentionItems.length,
    operations.length
  );
  const primaryReviewPath = normalizeWorkspaceReviewStructurePath(operations[0]?.path ?? '');
  const primaryReviewLabel = primaryReviewPath
    ? `Review change ${primaryReviewPath}`
    : 'Proceed to Review';

  return (
    <div className="flex h-full bg-white">
      <div className="relative flex min-h-0 w-full flex-col overflow-hidden bg-white">
        <header className="flex shrink-0 items-center justify-between gap-4 px-8 pb-5 pt-6 text-left">
          <div className="flex min-w-0 items-center gap-3">
            <h3 className="min-w-0 truncate text-lg font-bold leading-6 text-slate-900">
              {proposalLabel}
            </h3>
            <ProposalStatusPill status={status} />
          </div>
          <button
            aria-label="Hide proposed draft sidebar"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            onClick={onSidebarToggle}
            title="显示/隐藏侧边栏"
            type="button"
          >
            <PanelRightClose aria-hidden="true" className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <section className="mb-8 flex items-start gap-4 rounded-2xl border border-amber-100/60 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <CircleAlert aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <h4 className="mb-1 text-sm font-bold leading-tight text-amber-900">
                {attentionItems.length > 0 ? 'Review Required' : 'Description'}
              </h4>
              <p
                className="line-clamp-3 text-sm leading-relaxed text-amber-700/80"
                title={reviewNotice}
              >
                {reviewNotice}
              </p>
            </div>
          </section>

          <div className="relative z-0 flex flex-col gap-6 before:absolute before:bottom-4 before:left-[18px] before:top-4 before:-z-10 before:w-px before:rounded-full before:bg-slate-100">
            <ProposalTimelineItem
              icon={Cuboid}
              iconClassName="border-[var(--stroke-default)] bg-[var(--surface-card)] text-[var(--text-primary)]"
              title="Proposal inputs"
            >
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ProposalMetricChip
                  icon={ArrowRight}
                  label={formatProposalChangeBadge(changeCount)}
                />
                <ProposalMetricChip icon={Cuboid} label={formatProposalSourceTitle(sourceCount)} />
              </div>
              <p
                className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500"
                title={formatProposalOriginLabel(candidate, sourceCount)}
              >
                {formatProposalOriginLabel(candidate, sourceCount)}
              </p>
            </ProposalTimelineItem>

            <ProposalTimelineItem
              icon={GitBranch}
              iconClassName="border-[var(--stroke-default)] bg-[var(--surface-card)] text-[var(--text-primary)]"
              title="Target config"
            >
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ProposalConfigChip label="Branch" value={candidate.targetBranch || 'main'} />
                {schemaLabel ? <ProposalConfigChip label="Schema" value={schemaLabel} /> : null}
                {controller.scenarios.options.length > 1 ? (
                  <select
                    aria-label="Workspace scenario"
                    className="h-7 max-w-full shrink-0 rounded bg-slate-100 px-2 text-xs font-medium text-slate-700 outline-none transition-colors hover:bg-slate-200 focus:ring-2 focus:ring-blue-500"
                    onChange={(event) => controller.scenarios.select(event.target.value)}
                    value={controller.scenarios.selectedId}
                  >
                    {controller.scenarios.options.map((scenario) => (
                      <option key={scenario.id} value={scenario.id}>
                        {scenario.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <ProposalConfigChip label="Workspace" value={branchLabel} />
                )}
              </div>
            </ProposalTimelineItem>

            <ProposalTimelineItem
              icon={ClipboardPaste}
              iconClassName="border-[var(--stroke-default)] bg-[var(--surface-card)] text-[var(--text-primary)]"
              title="Description"
            >
              <div
                className="mt-3 rounded-lg border border-slate-100 bg-white p-4 text-sm leading-7 text-slate-700 shadow-sm"
                title={description}
              >
                <p className="line-clamp-4">“{description}”</p>
              </div>
            </ProposalTimelineItem>

            <ProposalTimelineItem
              action={
                <button
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold leading-none text-blue-600 transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={controller.isBusy || operations.length === 0}
                  onClick={() => void prepareAndOpenReview(controller, onModeChange)}
                  type="button"
                >
                  Full Diff
                  <ChevronRight aria-hidden="true" className="size-3.5" />
                </button>
              }
              badge={formatProposalChangeBadge(changeCount)}
              icon={FileCode2}
              iconClassName="border-[var(--stroke-default)] bg-[var(--surface-card)] text-[var(--text-primary)]"
              title="Changeset"
            >
              <ProposalChangesetPreview operations={operations} />
            </ProposalTimelineItem>
          </div>
        </div>

        <footer className="sticky bottom-0 mt-auto shrink-0 border-t border-slate-100 bg-white p-6">
          <button
            aria-label={primaryReviewLabel}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={controller.isBusy}
            onClick={() => void prepareAndOpenReview(controller, onModeChange)}
            type="button"
          >
            {controller.busyAction === 'review.prepare' ? (
              <>
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                Preparing…
              </>
            ) : (
              <>
                <Eye aria-hidden="true" className="size-4" />
                Proceed to Review
                <ArrowRight aria-hidden="true" className="size-4" />
              </>
            )}
          </button>
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-3.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={controller.isBusy || (attentionItems.length === 0 && operations.length === 0)}
            onClick={() => void prepareAndOpenReview(controller, onModeChange)}
            type="button"
          >
            <Wrench aria-hidden="true" className="size-4" />
            {secondaryActionLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

function CollapsedDraftSidebar({
  changeCount,
  onSidebarToggle,
}: {
  changeCount: number;
  onSidebarToggle: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center bg-[var(--surface-panel)] px-2 py-4">
      <DraftSidebarToggle onToggle={onSidebarToggle} open={false} />
      <div aria-hidden="true" className="mt-4 h-8 w-px rounded-full bg-[var(--stroke-divider)]" />
      <span className="mt-3 rounded-full border border-[var(--stroke-default)] bg-[var(--surface-card)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent-commit)] shadow-[var(--shadow-xs)]">
        {changeCount}
      </span>
    </div>
  );
}

function DraftSidebarToggle({ onToggle, open }: { onToggle: () => void; open: boolean }) {
  const Icon = open ? PanelRightClose : PanelRightOpen;
  return (
    <button
      aria-label={open ? 'Hide proposed draft sidebar' : 'Show proposed draft sidebar'}
      className="group relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-card)] text-[var(--text-secondary)] shadow-[var(--shadow-xs)] transition-colors hover:border-[var(--stroke-strong)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-commit)]"
      onClick={onToggle}
      title="显示/隐藏侧边栏"
      type="button"
    >
      <Icon aria-hidden="true" className="size-3.5" />
      <span className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden whitespace-nowrap rounded-md bg-[var(--text-primary)] px-2 py-1 text-[11px] font-medium text-[var(--surface-panel)] shadow-[var(--shadow-sm)] group-hover:block group-focus-visible:block">
        显示/隐藏侧边栏
      </span>
    </button>
  );
}

function ProposalStatusPill({ status }: { status: ReturnType<typeof getProposalStatusMeta> }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase leading-none tracking-wider',
        status.tone === 'warning'
          ? 'bg-amber-100 text-amber-700'
          : status.tone === 'success'
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-slate-100 text-slate-600'
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', status.dotClass)} />
      {status.label}
    </span>
  );
}

function ProposalTimelineItem({
  action,
  badge,
  children,
  icon: Icon,
  iconClassName,
  subtitle,
  title,
}: {
  action?: ReactNode;
  badge?: string;
  children?: ReactNode;
  icon: LucideIcon;
  iconClassName: string;
  subtitle?: string;
  title: string;
}) {
  return (
    <section className="relative z-10 flex items-start gap-4 bg-white">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] border shadow-[var(--fx-shadow-sm)]',
          iconClassName
        )}
      >
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h4 className="min-w-0 truncate text-sm font-bold leading-tight text-slate-800">
            {title}
          </h4>
          {badge ? (
            <div className="inline-flex shrink-0 items-center gap-2">
              {action}
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold leading-none text-emerald-600">
                {badge}
              </span>
            </div>
          ) : (
            action
          )}
        </div>
        {subtitle ? (
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500" title={subtitle}>
            {subtitle}
          </p>
        ) : null}
        {children}
      </div>
    </section>
  );
}

function ProposalMetricChip({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs font-medium text-blue-600">
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </span>
  );
}

function ProposalConfigChip({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
      title={`${label}: ${value}`}
    >
      <span className="shrink-0 text-slate-400">{label}:</span>
      <span className="min-w-0 truncate font-mono text-slate-700">{value}</span>
    </span>
  );
}

function ProposalChangesetPreview({ operations }: { operations: WorkspaceYOpsDraftOperation[] }) {
  if (operations.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
        Add source evidence, then generate the structured draft.
      </div>
    );
  }

  return (
    <div className="mt-3 flex gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="w-1 shrink-0 rounded-full bg-emerald-400" />
      <div className="min-w-0 flex-1 space-y-1 font-mono text-xs leading-relaxed text-slate-600">
        {operations.slice(0, 4).map((operation) => (
          <ProposalChangePreviewLine key={operation.id} operation={operation} />
        ))}
        {operations.length > 4 ? (
          <div className="truncate text-slate-400">+ {operations.length - 4} more</div>
        ) : null}
      </div>
    </div>
  );
}

function ProposalChangePreviewLine({ operation }: { operation: WorkspaceYOpsDraftOperation }) {
  const kind = proposalOperationKind(operation.op);
  const label = proposalFieldLabel(operation.path);
  const value =
    kind === 'remove'
      ? proposalPreviewValue(operation.beforeValue ?? operation.summary, 'removed')
      : proposalPreviewValue(operation.afterValue ?? operation.summary, 'updated');

  return (
    <div
      className="flex min-w-0 items-center gap-2 px-1 py-0.5"
      title={`${operation.op} ${operation.path}: ${value}`}
    >
      <span
        className={cn(
          'shrink-0 font-bold',
          kind === 'add'
            ? 'text-emerald-700'
            : kind === 'remove'
              ? 'text-rose-700'
              : 'text-amber-700'
        )}
      >
        {kind === 'add' ? '+' : kind === 'remove' ? '-' : '~'}
      </span>
      <span className="shrink-0 truncate text-slate-500">{label}</span>
      <span className="min-w-0 truncate">{value}</span>
    </div>
  );
}

type ProposalOperationKind = 'add' | 'remove' | 'set';

function formatProposalSourceTitle(sourceCount: number): string {
  return `${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}`;
}

function formatProposalChangeBadge(changeCount: number): string {
  return `${changeCount} ${changeCount === 1 ? 'change' : 'changes'}`;
}

function formatProposalSecondaryActionLabel(
  attentionCount: number,
  operationCount: number
): string {
  if (attentionCount > 0) {
    return `Resolve ${attentionCount} ${attentionCount === 1 ? 'Item' : 'Items'}`;
  }
  if (operationCount > 0) return 'Full Diff';
  return 'Full Diff';
}

function proposalOperationKind(operation: string): ProposalOperationKind {
  const normalized = operation.trim().toLowerCase();
  if (normalized === 'add') return 'add';
  if (normalized === 'remove' || normalized === 'delete') return 'remove';
  return 'set';
}

function proposalFieldLabel(path: string): string {
  const segments = path.split('/').filter(Boolean);
  const leaf = segments.at(-1) === '-' ? segments.at(-2) : segments.at(-1);
  if (!leaf) return path;
  return leaf.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function proposalPreviewValue(value: unknown, emptyLabel: string): string {
  if (value === undefined || value === null || value === '') return emptyLabel;
  const formattedValue = formatOperationValue(value).replace(/\s+/g, ' ').trim();
  if (!formattedValue) return emptyLabel;
  return formattedValue.length > 56 ? `${formattedValue.slice(0, 53)}…` : formattedValue;
}

function getProposalSourceRefs(candidate: WorkspaceCandidate): string[] {
  if (candidate.sourceBundle.length > 0) {
    return candidate.sourceBundle.map((source) => source.id);
  }
  return Array.from(
    new Set(candidate.yopsDraft.operations.flatMap((operation) => operation.sourceRefs ?? []))
  );
}

function getProposalAttentionItems(candidate: WorkspaceCandidate): string[] {
  if (candidate.schemaReview.verdict !== 'needs_review') return [];
  const reviewItems = candidate.schemaReview.gaps.length
    ? candidate.schemaReview.gaps
    : [candidate.schemaReview.summary];
  return reviewItems.map((item) => item.trim()).filter(Boolean);
}

function getProposalStatusMeta(
  changeCount: number,
  attentionCount: number
): {
  dotClass: string;
  label: string;
  tone: 'neutral' | 'success' | 'warning';
} {
  if (attentionCount > 0) {
    return {
      dotClass: 'bg-[var(--status-warning)]',
      label: 'Needs Review',
      tone: 'warning',
    };
  }
  if (changeCount > 0) {
    return {
      dotClass: 'bg-[var(--status-success)]',
      label: 'Ready to Review',
      tone: 'success',
    };
  }
  return {
    dotClass: 'bg-[var(--text-tertiary)]',
    label: 'Draft in Progress',
    tone: 'neutral',
  };
}

function formatProposalDescription(
  candidate: WorkspaceCandidate,
  changeCount: number,
  sourceCount: number
): string {
  const explicitSummary =
    candidate.schemaCandidate.summary?.trim() ||
    candidate.summary?.trim() ||
    candidate.title?.trim();
  if (explicitSummary && !/deterministic scaffold/i.test(explicitSummary)) {
    return explicitSummary;
  }

  const changePhrase =
    changeCount === 1 ? '1 structured change' : `${changeCount} structured changes`;
  const sourcePhrase =
    sourceCount === 1
      ? '1 linked source'
      : sourceCount > 1
        ? `${sourceCount} linked sources`
        : 'the selected source evidence';

  return `Apply ${changePhrase} to the draft from ${sourcePhrase}.`;
}

function formatProposalWorkspaceLabel(candidate: WorkspaceCandidate): string {
  if (candidate.scenario?.name) return candidate.scenario.name;
  return candidate.targetBranch === 'main' ? 'Main Workspace' : candidate.targetBranch;
}

function formatProposalSchemaLabel(candidate: WorkspaceCandidate): string {
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

function formatProposalOriginLabel(candidate: WorkspaceCandidate, sourceCount: number): string {
  if (sourceCount === 0)
    return `No source evidence linked in ${formatProposalWorkspaceLabel(candidate)}`;

  const primarySource = candidate.sourceBundle[0]?.title?.trim() || 'Main workspace source chat';
  const suffix = sourceCount > 1 ? ` · +${sourceCount - 1} more` : '';
  return `Built from ${primarySource}${suffix}`;
}

function formatRelativeTime(value: string | undefined): string {
  if (!value) return '';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
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
  const structureModel = useMemo(
    () => buildWorkspaceReviewStructureModel(controller.candidate, controller.review),
    [controller.candidate, controller.review]
  );
  const [selectedStructureRowId, setSelectedStructureRowId] = useState<string | null>(null);
  const [nodeSearchVisible, setNodeSearchVisible] = useState(false);
  const [nodeQuery, setNodeQuery] = useState('');
  const [modifiedNodesOnly, setModifiedNodesOnly] = useState(false);
  const projection = controller.review.changeProjection;
  const view = controller.review.view;
  const checks = getReviewChecks(controller);
  const requiredChecks = checks.filter((check) => check.requirement === 'required');
  const passedRequiredCheckCount = requiredChecks.filter(
    (check) => check.status === 'passed'
  ).length;
  const failedRequiredCheckCount = requiredChecks.filter(
    (check) => check.status === 'failed'
  ).length;
  const pendingRequiredCheckCount = requiredChecks.filter(
    (check) => check.status === 'pending'
  ).length;
  const requiredChecksPassed =
    requiredChecks.length > 0 && passedRequiredCheckCount === requiredChecks.length;
  const preparing = controller.busyAction === 'review.prepare';
  const currentness = projection?.currentness.state ?? (preparing ? 'preparing' : 'drafting');
  const snapshotCurrent = currentness === 'ready' && Boolean(view);
  const acceptAllowed = view?.capabilities.accept.disposition === 'allowed';
  const overrideAllowed = view?.capabilities.override.disposition === 'allowed';
  const committedId =
    committedReviewId(view) ??
    (controller.candidate.status === 'committed'
      ? (controller.candidate.lastCommitHash ?? null)
      : null);
  const rejected =
    view?.mode === 'transition' &&
    view.decision.observation === 'supplied' &&
    view.decision.outcome === 'rejected';
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
  const normalizedNodeQuery = nodeQuery.trim().toLowerCase();
  const visibleChangedStructureRows = changedStructureRows.filter((row) => {
    const matchesQuery =
      !normalizedNodeQuery ||
      row.path.toLowerCase().includes(normalizedNodeQuery) ||
      row.key.toLowerCase().includes(normalizedNodeQuery);
    const matchesFilter = !modifiedNodesOnly || row.diff?.kind === 'modified';
    return matchesQuery && matchesFilter;
  });
  const activeStructureRow =
    (selectedStructureRowId
      ? structureModel.rows.find((row) => row.id === selectedStructureRowId)
      : null) ??
    changedStructureRows[0] ??
    structureModel.rows[0] ??
    null;
  const reviewStatus = getReviewStatus({
    acceptAllowed,
    committed: Boolean(committedId),
    currentness,
    overrideAllowed,
    preparing,
    rejected,
    requiredChecksPassed,
    viewReady: Boolean(view),
  });
  const validationSummary = getValidationHeaderSummary({
    checks,
    currentness,
    failedRequiredCheckCount,
    pendingRequiredCheckCount,
    preparing,
    snapshotCurrent,
    viewReady: Boolean(view),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface-panel)] text-[var(--text-primary)]">
      <div
        className={cn(
          'flex min-h-12 shrink-0 items-center justify-between gap-4 border-b px-4 py-2 text-xs md:px-6',
          reviewStatus.tone === 'success'
            ? 'border-[var(--diff-added-border)] bg-[var(--status-success-muted)] text-[var(--diff-added-text)]'
            : reviewStatus.tone === 'warning'
              ? 'border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] text-[var(--status-warning)]'
              : 'border-[var(--stroke-divider)] bg-[var(--status-info-muted)] text-[var(--text-secondary)]'
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <ValidationStatusIcon preparing={preparing} tone={reviewStatus.tone} />
          <div className="min-w-0">
            <div className="truncate font-semibold">{validationSummary.title}</div>
            <div className="mt-0.5 truncate text-[11px] leading-4 text-[var(--text-secondary)]">
              {validationSummary.detail}
            </div>
          </div>
        </div>
        <button
          className="shrink-0 text-xs font-semibold hover:underline focus:outline-none focus-visible:underline"
          onClick={() => setPane('validation')}
          type="button"
        >
          View checks
        </button>
      </div>

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
        <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--stroke-default)] bg-[var(--surface-card)] xl:w-64 lg:flex">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] px-4">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Changed paths
            </h2>
            <div className="flex items-center gap-1">
              <button
                aria-label="Search changed paths"
                aria-pressed={nodeSearchVisible}
                className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
                onClick={() => setNodeSearchVisible((visible) => !visible)}
                type="button"
              >
                <Search aria-hidden="true" className="size-3.5" />
              </button>
              <button
                aria-label="Show modified paths only"
                aria-pressed={modifiedNodesOnly}
                className={cn(
                  'inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]',
                  modifiedNodesOnly
                    ? 'bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]'
                    : 'text-[var(--text-tertiary)]'
                )}
                onClick={() => setModifiedNodesOnly((enabled) => !enabled)}
                type="button"
              >
                <ListFilter aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          </div>
          {nodeSearchVisible ? (
            <div className="border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 py-2">
              <input
                aria-label="Search changed paths"
                className="h-8 w-full rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-commit)]"
                onChange={(event) => setNodeQuery(event.target.value)}
                placeholder="Find a changed path..."
                value={nodeQuery}
              />
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {visibleChangedStructureRows.length > 0 ? (
              visibleChangedStructureRows.map((row) => (
                <WorkspaceChangedPathRow
                  active={row.id === activeStructureRow?.id}
                  key={row.id}
                  onClick={() => {
                    setSelectedStructureRowId(row.id);
                    if (pane === 'validation') setPane('changes');
                  }}
                  row={row}
                />
              ))
            ) : (
              <div className="px-4 py-5 text-xs leading-5 text-[var(--text-tertiary)]">
                No changed paths match this filter.
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <nav
            aria-label="Review detail"
            className="flex h-12 shrink-0 items-stretch gap-5 border-b border-[var(--stroke-default)] bg-[var(--surface-card)] px-4 md:px-6"
          >
            <ReviewTab
              active={pane === 'changes'}
              icon={Layers3}
              label="Changes"
              onClick={() => setPane('changes')}
            />
            <ReviewTab
              active={pane === 'validation'}
              icon={ShieldCheck}
              label={`Validation ${passedRequiredCheckCount}/${requiredChecks.length}`}
              onClick={() => setPane('validation')}
            />
            <ReviewTab
              active={pane === 'yaml'}
              icon={Code2}
              label="Rendered YAML"
              onClick={() => setPane('yaml')}
            />
          </nav>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            {pane === 'changes' || pane === 'yaml' ? (
              <main className="min-w-0 flex-1 overflow-hidden bg-[var(--surface-panel)]">
                {structureModel.rows.length > 0 && operations.length > 0 ? (
                  <WorkspaceReviewStructureView
                    activeRowId={activeStructureRow?.id ?? null}
                    candidate={controller.candidate}
                    checks={checks}
                    committedId={committedId}
                    controller={controller}
                    modifiedLabel={formatRelativeTime(controller.candidate.updatedAt)}
                    modifiedOnly={modifiedNodesOnly}
                    onEditInCompose={() => onModeChange('compose')}
                    onSelectRow={setSelectedStructureRowId}
                    preparing={preparing}
                    query={nodeQuery}
                    rejected={rejected}
                    reviewReady={Boolean(view)}
                    rows={structureModel.rows}
                    schemaLabel={formatProposalSchemaLabel(controller.candidate)}
                    sourceLabel={materialLabel}
                    view={view}
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
            ) : (
              <section className="min-w-0 flex-1 overflow-y-auto bg-[var(--surface-app)] p-4 [scrollbar-gutter:stable] md:p-8">
                <div className="mx-auto max-w-5xl">
                  <ValidationReviewPane
                    checks={checks}
                    passedRequiredCheckCount={passedRequiredCheckCount}
                    projection={projection}
                    requiredCheckCount={requiredChecks.length}
                  />
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ValidationStatusIcon({
  preparing,
  tone,
}: {
  preparing: boolean;
  tone: 'neutral' | 'success' | 'warning';
}) {
  if (tone === 'success') {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--status-success)] text-[var(--on-status)]">
        <CheckCheck aria-hidden="true" className="size-3" />
      </span>
    );
  }
  if (preparing) {
    return <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />;
  }
  if (tone === 'neutral') {
    return <Clock3 aria-hidden="true" className="size-4 shrink-0" />;
  }
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--status-warning)] text-[var(--on-status)]">
      <AlertTriangle aria-hidden="true" className="size-3" />
    </span>
  );
}

function getValidationHeaderSummary({
  checks,
  currentness,
  failedRequiredCheckCount,
  pendingRequiredCheckCount,
  preparing,
  snapshotCurrent,
  viewReady,
}: {
  checks: ReviewCheckView[];
  currentness: string;
  failedRequiredCheckCount: number;
  pendingRequiredCheckCount: number;
  preparing: boolean;
  snapshotCurrent: boolean;
  viewReady: boolean;
}): { detail: string; title: string } {
  const replay = checks.find((check) => check.label.toLowerCase().includes('replay'));
  const schema = checks.find((check) => check.label.toLowerCase().includes('schema'));
  const checkLabels = [
    validationFactLabel(replay?.status, 'Replay matched', 'Replay failed', 'Replay pending'),
    validationFactLabel(schema?.status, 'Schema valid', 'Schema failed', 'Schema pending'),
  ];
  if (viewReady && !snapshotCurrent && currentness !== 'ready') {
    checkLabels.push('Snapshot stale');
  }

  if (preparing) {
    return { detail: 'Replay and schema checks are running', title: 'Preparing validation' };
  }
  if (failedRequiredCheckCount > 0) {
    return { detail: checkLabels.join(' · '), title: 'Validation needs attention' };
  }
  if (pendingRequiredCheckCount > 0 || !viewReady) {
    return viewReady
      ? { detail: checkLabels.join(' · '), title: 'Validation pending' }
      : { detail: 'Replay and schema checks have not run yet', title: 'Validation not prepared' };
  }
  return {
    detail: checkLabels.join(' · '),
    title: 'Review checks passed',
  };
}

function validationFactLabel(
  status: ReviewCheckStatus | undefined,
  passed: string,
  failed: string,
  pending: string
): string {
  if (status === 'passed') return passed;
  if (status === 'failed') return failed;
  return pending;
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
    <StateCodeView
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

interface WorkspaceReviewStructureRow extends StatePointRow {
  childCount?: number;
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

function WorkspaceReviewStructureView({
  activeRowId,
  candidate,
  checks,
  committedId,
  controller,
  modifiedLabel,
  modifiedOnly,
  onEditInCompose,
  onSelectRow,
  preparing,
  query,
  rejected,
  reviewReady,
  rows,
  schemaLabel,
  sourceLabel,
  view,
  yamlModel,
  snapshotCurrent,
}: {
  activeRowId: string | null;
  candidate: WorkspaceCandidate;
  checks: ReviewCheckView[];
  committedId: string | null;
  controller: WorkspaceComposeReviewController;
  modifiedLabel: string;
  modifiedOnly: boolean;
  onEditInCompose: () => void;
  onSelectRow: (rowId: string) => void;
  preparing: boolean;
  query: string;
  rejected: boolean;
  reviewReady: boolean;
  rows: WorkspaceReviewStructureRow[];
  schemaLabel: string;
  sourceLabel: string;
  view: WorkspaceComposeReviewController['review']['view'];
  yamlModel?: WorkspaceReviewStructureModel;
  snapshotCurrent: boolean;
}) {
  const [expansionOverrides, setExpansionOverrides] = useState<Record<string, boolean>>({});
  const filtering = query.trim().length > 0 || modifiedOnly;
  const visibleRows = useMemo(() => {
    if (filtering) return filterWorkspaceReviewStructureRows(rows, query, modifiedOnly);
    return filterCollapsedWorkspaceReviewRows(rows, (row) =>
      isWorkspaceReviewRowExpanded(row, expansionOverrides)
    );
  }, [expansionOverrides, filtering, modifiedOnly, query, rows]);
  const changedRows = useMemo(() => rows.filter((row) => row.diff?.exact), [rows]);
  const changeReason = candidate.summary;
  const selectedRow =
    (activeRowId ? rows.find((row) => row.id === activeRowId) : null) ??
    visibleRows.find((row) => row.diff?.exact) ??
    visibleRows.find((row) => row.diff) ??
    visibleRows[0] ??
    null;
  const positionLabel = useMemo(() => {
    if (!selectedRow) return null;
    const positionRows = selectedRow.diff ? changedRows : visibleRows;
    const selectedIndex = positionRows.findIndex((row) => row.id === selectedRow.id);
    if (selectedIndex < 0 || positionRows.length === 0) return null;
    return `${selectedIndex + 1} of ${positionRows.length}`;
  }, [changedRows, selectedRow, visibleRows]);
  const toggleRow = useCallback((row: WorkspaceReviewStructureRow) => {
    setExpansionOverrides((current) => ({
      ...current,
      [row.id]: !isWorkspaceReviewRowExpanded(row, current),
    }));
  }, []);

  return (
    <section
      aria-label="Workspace review structure"
      className="grid h-full min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(260px,38vh)] overflow-hidden bg-[var(--surface-app)] min-[1180px]:grid-cols-[minmax(0,1fr)_340px] min-[1180px]:grid-rows-1"
    >
      {yamlModel ? (
        <ResultYamlPane
          model={yamlModel}
          branch={candidate.targetBranch}
          selectedRow={selectedRow}
          onSelectRow={onSelectRow}
          preparing={preparing}
          snapshotCurrent={snapshotCurrent}
        />
      ) : (
        <StateScrollArea
          className="min-h-0 min-w-0 flex-1 border-x border-t border-[var(--stroke-divider)] bg-[var(--surface-panel)]"
          label="Workspace structure rows"
        >
          <table className="w-full min-w-0 table-fixed border-separate border-spacing-0 text-left">
            <colgroup>
              <col className="w-[29%]" />
              <col className="w-[34%]" />
              <col className="w-[28%]" />
              <col className="w-[9%]" />
            </colgroup>
            <tbody>
              {visibleRows.map((row) => (
                <WorkspaceReviewStructureTableRow
                  changeReason={changeReason}
                  expanded={filtering || isWorkspaceReviewRowExpanded(row, expansionOverrides)}
                  key={row.id}
                  modifiedLabel={modifiedLabel}
                  onSelect={() => onSelectRow(row.id)}
                  onToggle={() => toggleRow(row)}
                  row={row}
                  selected={selectedRow?.id === row.id}
                />
              ))}
            </tbody>
          </table>
        </StateScrollArea>
      )}
      <WorkspaceReviewNodeInspector
        rows={rows}
        candidate={candidate}
        checks={checks}
        committedId={committedId}
        controller={controller}
        modifiedLabel={modifiedLabel}
        onEditInCompose={onEditInCompose}
        positionLabel={positionLabel}
        preparing={preparing}
        rejected={rejected}
        reviewReady={reviewReady}
        schemaLabel={schemaLabel}
        selectedRow={selectedRow}
        sourceLabel={sourceLabel}
        view={view}
      />
    </section>
  );
}

function WorkspaceReviewStructureTableRow({
  changeReason,
  expanded,
  modifiedLabel,
  onSelect,
  onToggle,
  row,
  selected,
}: {
  changeReason: string;
  expanded: boolean;
  modifiedLabel: string;
  onSelect: () => void;
  onToggle: () => void;
  row: WorkspaceReviewStructureRow;
  selected: boolean;
}) {
  const rowHeightClass = row.expandable ? 'h-9' : 'h-[34px]';
  const changed = Boolean(row.diff);
  const showModifiedLabel =
    row.diff?.exact ||
    (changed && row.depth === 0) ||
    row.diff?.kind === 'added' ||
    row.diff?.kind === 'removed' ||
    (!changed && row.status !== 'unchanged' && row.status !== 'missing');

  return (
    <tr
      aria-selected={selected}
      className={cn(
        'group cursor-pointer text-[var(--text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]/45',
        rowHeightClass,
        workspaceReviewRowToneClass(row),
        !changed && row.depth > 0 && row.expandable && 'bg-[var(--surface-app)]/55',
        !changed && row.status === 'missing' && 'bg-[var(--status-warning-muted)]/25',
        selected && '[&>td]:bg-[var(--panel)]'
      )}
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
      <td className="sticky left-0 z-10 border-b border-[var(--stroke-divider)] bg-inherit py-0 pl-4 pr-5">
        <WorkspaceReviewDiffGutter diff={row.diff} />
        <span
          className={cn('flex min-w-0 items-center gap-1.5', rowHeightClass)}
          style={{ paddingLeft: row.depth * 16 }}
        >
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
                <ChevronDown aria-hidden="true" className="size-3.5" />
              ) : (
                <ChevronRight aria-hidden="true" className="size-3.5" />
              )}
            </button>
          ) : (
            <span aria-hidden="true" className="size-5 shrink-0" />
          )}
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              workspaceReviewKeyTypographyClass(row),
              row.status === 'missing' && 'text-[var(--status-warning)]'
            )}
            title={row.path}
          >
            {row.key}
          </span>
          {row.expandable && row.childCount ? (
            <span className="ml-1 shrink-0 font-mono text-xs font-medium leading-4 tabular-nums text-[var(--text-tertiary)]">
              {row.childCount}
            </span>
          ) : null}
        </span>
      </td>
      <td className="border-b border-[var(--stroke-divider)] bg-inherit px-4 py-0">
        <WorkspaceReviewValueCell row={row} />
      </td>
      <td className="border-b border-[var(--stroke-divider)] bg-inherit px-4 py-0">
        <WorkspaceReviewEffectCell changeReason={changeReason} row={row} />
      </td>
      <td className="relative whitespace-nowrap border-b border-[var(--stroke-divider)] bg-inherit py-0 pl-3 pr-8 text-right font-sans text-xs font-normal italic leading-4 tracking-[0.01em] tabular-nums text-[var(--text-tertiary)]">
        {selected ? (
          <span
            aria-hidden="true"
            className="-translate-y-1/2 absolute right-2 top-1/2 z-20 hidden size-2.5 rounded-full border border-[var(--surface-card)] bg-[var(--accent-commit)] min-[1180px]:block"
          />
        ) : null}
        {showModifiedLabel ? modifiedLabel : null}
      </td>
    </tr>
  );
}

function workspaceReviewKeyTypographyClass(row: WorkspaceReviewStructureRow): string {
  const machineKey = workspaceReviewMachineKey(row.key);
  if (machineKey) {
    return cn(
      'font-mono text-[13px] leading-5 tracking-normal',
      row.diff?.kind === 'removed'
        ? 'font-medium text-[var(--diff-removed-text)]'
        : row.expandable
          ? 'font-medium text-[var(--text-primary)]'
          : 'font-medium text-[var(--text-secondary)]'
    );
  }
  if (row.expandable && row.depth === 0) {
    return 'font-sans text-[14px] font-semibold leading-5 tracking-normal text-[var(--text-primary)]';
  }
  if (row.expandable && row.depth === 1) {
    return 'font-sans text-[14px] font-semibold leading-5 tracking-normal text-[var(--text-primary)]';
  }
  if (row.expandable) {
    return 'font-sans text-[13px] font-semibold leading-5 tracking-normal text-[var(--text-primary)]';
  }
  if (row.diff?.kind === 'removed') {
    return 'font-sans text-[13px] font-medium leading-5 tracking-normal text-[var(--diff-removed-text)]';
  }
  return 'font-sans text-[13px] font-medium leading-5 tracking-normal text-[var(--text-secondary)]';
}

function WorkspaceReviewDiffGutter({ diff }: { diff?: WorkspaceReviewDiffMeta }) {
  if (!diff || (diff.kind === 'modified' && !diff.exact)) return null;
  return (
    <span
      aria-hidden="true"
      className={cn('absolute inset-y-0 left-0 w-[3px]', workspaceReviewDiffGutterClass(diff.kind))}
    />
  );
}

function WorkspaceReviewValueCell({ row }: { row: WorkspaceReviewStructureRow }) {
  if (row.status === 'missing') {
    return (
      <span className="inline-flex h-5 w-fit items-center rounded-[5px] bg-[var(--status-warning-muted)] px-1.5 font-sans text-xs font-semibold leading-4 text-[var(--status-warning)]">
        Missing
      </span>
    );
  }

  const value = row.diff?.kind === 'removed' ? row.diff.beforeValue : row.value;
  if (value === '-') return null;

  return (
    <span
      className={cn(
        'inline-flex max-w-full truncate font-normal leading-5',
        workspaceReviewValueTypographyClass(value),
        workspaceReviewValueToneClass(row.diff?.kind),
        !row.diff && value.toLowerCase() === 'empty' && 'text-[var(--text-tertiary)]'
      )}
      title={
        row.diff?.exact && row.diff.kind === 'modified'
          ? `${row.diff.beforeValue} -> ${row.diff.afterValue}`
          : value
      }
    >
      {value}
    </span>
  );
}

function WorkspaceReviewEffectCell({
  changeReason,
  row,
}: {
  changeReason: string;
  row: WorkspaceReviewStructureRow;
}) {
  if (row.diff) {
    const fullReason = row.diff.reason || row.diff.summary;
    const reason = row.diff.exact
      ? compactWorkspaceReviewReason(fullReason)
      : `${String(row.diff.count)} path${row.diff.count === 1 ? '' : 's'} changed`;
    return (
      <span className="flex min-w-0 items-center gap-[7px]">
        {row.diff.exact ? (
          <WorkspaceReviewDiffBadge diff={row.diff} sourceOp={row.sourceOp} />
        ) : (
          <WorkspaceReviewDiffSummary diff={row.diff} />
        )}
        <span
          className="block min-w-0 truncate font-sans text-xs font-normal leading-[18px] tracking-normal text-[var(--text-secondary)]"
          title={fullReason || reason}
        >
          {reason}
        </span>
      </span>
    );
  }

  if (row.status === 'missing' || row.status === 'unchanged') return null;

  const operationLabel = row.sourceOp === '-' ? row.statusLabel : row.sourceOp;
  const reason = row.statusLabel === operationLabel ? 'Operation applied' : row.statusLabel;

  return (
    <span className="flex min-w-0 items-center gap-[7px]">
      <span className="inline-flex h-5 shrink-0 items-center rounded-[5px] bg-[var(--surface-app)] px-1.5 font-sans text-xs font-semibold leading-4 tracking-normal text-[var(--text-secondary)]">
        {operationLabel}
      </span>
      <span
        className="block min-w-0 truncate font-sans text-xs font-normal leading-[18px] tracking-normal text-[var(--text-secondary)]"
        title={changeReason || reason}
      >
        {reason}
      </span>
    </span>
  );
}

function WorkspaceReviewDiffBadge({
  diff,
  sourceOp,
}: {
  diff: WorkspaceReviewDiffMeta;
  sourceOp: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-[5px] px-1.5 font-sans text-xs font-semibold leading-4 tracking-normal',
        workspaceReviewDiffBadgeClass(diff.kind)
      )}
      title={diff.summary}
    >
      <span aria-hidden="true" className="font-mono text-xs tracking-normal">
        {workspaceReviewDiffSymbol(diff.kind)}
      </span>
      <span>{workspaceReviewDiffOperationLabel(diff, sourceOp)}</span>
    </span>
  );
}

function WorkspaceReviewDiffSummary({ diff }: { diff: WorkspaceReviewDiffMeta }) {
  return (
    <span
      className={cn(
        'inline-flex w-3 shrink-0 items-center justify-center font-mono text-xs font-semibold leading-4 tracking-normal',
        workspaceReviewDiffTextClass(diff.kind)
      )}
      title={diff.summary}
    >
      <span aria-hidden="true">{workspaceReviewDiffSymbol(diff.kind)}</span>
      <span className="sr-only">{workspaceReviewDiffOperationLabel(diff, '-')}</span>
    </span>
  );
}

export function selectWorkspaceChangeCardRows<
  T extends {
    path: string;
    expandable: boolean;
    diff?: { exact: boolean };
  },
>(rows: T[], selectedRow: T | null): T[] {
  if (!selectedRow) return [];
  if (!selectedRow.expandable) return [selectedRow];
  const descendants = rows.filter((row) => row.path.startsWith(`${selectedRow.path}/`));
  const fields = descendants.filter(
    (row) => !row.expandable || !descendants.some((child) => child.path.startsWith(`${row.path}/`))
  );
  return fields.length > 0 ? fields : [selectedRow];
}

function WorkspaceReviewNodeInspector({
  rows,
  candidate,
  checks,
  committedId,
  controller,
  modifiedLabel,
  onEditInCompose,
  positionLabel,
  preparing,
  rejected,
  reviewReady,
  schemaLabel,
  selectedRow,
  sourceLabel,
  view,
}: {
  rows: WorkspaceReviewStructureRow[];
  candidate: WorkspaceCandidate;
  checks: ReviewCheckView[];
  committedId: string | null;
  controller: WorkspaceComposeReviewController;
  modifiedLabel: string;
  onEditInCompose: () => void;
  positionLabel: string | null;
  preparing: boolean;
  rejected: boolean;
  reviewReady: boolean;
  schemaLabel: string;
  selectedRow: WorkspaceReviewStructureRow | null;
  sourceLabel: string;
  view: WorkspaceComposeReviewController['review']['view'];
}) {
  const source = selectedRow
    ? workspaceReviewSourceDisplay(candidate, selectedRow, sourceLabel)
    : { href: null, label: sourceLabel };
  const sourceText = source.label;
  const beforeValue = selectedRow ? workspaceReviewBeforeValue(selectedRow) : '';
  const resultValue = selectedRow ? workspaceReviewResultValue(selectedRow) : '';
  const whyText = selectedRow ? workspaceReviewEffectText(selectedRow) : '';
  const [editing, setEditing] = useState(false);
  const [draftResult, setDraftResult] = useState(resultValue);
  const [draftSource, setDraftSource] = useState(sourceText);
  const [draftWhy, setDraftWhy] = useState(whyText);

  useEffect(() => {
    setEditing(false);
    setDraftResult(resultValue);
    setDraftSource(sourceText);
    setDraftWhy(whyText);
  }, [resultValue, selectedRow?.id, sourceText, whyText]);

  return (
    <aside
      aria-label="Workspace selected change"
      className="h-full min-h-0 min-w-0 overflow-hidden border-r border-t border-[var(--stroke-divider)] bg-[var(--surface-card)] [--review-scroll-gutter:0.875rem] min-[1180px]:border-l min-[1180px]:border-t-0"
    >
      {editing ? (
        <WorkspaceReviewChangeEditPanel
          baseRevisionLabel={workspaceReviewBaseRevisionLabel(candidate)}
          beforeValue={beforeValue}
          draftResult={draftResult}
          draftSource={draftSource}
          draftWhy={draftWhy}
          nextRevisionLabel={String((candidate.revision ?? 1) + 1)}
          onCancel={() => {
            setDraftResult(resultValue);
            setDraftSource(sourceText);
            setDraftWhy(whyText);
            setEditing(false);
          }}
          onDraftResultChange={setDraftResult}
          onDraftSourceChange={setDraftSource}
          onDraftWhyChange={setDraftWhy}
          onSave={() => setEditing(false)}
          pathLabel={selectedRow ? workspaceReviewPathLabel(selectedRow) : ''}
          row={selectedRow}
        />
      ) : (
        <WorkspaceReviewChangeReviewPanel
          changeRows={selectWorkspaceChangeCardRows(rows, selectedRow)}
          candidate={candidate}
          checks={checks}
          committedId={committedId}
          controller={controller}
          modifiedLabel={modifiedLabel}
          onEditInCompose={onEditInCompose}
          positionLabel={positionLabel}
          preparing={preparing}
          rejected={rejected}
          reviewReady={reviewReady}
          row={selectedRow}
          schemaLabel={schemaLabel}
          source={source}
          view={view}
          whyText={whyText}
        />
      )}
    </aside>
  );
}

type WorkspaceReviewInspectorTone =
  | 'added'
  | 'branch'
  | 'commit'
  | 'modified'
  | 'neutral'
  | 'removed'
  | 'source'
  | 'success'
  | 'warning';

function WorkspaceReviewChangeReviewPanel({
  changeRows,
  candidate,
  checks,
  committedId,
  controller,
  modifiedLabel,
  onEditInCompose,
  positionLabel,
  preparing,
  rejected,
  reviewReady,
  row,
  schemaLabel,
  source,
  view,
  whyText,
}: {
  changeRows: WorkspaceReviewStructureRow[];
  candidate: WorkspaceCandidate;
  checks: ReviewCheckView[];
  committedId: string | null;
  controller: WorkspaceComposeReviewController;
  modifiedLabel: string;
  onEditInCompose: () => void;
  positionLabel: string | null;
  preparing: boolean;
  rejected: boolean;
  reviewReady: boolean;
  row: WorkspaceReviewStructureRow | null;
  schemaLabel: string;
  source: { href: string | null; label: string };
  view: WorkspaceComposeReviewController['review']['view'];
  whyText: string;
}) {
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const inspectorChecks = row
    ? workspaceReviewInspectorChecks(row, checks, candidate, reviewReady)
    : [];
  const failedChecks = inspectorChecks.filter((check) => check.status !== 'passed');
  const passedCheckCount = inspectorChecks.length - failedChecks.length;
  const checkSummary =
    failedChecks.length > 0
      ? `${passedCheckCount} passed · ${failedChecks.length} ${
          failedChecks.length === 1 ? 'needs review' : 'need review'
        }`
      : 'Replay matched · Schema valid';
  const technicalDetailsId = row
    ? `workspace-review-technical-details-${workspaceReviewDomToken(row.id)}`
    : undefined;

  useEffect(() => {
    setTechnicalOpen(false);
  }, [row?.id]);

  return (
    <form
      aria-label="Workspace selected change form"
      className="flex h-full min-h-0 min-w-0 flex-col"
      onSubmit={(event) => event.preventDefault()}
    >
      <StateScrollArea
        className="min-h-0 flex-1 bg-[var(--surface-card)] pr-[var(--review-scroll-gutter)] [&>[data-slot=state-scroll-area-scrollbar]]:invisible"
        label="Workspace selected change"
      >
        {row ? (
          <div className="min-w-0">
            <section
              aria-label="Selected change cards"
              className="min-w-0 w-full max-w-full border-b border-[var(--stroke-divider)]"
            >
              <span className="sr-only">
                {workspaceReviewPathLabel(row)} · {positionLabel ?? '1 of 1'} · {source.label} ·{' '}
                {workspaceReviewBaseRevisionLabel(candidate)} · {modifiedLabel}
              </span>
              <WorkspaceReviewCardArea rows={changeRows} selectedRow={row} />
            </section>

            <div className="relative min-w-0 px-4 pb-5 pt-9">
              <span
                aria-hidden="true"
                className="absolute bottom-8 left-8 top-10 w-px bg-[var(--stroke-divider)]"
              />
              <WorkspaceReviewTimelineItem icon={CircleHelp} title="Why">
                <p className="text-[13px] leading-5 text-[var(--text-primary)] [overflow-wrap:anywhere]">
                  {whyText}
                </p>
              </WorkspaceReviewTimelineItem>

              <WorkspaceReviewTimelineItem icon={Link2} title="Source">
                {source.href ? (
                  <NextLink
                    className="block min-w-0 font-mono text-[13px] font-semibold leading-5 text-[var(--accent-commit)] underline-offset-2 transition-colors [overflow-wrap:anywhere] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35"
                    href={source.href}
                    title={source.label}
                  >
                    {source.label}
                  </NextLink>
                ) : (
                  <span className="block min-w-0 font-mono text-[13px] font-medium leading-5 text-[var(--text-tertiary)] [overflow-wrap:anywhere]">
                    {source.label || 'No source material linked'}
                  </span>
                )}
                <p className="mt-3 break-words font-mono text-xs leading-[18px] text-[var(--text-secondary)] [overflow-wrap:anywhere]">
                  {workspaceReviewSourcePreview(candidate, row)}
                </p>
              </WorkspaceReviewTimelineItem>

              <WorkspaceReviewTimelineItem icon={ShieldCheck} title="Verified">
                <div className="flex min-w-0 items-center gap-2 text-[13px] leading-5 text-[var(--text-primary)]">
                  <span
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      failedChecks.length > 0
                        ? 'bg-[var(--status-error)]'
                        : 'bg-[var(--status-success)]'
                    )}
                  />
                  <span className="truncate">{checkSummary}</span>
                </div>
                {failedChecks.length > 0 ? (
                  <div className="mt-3 grid min-w-0 grid-cols-1 gap-2">
                    {failedChecks.map((check) => (
                      <div
                        className="min-w-0 border-l-2 border-[var(--status-error)] bg-[var(--status-error-muted)] px-2.5 py-1 [overflow-wrap:anywhere]"
                        key={check.label}
                      >
                        <p className="text-[13px] font-semibold leading-5 text-[var(--status-error)]">
                          {check.label}
                        </p>
                        <p className="mt-0.5 text-xs leading-[18px] text-[var(--text-secondary)]">
                          {check.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </WorkspaceReviewTimelineItem>
            </div>

            <div className="border-b border-[var(--stroke-divider)]">
              <div className="flex min-h-10 items-center justify-between px-4 text-[13px] leading-5">
                <span className="text-[var(--text-secondary)]">Technical details</span>
                <button
                  aria-controls={technicalDetailsId}
                  aria-expanded={technicalOpen}
                  className="rounded-[4px] px-1 font-medium text-[var(--accent-commit)] transition-colors hover:text-[var(--commit-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35"
                  onClick={() => setTechnicalOpen((open) => !open)}
                  type="button"
                >
                  {technicalOpen ? 'Hide' : 'View'}
                </button>
              </div>
              {technicalOpen ? (
                <WorkspaceReviewTechnicalDetails
                  candidate={candidate}
                  id={technicalDetailsId}
                  reviewReady={reviewReady}
                  row={row}
                  schemaLabel={schemaLabel}
                  sourceLabel={source.label}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <div className="p-4">
            <p className="rounded-[6px] border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-app)] px-3 py-4 text-[13px] leading-5 text-[var(--text-secondary)]">
              No state point selected.
            </p>
          </div>
        )}
      </StateScrollArea>
      <footer className="shrink-0 border-t border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 py-2 pr-[calc(1rem+var(--review-scroll-gutter))]">
        <WorkspaceReviewDecisionActions
          committedId={committedId}
          controller={controller}
          onEditInCompose={onEditInCompose}
          preparing={preparing}
          rejected={rejected}
          view={view}
        />
      </footer>
    </form>
  );
}

function WorkspaceReviewChangeEditPanel({
  baseRevisionLabel,
  beforeValue,
  draftResult,
  draftSource,
  draftWhy,
  nextRevisionLabel,
  onCancel,
  onDraftResultChange,
  onDraftSourceChange,
  onDraftWhyChange,
  onSave,
  pathLabel,
  row,
}: {
  baseRevisionLabel: string;
  beforeValue: string;
  draftResult: string;
  draftSource: string;
  draftWhy: string;
  nextRevisionLabel: string;
  onCancel: () => void;
  onDraftResultChange: (value: string) => void;
  onDraftSourceChange: (value: string) => void;
  onDraftWhyChange: (value: string) => void;
  onSave: () => void;
  pathLabel: string;
  row: WorkspaceReviewStructureRow | null;
}) {
  return (
    <form
      aria-label="Workspace selected change form"
      className="flex h-full min-h-0 min-w-0 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <StateScrollArea className="min-h-0 flex-1 bg-[var(--surface-card)]" label="Edit result">
        <header className="flex min-h-[30px] items-center justify-between border-b border-[var(--stroke-divider)] px-3 py-2">
          <h2 className="text-sm font-semibold leading-5 text-[var(--text-primary)]">
            Edit result
          </h2>
          <button
            className="text-xs font-medium leading-4 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        </header>
        {row ? (
          <div className="min-w-0 px-3 py-4">
            <p className="truncate font-mono text-xs leading-[18px] text-[var(--text-tertiary)]">
              {pathLabel}
            </p>
            <h3 className="mt-1 text-[16px] font-semibold leading-6 text-[var(--text-primary)]">
              Propose a new result
            </h3>
            <p className="mt-0.5 text-xs leading-[18px] text-[var(--text-tertiary)]">
              History is immutable. Saving adds a new attributed revision.
            </p>

            <div className="mt-4 grid gap-3">
              <WorkspaceReviewEditField label="Before" meta="Recorded · locked">
                <output
                  aria-label="Before"
                  className="block min-h-9 rounded-[4px] bg-[var(--surface-app)] px-3 py-2 font-mono text-[13px] leading-5 text-[var(--text-primary)]"
                >
                  {beforeValue}
                </output>
              </WorkspaceReviewEditField>

              <WorkspaceReviewEditField label="Proposed result" meta="Required">
                <textarea
                  aria-label="Proposed result"
                  className="block min-h-[42px] w-full resize-none rounded-[5px] border border-[var(--accent-pending)] bg-[var(--surface-card)] px-3 py-2 font-mono text-[13px] leading-5 text-[var(--text-primary)] outline-none transition-[box-shadow,border-color] focus-visible:ring-2 focus-visible:ring-[var(--accent-pending)]/25"
                  onChange={(event) => onDraftResultChange(event.target.value)}
                  value={draftResult}
                />
              </WorkspaceReviewEditField>

              <WorkspaceReviewEditField label="Why is this result different?" meta="Required">
                <textarea
                  aria-label="Why is this result different?"
                  className="block min-h-[72px] w-full resize-none rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 py-2 text-[13px] leading-5 text-[var(--text-primary)] outline-none transition-[box-shadow,border-color] focus-visible:border-[var(--accent-pending)] focus-visible:ring-2 focus-visible:ring-[var(--accent-pending)]/20"
                  onChange={(event) => onDraftWhyChange(event.target.value)}
                  value={draftWhy}
                />
              </WorkspaceReviewEditField>

              <WorkspaceReviewEditField label="Source" meta="Linked">
                <input
                  aria-label="Source"
                  className="h-10 w-full rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 font-mono text-[13px] font-medium text-[var(--accent-commit)] outline-none transition-[box-shadow,border-color] focus-visible:border-[var(--accent-commit)] focus-visible:ring-2 focus-visible:ring-[var(--accent-commit)]/20"
                  onChange={(event) => onDraftSourceChange(event.target.value)}
                  value={draftSource}
                />
              </WorkspaceReviewEditField>

              <p className="flex min-h-8 items-center gap-2 rounded-[5px] border border-[var(--accent-pending)]/35 bg-[var(--accent-pending-soft)] px-3 text-xs font-medium leading-[18px] text-[var(--accent-pending)]">
                <span className="size-1.5 shrink-0 rounded-full bg-[var(--accent-pending)]" />
                Schema checks run now; replay reruns after save.
              </p>

              <p className="text-xs leading-[18px] text-[var(--text-tertiary)]">
                Creates revision {nextRevisionLabel} from {baseRevisionLabel} · approval and merge
                remain at review level.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <p className="rounded-[6px] border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-app)] px-3 py-4 text-[12px] leading-5 text-[var(--text-secondary)]">
              No state point selected.
            </p>
          </div>
        )}
      </StateScrollArea>
      <footer className="grid shrink-0 grid-cols-[1fr_72px] gap-2 border-t border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2 py-2">
        <button
          className="h-8 rounded-[5px] bg-[var(--accent-pending)] px-3 text-[13px] font-semibold leading-5 text-[var(--on-accent)] shadow-[var(--fx-shadow-sm)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent-pending)_88%,black)]"
          type="submit"
        >
          Save revision
        </button>
        <button
          className="h-8 rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-3 text-[13px] font-semibold leading-5 text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </footer>
    </form>
  );
}

function WorkspaceReviewCardArea({
  rows,
  selectedRow,
}: {
  rows: WorkspaceReviewStructureRow[];
  selectedRow: WorkspaceReviewStructureRow;
}) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  const tone = workspaceReviewDiffTone(selectedRow.diff?.kind);
  const missing = !selectedRow.diff && selectedRow.status === 'missing';

  return (
    <>
      <button
        aria-controls={contentId}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse card area' : 'Expand card area'}
        className="flex h-9 min-w-0 w-full max-w-full items-center gap-2 px-4 text-left text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]/40"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        {expanded ? (
          <ChevronDown aria-hidden="true" className="size-3.5" />
        ) : (
          <ChevronRight aria-hidden="true" className="size-3.5" />
        )}
        <span className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">
          Selected change
        </span>
        <span
          className={cn(
            'text-xs font-semibold uppercase',
            missing ? 'text-[var(--status-warning)]' : workspaceReviewTextToneClass(tone)
          )}
        >
          {selectedRow.diff
            ? workspaceReviewKindLabel(selectedRow)
            : missing
              ? 'Missing'
              : 'Unchanged'}
        </span>
        <span className="ml-auto text-xs text-[var(--text-tertiary)]">
          {expanded ? 'Collapse' : 'Expand'}
        </span>
      </button>
      <div className="min-w-0 w-full max-w-full" hidden={!expanded} id={contentId}>
        {expanded ? (
          <StateScrollArea
            className="w-full max-w-full [&>[data-slot=state-scroll-area-scrollbar]]:invisible"
            key={selectedRow.id}
            label="Node cards"
            viewportClassName="!h-auto max-h-[40dvh] max-w-full"
          >
            {rows.map((row) => (
              <WorkspaceReviewChangeCard key={row.id} row={row} />
            ))}
            {rows.length === 0 ? (
              <p className="px-4 py-3 text-[13px] leading-5 text-[var(--text-tertiary)]">
                No fields in this group.
              </p>
            ) : null}
          </StateScrollArea>
        ) : null}
      </div>
    </>
  );
}

function WorkspaceReviewChangeCard({ row }: { row: WorkspaceReviewStructureRow }) {
  const changed = Boolean(row.diff?.exact);
  const tone = changed ? workspaceReviewDiffTone(row.diff?.kind) : 'neutral';
  return (
    <article
      aria-description={
        changed ? workspaceReviewKindLabel(row) : row.status === 'missing' ? 'Missing' : 'Unchanged'
      }
      aria-label={`Change card ${row.path}`}
      className="min-w-0 px-4 py-3 [&+article]:border-t [&+article]:border-[var(--stroke-divider)]"
    >
      <h2
        className="truncate text-[18px] font-semibold leading-7 text-[var(--text-primary)]"
        title={row.key}
      >
        {row.key}
      </h2>
      <WorkspaceReviewInlineChange
        beforeValue={
          !changed && row.status === 'missing' ? 'Not recorded' : workspaceReviewBeforeValue(row)
        }
        resultValue={
          !changed && row.status === 'missing' ? 'Not recorded' : workspaceReviewResultValue(row)
        }
        tone={tone}
      />
    </article>
  );
}

function WorkspaceReviewInlineChange({
  beforeValue,
  resultValue,
  tone,
}: {
  beforeValue: string;
  resultValue: string;
  tone: WorkspaceReviewInspectorTone;
}) {
  return (
    <div className="mt-3 min-w-0" data-testid="workspace-value-change">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 px-2">
        <span className="text-[10px] font-semibold uppercase leading-3 text-[var(--text-tertiary)]">
          Before
        </span>
        <span aria-hidden="true" className="w-4" />
        <span className="text-[10px] font-semibold uppercase leading-3 text-[var(--text-tertiary)]">
          Result
        </span>
      </div>
      <div
        className="mt-1 grid h-9 min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 overflow-hidden rounded-[8px] border border-[var(--stroke-default)] bg-[var(--panel)] px-2 py-1 shadow-[var(--fx-shadow-sm)]"
        data-testid="workspace-value-frame"
      >
        <WorkspaceReviewInlineValueCard
          label="Before"
          value={beforeValue}
          valueClassName={
            tone === 'neutral' ? 'text-[var(--text-secondary)]' : 'text-[var(--diff-removed-text)]'
          }
        />
        <span
          aria-hidden="true"
          className="flex h-7 items-center font-mono text-xs leading-5 text-[var(--text-tertiary)]"
        >
          {tone === 'neutral' ? '—' : '->'}
        </span>
        <WorkspaceReviewInlineValueCard
          label="Result"
          value={resultValue}
          valueClassName={workspaceReviewResultTextToneClass(tone)}
        />
      </div>
    </div>
  );
}

function WorkspaceReviewInlineValueCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName: string;
}) {
  return (
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>
        <button
          aria-label={`${label} full value: ${value}`}
          className="block h-7 w-full min-w-0 overflow-hidden rounded-[6px] px-1.5 text-left transition-[background-color,color] hover:bg-[var(--surface-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-commit)]/10"
          data-testid={`workspace-${label.toLowerCase()}-value`}
          title={value}
          type="button"
        >
          <span
            className={cn(
              'block max-w-full truncate font-mono text-[13px] font-semibold leading-7',
              valueClassName
            )}
          >
            {value}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent
        align="start"
        className="!w-[380px] !max-w-[calc(100vw-32px)] !rounded-[10px] !border !border-[var(--stroke-default)] !bg-[var(--surface-elevated)] !p-0 !text-[var(--text-primary)] !shadow-[var(--fx-shadow-lg)] [&>svg]:!bg-[var(--surface-elevated)] [&>svg]:!fill-[var(--surface-elevated)]"
        side="bottom"
        sideOffset={8}
      >
        <div className="p-3">
          <span className="block font-sans text-[10px] font-semibold uppercase leading-3 text-[var(--text-tertiary)]">
            {label} full value
          </span>
          <pre
            className={cn(
              'mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-[18px]',
              valueClassName
            )}
          >
            {value}
          </pre>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function WorkspaceReviewTimelineItem({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <section className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-5">
      <div className="relative z-10 flex justify-center pt-0.5">
        <span className="flex size-8 items-center justify-center rounded-[5px] border border-[color-mix(in_srgb,var(--accent-commit)_18%,var(--stroke-divider))] bg-[color-mix(in_srgb,var(--accent-commit)_10%,var(--surface-card))] text-[var(--accent-commit)]">
          <Icon aria-hidden="true" className="size-[15px] shrink-0" strokeWidth={2.2} />
        </span>
      </div>
      <div className="min-w-0 border-b border-[var(--stroke-divider)] pb-7 pt-2.5">
        <h3 className="mb-2.5 text-xs font-semibold uppercase leading-4 text-[var(--text-secondary)]">
          {title}
        </h3>
        {children}
      </div>
    </section>
  );
}

function WorkspaceReviewEditField({
  children,
  label,
  meta,
}: {
  children: ReactNode;
  label: string;
  meta: string;
}) {
  return (
    <div className="block min-w-0">
      <span className="mb-1.5 flex min-h-4 items-center justify-between gap-2 text-xs font-medium leading-4 text-[var(--text-tertiary)]">
        <span>{label}</span>
        <span className="font-medium normal-case tracking-[0] text-[var(--text-quaternary)]">
          {meta}
        </span>
      </span>
      {children}
    </div>
  );
}

function WorkspaceReviewTechnicalDetails({
  candidate,
  id,
  reviewReady,
  row,
  schemaLabel,
  sourceLabel,
}: {
  candidate: WorkspaceCandidate;
  id?: string;
  reviewReady: boolean;
  row: WorkspaceReviewStructureRow;
  schemaLabel: string;
  sourceLabel: string;
}) {
  const details = [
    { label: 'State path', value: workspaceReviewPathLabel(row) },
    { label: 'Type', value: row.type },
    { label: 'Effect', value: workspaceReviewOperationPreview(row) },
    { label: 'Replay', value: workspaceReviewReplayLabel(candidate, reviewReady) },
    { label: 'Schema', value: schemaLabel },
    { label: 'Commit', value: workspaceReviewCommitLabel(candidate) },
    { label: 'Source', value: sourceLabel || 'No source material linked' },
  ];

  return (
    <div className="bg-[var(--surface-app)] px-3 pb-3 pt-1.5" id={id}>
      <dl className="grid gap-1.5">
        {details.map((detail) => (
          <div
            className="grid min-h-6 grid-cols-[74px_minmax(0,1fr)] items-start gap-2"
            key={detail.label}
          >
            <dt className="pt-1 text-xs font-medium leading-4 text-[var(--text-tertiary)]">
              {detail.label}
            </dt>
            <dd
              className="min-w-0 truncate rounded-[4px] bg-[var(--surface-card)] px-2 py-1 font-mono text-xs leading-[18px] text-[var(--text-secondary)]"
              title={detail.value}
            >
              {detail.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function WorkspaceChangedPathRow({
  active,
  onClick,
  row,
}: {
  active?: boolean;
  onClick: () => void;
  row: WorkspaceReviewStructureRow;
}) {
  const kind = row.diff?.kind ?? 'modified';
  const displayLabel = row.path.length > 34 ? `${row.path.slice(0, 31)}...` : row.path;

  return (
    <button
      aria-label={`Select change ${row.path}`}
      aria-pressed={active}
      className={cn(
        'group relative flex w-full items-start gap-3 border-b border-[var(--stroke-divider)] px-3 py-3 text-left transition-colors focus:outline-none focus-visible:bg-[var(--panel)]',
        active
          ? 'bg-[var(--panel)] text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
      )}
      onClick={onClick}
      type="button"
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-1 h-7 w-[3px] shrink-0 rounded-full',
          workspaceReviewDiffGutterClass(kind)
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'min-w-0 truncate text-xs',
              active ? 'font-semibold text-[var(--text-primary)]' : 'font-medium'
            )}
            title={row.path}
          >
            {displayLabel}
          </span>
          {row.diff ? <WorkspaceReviewDiffSummary diff={row.diff} /> : null}
        </span>
        <span className="mt-1 block truncate text-[11px] text-[var(--text-tertiary)]">
          {row.diff?.summary ?? row.statusLabel}
        </span>
      </span>
    </button>
  );
}

interface ReviewCheckView {
  detail: string;
  label: string;
  requirement: 'required' | 'system';
  status: ReviewCheckStatus;
}

function ValidationReviewPane({
  checks,
  passedRequiredCheckCount,
  projection,
  requiredCheckCount,
}: {
  checks: ReviewCheckView[];
  passedRequiredCheckCount: number;
  projection: WorkspaceComposeReviewController['review']['changeProjection'];
  requiredCheckCount: number;
}) {
  const requiredChecks = checks.filter((check) => check.requirement === 'required');
  const systemChecks = checks.filter((check) => check.requirement === 'system');
  const requiredChecksPassed =
    requiredCheckCount > 0 && passedRequiredCheckCount === requiredCheckCount;
  return (
    <section className="min-h-[360px] overflow-hidden rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-card)] shadow-[var(--fx-shadow-sm)]">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--stroke-divider)] px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Validation</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--text-secondary)]">
            Validation determines whether the exact result can be approved. It does not make the
            human decision or commit State.
          </p>
        </div>
        <span
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-semibold',
            requiredChecksPassed
              ? 'bg-[var(--status-success-muted)] text-[var(--status-success)]'
              : 'bg-[var(--status-warning-muted)] text-[var(--status-warning)]'
          )}
        >
          {passedRequiredCheckCount}/{requiredCheckCount} passed
        </span>
      </header>

      <div className="grid gap-3 p-5 md:grid-cols-2">
        {requiredChecks.map((check) => (
          <ReviewCheckCard check={check} key={check.label} />
        ))}
      </div>

      {systemChecks.length > 0 ? (
        <div className="border-t border-[var(--stroke-divider)] px-5 py-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
            System assurance
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {systemChecks.map((check) => (
              <ReviewCheckCard check={check} key={check.label} />
            ))}
          </div>
        </div>
      ) : null}

      {projection?.currentness.reasons.length ? (
        <div className="border-t border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] px-5 py-4 text-xs text-[var(--status-warning)]">
          Refresh this review before deciding:{' '}
          {projection.currentness.reasons.map((reason) => reason.replaceAll('_', ' ')).join(', ')}.
        </div>
      ) : null}
    </section>
  );
}

function ReviewCheckCard({ check }: { check: ReviewCheckView }) {
  return (
    <article className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4">
      <div className="flex items-start gap-3">
        {check.status === 'passed' ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--status-success)]" />
        ) : check.status === 'failed' ? (
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--status-error)]" />
        ) : (
          <Clock3 className="mt-0.5 size-4 shrink-0 text-[var(--status-warning)]" />
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-[var(--text-primary)]">{check.label}</p>
            <span className="rounded bg-[var(--surface-card)] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[var(--text-tertiary)]">
              {check.requirement === 'required' ? 'Required' : 'System'}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{check.detail}</p>
        </div>
      </div>
    </article>
  );
}

function WorkspaceReviewDecisionActions({
  committedId,
  controller,
  onEditInCompose,
  preparing,
  rejected,
  view,
}: {
  committedId: string | null;
  controller: WorkspaceComposeReviewController;
  onEditInCompose: () => void;
  preparing: boolean;
  rejected: boolean;
  view: WorkspaceComposeReviewController['review']['view'];
}) {
  const hasReceipt = Boolean(controller.review.commands || controller.review.reviewSnapshot);
  if (committedId) {
    return (
      <div className="grid gap-2">
        <button
          className="inline-flex h-8 w-full items-center justify-center rounded-[5px] bg-[var(--accent-commit)] px-3 text-[13px] font-semibold leading-5 text-[var(--on-accent)] shadow-[var(--fx-shadow-sm)] transition-colors hover:bg-[var(--commit-hover)]"
          onClick={controller.viewCommit}
          type="button"
        >
          View in State
        </button>
        <div className={cn('grid gap-2', hasReceipt ? 'grid-cols-2' : 'grid-cols-1')}>
          <button
            className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-3 text-[13px] font-semibold leading-5 text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
            onClick={onEditInCompose}
            type="button"
          >
            <span className="truncate">Edit in Compose</span>
            <ArrowLeft aria-hidden="true" className="size-3.5 shrink-0" />
          </button>
          {hasReceipt ? (
            <button
              className="inline-flex h-8 min-w-0 items-center justify-center rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-3 text-[13px] font-semibold leading-5 text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
              onClick={() => void controller.copyReceipt()}
              type="button"
            >
              <span className="truncate">Copy receipt</span>
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="grid gap-2">
        <button
          className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-[5px] bg-[var(--accent-commit)] px-3 text-[13px] font-semibold leading-5 text-[var(--on-accent)] shadow-[var(--fx-shadow-sm)] transition-colors hover:bg-[var(--commit-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={controller.isBusy}
          onClick={() => void controller.prepareReview()}
          type="button"
        >
          {preparing ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}
          <span className="truncate">Prepare exact review</span>
          <ArrowRight aria-hidden="true" className="size-3.5 shrink-0" />
        </button>
        <button
          className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-3 text-[13px] font-semibold leading-5 text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
          onClick={onEditInCompose}
          type="button"
        >
          <span className="truncate">Edit in Compose</span>
          <ArrowLeft aria-hidden="true" className="size-3.5 shrink-0" />
        </button>
      </div>
    );
  }

  if (rejected) {
    return (
      <button
        className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-3 text-[13px] font-semibold leading-5 text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
        onClick={onEditInCompose}
        type="button"
      >
        <span className="truncate">Edit in Compose</span>
        <ArrowLeft aria-hidden="true" className="size-3.5 shrink-0" />
      </button>
    );
  }

  const acceptAllowed = view.capabilities.accept.disposition === 'allowed';
  const rejectAllowed = view.capabilities.reject.disposition === 'allowed';
  const overrideAllowed = view.capabilities.override.disposition === 'allowed';
  return (
    <div className="grid gap-2">
      {overrideAllowed ? (
        <input
          aria-label="Override reason"
          className="h-8 w-full rounded-[5px] border border-[var(--status-warning)]/40 bg-[var(--surface-card)] px-3 text-[13px] leading-5 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--status-warning)]"
          onChange={(event) => controller.setDecisionReason(event.target.value)}
          placeholder="Required override reason"
          value={controller.decisionReason}
        />
      ) : null}
      {acceptAllowed ? (
        <button
          className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-[5px] bg-[var(--accent-commit)] px-3 text-[13px] font-semibold leading-5 text-[var(--on-accent)] shadow-[var(--fx-shadow-sm)] transition-colors hover:bg-[var(--commit-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={controller.isBusy}
          onClick={() => void controller.decide('accepted')}
          type="button"
        >
          {controller.isBusy ? (
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          ) : null}
          <span className="truncate">
            Commit {controller.candidate.yopsDraft.operations.length} changes
          </span>
        </button>
      ) : null}
      {overrideAllowed ? (
        <button
          className="inline-flex h-8 w-full items-center justify-center rounded-[5px] border border-[var(--status-warning)]/40 bg-[var(--status-warning-muted)] px-3 text-[13px] font-semibold leading-5 text-[var(--status-warning)] transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={controller.isBusy || !controller.decisionReason.trim()}
          onClick={() => void controller.decide('overridden', controller.decisionReason)}
          type="button"
        >
          Continue anyway
        </button>
      ) : null}
      <div className={cn('grid gap-2', rejectAllowed ? 'grid-cols-2' : 'grid-cols-1')}>
        <button
          className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-3 text-[13px] font-semibold leading-5 text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
          onClick={onEditInCompose}
          type="button"
        >
          <span className="truncate">Edit in Compose</span>
          <ArrowLeft aria-hidden="true" className="size-3.5 shrink-0" />
        </button>
        {rejectAllowed ? (
          <button
            className="inline-flex h-8 min-w-0 items-center justify-center rounded-[5px] px-3 text-[13px] font-semibold leading-5 text-[var(--status-error)] transition-colors hover:bg-[var(--status-error-muted)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={controller.isBusy}
            onClick={() => void controller.decide('rejected')}
            type="button"
          >
            Reject
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ReviewTab({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        'relative inline-flex items-center gap-2 px-1 text-xs font-medium transition-colors hover:text-[var(--text-primary)] focus:outline-none focus-visible:text-[var(--accent-commit)]',
        active ? 'text-[var(--accent-commit)]' : 'text-[var(--text-secondary)]'
      )}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
      {active ? (
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--accent-commit)]" />
      ) : null}
    </button>
  );
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
  const diffChanges = buildStructuredStateDiff({
    baseline: content.baseline,
    head: content.head,
    workspace: candidate,
  });

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

function buildWorkspaceReviewStructureRows(
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

function workspaceReviewRowToneClass(row: WorkspaceReviewStructureRow): string {
  if (!row.diff) return 'hover:bg-[var(--surface-hover)]';
  if (row.diff.kind === 'added') return 'bg-[var(--diff-added-bg)] hover:bg-[var(--diff-added-bg)]';
  if (row.diff.kind === 'removed') {
    return 'bg-[var(--diff-removed-bg)] hover:bg-[var(--diff-removed-bg)]';
  }
  if (!row.diff.exact || row.expandable) return 'hover:bg-[var(--surface-hover)]';
  return 'bg-[var(--diff-modified-bg)] hover:bg-[var(--diff-modified-bg)]';
}

function workspaceReviewValueTypographyClass(value: string): string {
  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue === 'empty') return 'font-sans text-xs italic tracking-normal';
  if (!/\s/.test(value.trim())) return 'font-mono text-[13px] tracking-normal';
  if (/^-?\d+(?:\.\d+)?\s+items?$/i.test(value.trim())) {
    return 'font-mono text-[13px] tracking-normal tabular-nums';
  }
  return 'font-sans text-[13px] tracking-normal';
}

function workspaceReviewValueToneClass(kind: StructuredDiffKind | undefined): string {
  if (kind === 'added') return 'text-[var(--diff-added-text)]';
  if (kind === 'removed') return 'text-[var(--diff-removed-text)]';
  if (kind === 'modified') return 'text-[var(--diff-modified-text)]';
  return 'text-[var(--text-primary)]';
}

function workspaceReviewDiffGutterClass(kind: StructuredDiffKind): string {
  if (kind === 'added') return 'bg-[var(--diff-added-accent)]';
  if (kind === 'removed') return 'bg-[var(--diff-removed-accent)]';
  return 'bg-[var(--diff-modified-accent)]';
}

function workspaceReviewDiffBadgeClass(kind: StructuredDiffKind): string {
  if (kind === 'added') {
    return 'bg-[var(--diff-added-word-bg)] text-[var(--diff-added-text)]';
  }
  if (kind === 'removed') {
    return 'bg-[var(--diff-removed-word-bg)] text-[var(--diff-removed-text)]';
  }
  return 'bg-[var(--diff-modified-word-bg)] text-[var(--diff-modified-text)]';
}

function workspaceReviewDiffTextClass(kind: StructuredDiffKind): string {
  if (kind === 'added') return 'text-[var(--diff-added-text)]';
  if (kind === 'removed') return 'text-[var(--diff-removed-text)]';
  return 'text-[var(--diff-modified-text)]';
}

function workspaceReviewDiffSymbol(kind: StructuredDiffKind): string {
  if (kind === 'added') return '+';
  if (kind === 'removed') return '\u2212';
  return '~';
}

function workspaceReviewDiffOperationLabel(
  diff: WorkspaceReviewDiffMeta,
  sourceOp: string
): string {
  const operation = sourceOp === '-' ? diff.op : sourceOp;
  if (operation) return operation;
  if (diff.kind === 'added') return 'ADD';
  if (diff.kind === 'removed') return 'REMOVE';
  return 'SET';
}

function compactWorkspaceReviewReason(reason: string): string {
  const compact = reason.trim().replace(/^This commit\s+/i, '');
  if (!compact) return reason;
  return compact.charAt(0).toUpperCase() + compact.slice(1);
}

function workspaceReviewMachineKey(value: string): boolean {
  return value.includes('_') || value.includes('/') || /\d/.test(value);
}

function workspaceReviewDiffTone(
  kind: StructuredDiffKind | undefined
): WorkspaceReviewInspectorTone {
  if (kind === 'added') return 'added';
  if (kind === 'removed') return 'removed';
  if (kind === 'modified') return 'modified';
  return 'neutral';
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

function workspaceReviewOperationPreview(row: WorkspaceReviewStructureRow): string {
  if (row.diff) return `${workspaceReviewDiffOperationLabel(row.diff, row.sourceOp)}: ${row.path}`;
  if (row.sourceOp && row.sourceOp !== '-') return `${row.sourceOp}: ${row.path}`;
  return `state: ${row.path}`;
}

function workspaceReviewSourcePreview(
  candidate: WorkspaceCandidate,
  row: WorkspaceReviewStructureRow
): string {
  const operation = findWorkspaceReviewOperation(candidate.yopsDraft.operations, row.path);
  if (operation) {
    const value =
      operation.afterValue !== undefined
        ? formatOperationValue(operation.afterValue)
        : operation.summary;
    if (isRemovalOperation(operation.op)) return `remove ${workspaceReviewPathLabel(row)}`;
    return `${operation.op} ${operation.path} = ${value}`;
  }
  if (!row.diff?.exact) return workspaceReviewOperationPreview(row);
  if (row.diff.kind === 'removed') return `remove ${row.key}`;
  if (row.diff.kind === 'added') return `${row.key} = ${row.diff.afterValue}`;
  return `${row.key} = ${row.diff.afterValue || workspaceReviewCurrentValue(row)}`;
}

function workspaceReviewPathLabel(row: WorkspaceReviewStructureRow): string {
  return row.path.split('/').filter(Boolean).join(' / ') || row.key;
}

function workspaceReviewTextToneClass(tone: WorkspaceReviewInspectorTone): string {
  if (tone === 'added') return 'text-[var(--diff-added-text)]';
  if (tone === 'removed') return 'text-[var(--diff-removed-text)]';
  if (tone === 'modified') return 'text-[var(--diff-modified-text)]';
  if (tone === 'source') return 'text-[var(--source)]';
  if (tone === 'branch') return 'text-[var(--accent-branch)]';
  if (tone === 'success') return 'text-[var(--status-success)]';
  if (tone === 'warning') return 'text-[var(--status-warning)]';
  return 'text-[var(--text-secondary)]';
}

function workspaceReviewResultTextToneClass(tone: WorkspaceReviewInspectorTone): string {
  if (tone === 'removed') return 'text-[var(--text-tertiary)]';
  if (tone === 'neutral') return 'text-[var(--text-primary)]';
  return 'text-[var(--diff-added-text)]';
}

function workspaceReviewBaseRevisionLabel(candidate: WorkspaceCandidate): string {
  return candidate.baseCommitHash ? shortHash(candidate.baseCommitHash) : 'root';
}

function workspaceReviewReplayLabel(candidate: WorkspaceCandidate, reviewReady: boolean): string {
  const baseLabel = candidate.baseCommitHash
    ? `Base ${shortHash(candidate.baseCommitHash)}`
    : 'Genesis';
  const headLabel = candidate.lastCommitHash
    ? `HEAD ${shortHash(candidate.lastCommitHash)}`
    : reviewReady
      ? 'review snapshot'
      : 'draft preview';
  return `${baseLabel} -> ${headLabel}`;
}

function workspaceReviewCommitLabel(candidate: WorkspaceCandidate): string {
  return candidate.lastCommitHash ? shortHash(candidate.lastCommitHash) : 'Uncommitted review';
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

function workspaceReviewInspectorChecks(
  row: WorkspaceReviewStructureRow,
  checks: ReviewCheckView[],
  candidate: WorkspaceCandidate,
  reviewReady: boolean
): ReviewCheckView[] {
  const replay = checks.find((check) => check.label === 'Deterministic YOps replay');
  const schema = checks.find((check) => check.label === 'Schema validation');
  const rowSchemaGaps = candidate.schemaReview.gaps.filter((gap) =>
    workspaceReviewGapMatchesRow(gap, row)
  );
  const schemaStatus: ReviewCheckStatus =
    row.issueCount > 0 || rowSchemaGaps.length > 0
      ? 'failed'
      : schema?.status === 'passed'
        ? 'passed'
        : reviewReady
          ? (schema?.status ?? 'pending')
          : 'pending';

  return [
    {
      detail: replay?.detail ?? 'Replay runs when Review prepares the exact snapshot.',
      label: replayReadyLabel(replay?.status, reviewReady),
      requirement: 'required',
      status: replay?.status ?? (reviewReady ? 'pending' : 'pending'),
    },
    {
      detail:
        rowSchemaGaps[0] ??
        schema?.detail ??
        `${formatProposalSchemaLabel(candidate)} will be checked against this state path.`,
      label: schemaStatus === 'passed' ? 'Schema valid' : 'Schema needs review',
      requirement: 'required',
      status: schemaStatus,
    },
  ];
}

function replayReadyLabel(status: ReviewCheckStatus | undefined, reviewReady: boolean): string {
  if (status === 'passed') return 'Replay matched';
  if (status === 'failed') return 'Replay failed';
  return reviewReady ? 'Replay pending' : 'Replay not prepared';
}

function workspaceReviewGapMatchesRow(gap: string, row: WorkspaceReviewStructureRow): boolean {
  const normalizedGap = normalizeWorkspaceReviewStructurePath(gap);
  if (!normalizedGap) return false;
  const normalizedRow = normalizeWorkspaceReviewStructurePath(row.path);
  return (
    normalizedGap === normalizedRow ||
    normalizedGap.endsWith(`/${normalizedRow}`) ||
    normalizedRow.endsWith(`/${normalizedGap}`) ||
    gap.toLowerCase().includes(row.key.toLowerCase())
  );
}

function workspaceReviewDomToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'row';
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

function getReviewStatus({
  acceptAllowed,
  committed,
  currentness,
  overrideAllowed,
  preparing,
  rejected,
  requiredChecksPassed,
  viewReady,
}: {
  acceptAllowed?: boolean;
  committed: boolean;
  currentness: string;
  overrideAllowed?: boolean;
  preparing: boolean;
  rejected: boolean;
  requiredChecksPassed: boolean;
  viewReady: boolean;
}): { detail: string; label: string; tone: 'neutral' | 'success' | 'warning' } {
  if (committed) {
    return {
      detail: 'The accepted result advanced State and produced an audit receipt.',
      label: 'Committed',
      tone: 'success',
    };
  }
  if (rejected) {
    return {
      detail: 'The decision was recorded without advancing the branch.',
      label: 'Rejected',
      tone: 'neutral',
    };
  }
  if (preparing) {
    return {
      detail: 'Applying YOps, running Validation, and creating the snapshot.',
      label: 'Preparing review',
      tone: 'neutral',
    };
  }
  if (!viewReady) {
    return {
      detail: 'Prepare the exact result and Validation before deciding.',
      label: 'Review not prepared',
      tone: 'neutral',
    };
  }
  if (currentness !== 'ready') {
    return {
      detail: 'The snapshot no longer matches the current draft or branch.',
      label: 'Review needs refresh',
      tone: 'warning',
    };
  }
  if (acceptAllowed && requiredChecksPassed) {
    return {
      detail: 'Validation passed; the final decision is still yours.',
      label: 'Ready for your decision',
      tone: 'success',
    };
  }
  if (overrideAllowed) {
    return {
      detail: 'A required check needs attention; revise, reject, or record an allowed override.',
      label: 'Validation needs attention',
      tone: 'warning',
    };
  }
  return {
    detail: 'Review the failed or pending Validation results before choosing what happens next.',
    label: 'Decision unavailable',
    tone: 'warning',
  };
}

function committedReviewId(
  view: WorkspaceComposeReviewController['review']['view']
): string | null {
  if (!view || view.history.observation !== 'committed') return null;
  return view.history.commit.id;
}
