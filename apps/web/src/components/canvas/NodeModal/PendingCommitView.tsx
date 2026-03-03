'use client';

/**
 * PendingCommitView — full-screen modal for staging and committing content.
 *
 * State management is delegated to `usePendingCommitState` hook.
 * Left sidebar config UI is delegated to `CommitConfigStep` component.
 * Success page is delegated to `PendingSuccessPage` component.
 */

import type { Node } from '@xyflow/react';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GitCompare,
  Loader2,
  MessageSquarePlus,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePendingCommitState } from '@/hooks/usePendingCommitState';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { CanvasNodeData } from '@/types/nodes';
import { PendingSourceEditor } from '../SelectableTextBlock';
import { CommitConfigStep } from './CommitConfigStep';
import { renderPhraseWithKeywords } from './helpers';
import type { NodeQuickAction } from './NodeModal';
import { PendingSuccessPage } from './PendingSuccessPage';

interface PendingCommitViewProps {
  node: Node<CanvasNodeData>;
  onClose: () => void;
  onUpdate: (patch: Partial<CanvasNodeData>) => void;
  projectId: string;
  routeProjectId: string | undefined;
  onConvertDraft: (() => void) | undefined;
  onBranchChange: ((branch: 'main' | 'branch') => void) | undefined;
  onBranchNameChange: ((name: string) => void) | undefined;
  quickActions: NodeQuickAction[] | undefined;
  onHideCommitConfig: () => void;
}

export function PendingCommitView({
  node,
  onClose,
  onUpdate,
  projectId,
  onConvertDraft,
  onBranchChange,
  onBranchNameChange,
  quickActions: _quickActions,
}: PendingCommitViewProps) {
  const data = node.data;

  const state = usePendingCommitState({
    node,
    onClose,
    onUpdate,
    projectId,
    onConvertDraft,
  });

  // ========== JSX ==========

  // B-7: Commit success page
  if (state.commitSuccess) {
    return (
      <PendingSuccessPage
        commitHash={state.commitSuccess.commitHash}
        parentHash={state.commitSuccess.parentHash}
        diffStats={state.commitSuccess.diffStats ?? undefined}
        projectId={projectId}
        onClose={state.handleSuccessClose}
        onViewDetails={state.handleViewCommitDetails}
        onCreateOutput={state.handleCreateOutput}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[8px]"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          'flex flex-col w-[95vw] max-w-[1400px] h-[85vh] rounded-2xl overflow-hidden',
          glass.cardBase,
          glass.highlight
        )}
      >
        {/* Top Bar */}
        <header className="flex items-center justify-between h-14 px-5 border-b border-[var(--stroke-divider)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="text-[0.85rem] font-bold text-[var(--accent-conversation)] bg-[var(--hover-bg)] px-2.5 py-1 rounded-md">
              t3x
            </div>
            <h2 className="text-[0.95rem] font-semibold text-[var(--text-primary)]">
              Commit: {data.title || 'Untitled'}
            </h2>
            <span className="text-xs text-[var(--text-tertiary)] font-mono">{data.entryId}</span>
            <Badge
              variant="outline"
              className="text-[0.65rem] text-[var(--color-text-muted)] uppercase tracking-wider border-dashed border-[var(--color-border)] bg-[var(--color-text-muted)]/15"
            >
              pending
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={state.handleOpenAsDraft}
              disabled={state.openingAsDraft}
              className="gap-1.5"
            >
              {state.openingAsDraft ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
              Open as Draft
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close"
              className="h-9 w-9 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              <X size={20} />
            </Button>
          </div>
        </header>

        <div className="flex flex-1 min-h-0 overflow-hidden" ref={state.draftBodyRef}>
          {/* ========== LEFT SIDEBAR: Config Zone (STEP 1 + STEP 2) ========== */}
          <aside
            className="min-w-[220px] max-w-[400px] p-5 bg-[var(--surface-app)] flex flex-col overflow-y-auto shrink-0"
            style={{ width: state.sidebarSourceDividerPos }}
          >
            <CommitConfigStep
              data={data}
              template={state.template}
              setTemplate={state.setTemplate}
              cosineThreshold={state.cosineThreshold}
              setCosineThreshold={state.setCosineThreshold}
              extractIntent={state.extractIntent}
              setExtractIntent={state.setExtractIntent}
              configLocked={state.configLocked}
              isCurateLoading={state.isCurateLoading}
              curateError={state.curateError}
              curatePreview={state.curatePreview}
              sourceBoxes={state.sourceBoxes}
              textBlocks={state.textBlocks}
              isCommitting={state.isCommitting}
              commitError={state.commitError}
              branches={state.branches}
              branchesLoading={state.branchesLoading}
              isMainBranchInvalid={state.isMainBranchInvalid}
              hoveredKeywordText={state.hoveredKeywordText}
              isMergeDraft={state.isMergeDraft}
              shouldShowBranchSelect={state.shouldShowBranchSelect}
              requireBranchName={state.requireBranchName}
              includedPhrasesCount={state.includedPhrasesCount}
              mustHaveKeywordsLegacy={state.mustHaveKeywordsLegacy}
              mustntHaveKeywordsLegacy={state.mustntHaveKeywordsLegacy}
              hasNewSourceData={state.hasNewSourceData}
              mustHaveKeywordsNew={state.mustHaveKeywordsNew}
              mustntHaveKeywordsNew={state.mustntHaveKeywordsNew}
              selectionsCount={state.selectionsCount}
              selectedChunksCount={state.selectedChunksCount}
              hasSourceConversation={state.hasSourceConversation}
              hasSourceTurnWindow={state.hasSourceTurnWindow}
              handleKeywordHover={state.handleKeywordHover}
              toggleSourceBoxExpand={state.toggleSourceBoxExpand}
              togglePhraseInclude={state.togglePhraseInclude}
              toggleKeywordMustnt={state.toggleKeywordMustnt}
              handleProceed={state.handleProceed}
              handleReset={state.handleReset}
              handleCommit={state.handleCommit}
              onBranchChange={onBranchChange}
              onBranchNameChange={onBranchNameChange}
            />
          </aside>

          {/* Sidebar | SOURCE Divider */}
          <div
            className="w-1.5 bg-[var(--stroke-divider)] cursor-col-resize shrink-0 hover:bg-[var(--hover-bg-strong)] active:bg-blue-500 dark:active:bg-blue-400 transition-colors relative group"
            onMouseDown={state.handleSidebarSourceDivider}
          >
            <div className="draft-svtz__divider-handle" />
          </div>

          {/* ========== MAIN CONTENT: SOURCE ========== */}
          <div
            className="flex-1 min-w-0 flex flex-col bg-[var(--surface-card)] overflow-hidden"
            ref={state.mainContentRef}
          >
            {/* SOURCE Column - Full Width */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-4 py-2 border-b border-[var(--stroke-divider)] bg-[var(--surface-app)] shrink-0">
                <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                  {state.isMergeDraft ? 'MERGE CONTENT' : 'SOURCE'}
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto p-[var(--space-group)]">
                {/* Merge draft - legacy three-way merge UI removed */}
                {state.isMergeDraft ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-[var(--text-tertiary)]">
                    <GitCompare
                      size={48}
                      strokeWidth={1}
                      className="text-[var(--color-border)] mb-[var(--space-group)]"
                    />
                    <h4 className="font-semibold text-[var(--text-secondary)] mb-[var(--space-item)]">
                      Merge via MergePanel
                    </h4>
                    <p className="text-sm text-[var(--text-tertiary)] mb-[var(--space-section)]">
                      Use the MergePanel component for two-way merge operations.
                    </p>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-[var(--status-info-muted)] text-[var(--status-info)]">
                          SOURCE
                        </Badge>
                        <span className="text-[var(--text-secondary)]">
                          {data?.mergeConfig?.sourceCommitTitle}
                        </span>
                      </div>
                      <span className="text-[var(--text-tertiary)]">&rarr;</span>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-[var(--accent-pending)]/10 text-[var(--accent-pending)]">
                          TARGET
                        </Badge>
                        <span className="text-[var(--text-secondary)]">
                          {data?.mergeConfig?.targetCommitTitle}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : state.hasNewSourceData ? (
                  /* New free-form text selection UI */
                  <PendingSourceEditor
                    blocks={state.textBlocks}
                    onChange={state.handleTextBlocksChange}
                    readOnly={!state.configLocked}
                    anchorCandidates={state.anchorCandidates}
                    confirmedAnchors={state.confirmedAnchors}
                    anchorThreshold={state.keywordsThreshold}
                    onAnchorChange={state.handleAnchorChange}
                  />
                ) : state.sourceBoxes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-[var(--text-tertiary)]">
                    <MessageSquarePlus
                      size={32}
                      strokeWidth={1}
                      className="mb-[var(--space-item)]"
                    />
                    <p className="font-medium text-[var(--text-tertiary)]">No source content</p>
                    <span className="text-sm">Connect upstream conversation or commit</span>
                  </div>
                ) : (
                  /* Legacy phrase-based UI */
                  state.sourceBoxes.map((box) => (
                    <div
                      key={box.id}
                      className="bg-[var(--surface-card)] border border-[var(--stroke-divider)] rounded-lg mb-3 overflow-hidden"
                    >
                      {/* Source Box Header */}
                      <div
                        className="flex items-center gap-2 px-3 py-2.5 bg-[var(--surface-app)] cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
                        onClick={() => state.toggleSourceBoxExpand(box.id)}
                      >
                        <span className="text-[var(--text-tertiary)]">
                          {box.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </span>
                        <span className="flex-1 text-[0.85rem] font-medium text-[var(--text-secondary)]">
                          {box.title}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[0.65rem] text-[var(--status-info)] border-[var(--status-info)]/20 bg-[var(--status-info-muted)]"
                        >
                          {box.type}
                        </Badge>
                      </div>
                      {/* Source Box Body with Phrases and Keyword Highlighting */}
                      {box.expanded && (
                        <div className="p-3 text-[0.9rem] leading-[1.8] text-[var(--text-secondary)]">
                          {box.phrases.map((phrase) => {
                            const canToggle = state.configLocked;
                            return (
                              <div
                                key={phrase.id}
                                className={cn(
                                  'inline-block py-1.5 px-2.5 m-1 rounded-md transition-colors cursor-pointer leading-[1.6] max-w-full',
                                  phrase.included
                                    ? 'bg-[var(--status-success-muted)] border border-[var(--status-success)]/20 hover:bg-green-200 dark:hover:bg-green-700'
                                    : 'bg-[var(--status-error-muted)] border border-[var(--status-error)]/20 hover:bg-red-200 dark:hover:bg-red-700',
                                  !canToggle && 'opacity-70 cursor-default'
                                )}
                                onClick={(e) => {
                                  if (canToggle && e.target === e.currentTarget) {
                                    state.togglePhraseInclude(phrase.id);
                                  }
                                }}
                                title={
                                  !canToggle
                                    ? 'Complete Step 1 to edit'
                                    : phrase.included
                                      ? 'Click to exclude phrase'
                                      : 'Click to include phrase'
                                }
                              >
                                {/* Render phrase text with clickable keywords */}
                                {renderPhraseWithKeywords(
                                  phrase,
                                  canToggle,
                                  () => state.togglePhraseInclude(phrase.id),
                                  (kwId) => state.toggleKeywordMustnt(phrase.id, kwId),
                                  state.hoveredKeywordText,
                                  state.handleKeywordHover
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Legend */}
        <footer className="flex items-center justify-center gap-6 px-6 py-3 bg-[var(--surface-app)] border-t border-[var(--stroke-divider)] text-xs text-[var(--text-tertiary)] shrink-0">
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-[var(--status-success-muted)] border border-[var(--status-success)]/20" />
            green bg = included phrase
          </span>
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-[var(--status-error-muted)] border border-[var(--status-error)]/20" />
            red bg = excluded phrase
          </span>
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-green-600 dark:bg-green-500" />
            green text = must-have keyword
          </span>
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-red-600 dark:bg-red-500" />
            red text = mustnt-have keyword
          </span>
        </footer>
      </div>
    </div>
  );
}
