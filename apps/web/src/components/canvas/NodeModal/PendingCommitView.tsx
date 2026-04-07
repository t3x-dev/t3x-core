'use client';

/**
 * PendingCommitView — full-screen modal for staging and committing content.
 *
 * State management is delegated to `usePendingCommitState` hook.
 * Left sidebar config UI is delegated to `CommitConfigStep` component.
 * Right panel renders DraftWorkbenchLLM for semantic point review.
 * Success page is delegated to `PendingSuccessPage` component.
 */

import type { Node } from '@xyflow/react';
import { AlertCircle, ExternalLink, GitCompare, Loader2, X } from 'lucide-react';
import { DraftWorkbenchLLM } from '@/components/draft/DraftWorkbenchLLM';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePendingCommitState } from '@/hooks/usePendingCommitState';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { CanvasNodeData } from '@/types/nodes';
import { CommitConfigStep } from './CommitConfigStep';
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
}

export function PendingCommitView({
  node,
  onClose,
  onUpdate,
  projectId,
  onConvertDraft,
  onBranchChange,
  onBranchNameChange,
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
      aria-labelledby="node-modal-title"
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
            <h2
              id="node-modal-title"
              className="text-[0.95rem] font-semibold text-[var(--text-primary)]"
            >
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
            {(node.data as CanvasNodeData).conversationId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const d = node.data as CanvasNodeData;
                  if (d.projectId && d.conversationId) {
                    window.location.href = `/chat/${d.conversationId}`;
                  }
                }}
                className="gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Continue Chat
              </Button>
            )}
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
              configLocked={state.configLocked}
              extractionLoading={state.extractionLoading}
              extractionError={state.extractionError}
              semanticPointsCount={state.semanticPoints.length}
              commitError={state.commitError}
              branches={state.branches}
              branchesLoading={state.branchesLoading}
              isMainBranchInvalid={state.isMainBranchInvalid}
              isMergeDraft={state.isMergeDraft}
              shouldShowBranchSelect={state.shouldShowBranchSelect}
              requireBranchName={state.requireBranchName}
              hasSourceConversation={state.hasSourceConversation}
              handleProceed={state.handleProceed}
              handleReset={state.handleReset}
              onBranchChange={onBranchChange}
              onBranchNameChange={onBranchNameChange}
            />
          </aside>

          {/* Sidebar | SOURCE Divider */}
          <div
            className="w-1.5 bg-[var(--stroke-divider)] cursor-col-resize shrink-0 hover:bg-[var(--hover-bg-strong)] active:bg-[var(--status-info)] transition-colors relative group"
            onMouseDown={state.handleSidebarSourceDivider}
          >
            <div className="draft-svtz__divider-handle" />
          </div>

          {/* ========== MAIN CONTENT: LLM Extraction Review ========== */}
          <div
            className="flex-1 min-w-0 flex flex-col bg-[var(--surface-card)] overflow-hidden"
            ref={state.mainContentRef}
          >
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-4 py-2 border-b border-[var(--stroke-divider)] bg-[var(--surface-app)] shrink-0">
                <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                  {state.isMergeDraft ? 'MERGE CONTENT' : 'SEMANTIC POINTS'}
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto p-[var(--space-group)]">
                {/* Merge draft */}
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
                ) : !state.configLocked ? (
                  /* Before config locked: show placeholder */
                  <div className="flex flex-col items-center justify-center flex-1 min-h-[300px] gap-3 text-[var(--text-tertiary)]">
                    <span className="text-sm">Complete Step 1 to start extraction</span>
                  </div>
                ) : state.extractionLoading ? (
                  /* Extraction in progress */
                  <div className="flex flex-col items-center justify-center flex-1 min-h-[300px] gap-3 text-[var(--text-tertiary)]">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <span className="text-sm">Extracting semantic points...</span>
                  </div>
                ) : state.extractionError && !state.extractionLoading ? (
                  /* Extraction error */
                  <div className="flex flex-col items-center justify-center flex-1 min-h-[300px] gap-3 p-8 text-center">
                    <AlertCircle className="h-8 w-8 text-[var(--status-error)]" />
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-[var(--status-error)]">
                        LLM Extraction Failed
                      </span>
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {state.extractionError}
                      </span>
                    </div>
                  </div>
                ) : state.draftId && state.semanticPoints.length > 0 ? (
                  /* DraftWorkbenchLLM: Ready/Review zones + commit button */
                  <DraftWorkbenchLLM
                    draftId={state.draftId}
                    projectId={projectId}
                    conversationId={data.sourceConversationId || data.conversationId || ''}
                    semanticPoints={state.semanticPoints}
                    onUpdate={(points) => state.setSemanticPoints(points)}
                    onCommit={state.handleCommit}
                    onRefresh={state.handleReExtract}
                  />
                ) : state.draftId && state.semanticPoints.length === 0 ? (
                  /* No points extracted */
                  <div className="flex flex-col items-center justify-center flex-1 min-h-[300px] gap-3 p-8 text-center text-[var(--text-tertiary)]">
                    <span className="text-sm">No semantic points extracted.</span>
                    <span className="text-xs">Try adding more conversation content first.</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
