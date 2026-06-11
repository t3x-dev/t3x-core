'use client';

/**
 * DraftWorkspace - Full-screen draft editing workspace
 *
 * Provides a workbench for composing structured state:
 * - ContentNode list with include/exclude toggles
 * - Constraint editor with local validation
 * - Instruction editor for generation guidance
 * - Auto-save with conflict detection
 * - Commit flow with two-phase dialog (input → success → iterate)
 * - Diff preview section (Changes from Parent)
 */

import { DEMO_WORKSPACE_FIXTURE, DEMO_WORKSPACE_REPLAY_GOAL } from '@t3x-dev/core';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  FileCode2,
  GitCommit,
  ListChecks,
  PanelBottom,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  FeatureTourOverlay,
  type FeatureTourStep,
} from '@/components/onboarding/FeatureTourOverlay';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { Button } from '@/components/ui/button';
import {
  countReadySemanticPoints,
  countReviewSemanticPoints,
  getSemanticPointsConversationId,
  isLLMExtractionDraft,
} from '@/domain/draft/llmMode';
import { useDraftAutoPreview } from '@/hooks/drafts/useDraftAutoPreview';
import { useDraftWorkspaceActions } from '@/hooks/drafts/useDraftWorkspaceActions';
import { useIntroDemoQueryFlag } from '@/hooks/onboarding/useIntroDemoQueryFlag';
import { useReducedMotion } from '@/hooks/shared/useReducedMotion';
import { useSaveStatusAutoIdle } from '@/hooks/shared/useSaveStatusAutoIdle';
import { useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';
import { fullScreenEnter, reducedMotion } from '@/utils/motion';
import { CommitDraftDialog } from './CommitDraftDialog';
import { ConflictBanner } from './ConflictBanner';
import { DraftActionBar } from './DraftActionBar';
import { DraftConstraintEditor } from './DraftConstraintEditor';
import { DraftDiffSection } from './DraftDiffSection';
import { DraftSplitPane } from './DraftSplitPane';
import { DraftWorkbenchLLM } from './DraftWorkbenchLLM';
import { ExtractConversationDialog } from './ExtractConversationDialog';
import { InstructionEditor } from './InstructionEditor';
import { NodeList } from './NodeList';
import { PreviewPanel } from './PreviewPanel';
import { PromotePreviewDialog } from './PromotePreviewDialog';

const DRAFT_TOUR_STEPS: FeatureTourStep[] = [
  {
    id: 'actions',
    label: 'Top Bar',
    title: 'Use top bar',
    description: 'Save, extract, or commit.',
    target: 'draft-actions',
    tone: 'pending',
    icon: Sparkles,
  },
  {
    id: 'fixture',
    label: 'No API',
    title: 'Fixture replay',
    description: 'No provider or API key is used.',
    target: 'draft-fixture-banner',
    tone: 'commit',
    icon: FileCode2,
  },
  {
    id: 'nodes',
    label: 'Nodes',
    title: 'Review state points',
    description: 'Choose what gets committed.',
    target: 'draft-nodes',
    tone: 'extract',
    icon: ListChecks,
  },
  {
    id: 'rules',
    label: 'Rules',
    title: 'Set output rules',
    description: 'Control required and excluded content.',
    target: 'draft-constraints',
    tone: 'leaf',
    icon: SlidersHorizontal,
  },
  {
    id: 'preview',
    label: 'Preview',
    title: 'Preview the artifact',
    description: 'Inspect output before commit.',
    target: 'draft-preview',
    tone: 'leaf',
    icon: PanelBottom,
  },
  {
    id: 'commit',
    label: 'Commit',
    title: 'Commit state',
    description: 'Save a stable version.',
    target: 'draft-commit-button',
    tone: 'commit',
    icon: GitCommit,
  },
];

interface DraftWorkspaceProps {
  projectId: string;
  onClose: () => void;
  onDemoDone?: () => void;
}

export function DraftWorkspace({ projectId, onClose, onDemoDone }: DraftWorkspaceProps) {
  const introDemoRequested = useIntroDemoQueryFlag();
  const {
    draft,
    isDirty,
    conflictError,
    getIncludedCount,
    draftId,
    reset,
    autoPreview,
    previewStatus,
    saveStatus,
    setSaveStatusIdle,
  } = useDraftWorkspaceStore();
  const {
    save: saveDraft,
    commit: commitDraft,
    load: loadDraft,
    generatePreview,
  } = useDraftWorkspaceActions();

  // Timer-driven state transitions (v2 §2.5 — store stays pure).
  useDraftAutoPreview(autoPreview, previewStatus, () => {
    void generatePreview();
  });
  useSaveStatusAutoIdle(saveStatus, setSaveStatusIdle);

  const prefersReducedMotion = useReducedMotion();
  const readyCountRef = useRef(0);
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [showExtractDialog, setShowExtractDialog] = useState(false);
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  // Auto-save when dirty (debounced 2s)
  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => {
      saveDraft();
    }, 2000);
    return () => clearTimeout(timer);
  }, [isDirty, saveDraft]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveDraft();
      }

      // Cmd/Ctrl + Enter to open commit dialog
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (getIncludedCount() > 0 || readyCountRef.current > 0) {
          setShowCommitDialog(true);
        }
      }

      // Cmd/Ctrl + G to generate preview
      if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
        e.preventDefault();
        if (getIncludedCount() > 0 || readyCountRef.current > 0) {
          generatePreview();
        }
      }

      // Escape to close (only if dialog is not open)
      if (e.key === 'Escape' && !showCommitDialog) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveDraft, getIncludedCount, onClose, showCommitDialog, generatePreview]);

  useEffect(() => {
    if (introDemoRequested) setTourOpen(true);
  }, [introDemoRequested]);

  const handleConfirmCommit = useCallback(
    async (message?: string) => {
      return await commitDraft(message);
    },
    [commitDraft]
  );

  const handleIterate = useCallback(
    (forkedDraftId: string) => {
      reset();
      loadDraft(forkedDraftId);
      setShowCommitDialog(false);
      // Update URL without full navigation
      window.history.replaceState(null, '', `/project/${projectId}/draft/${forkedDraftId}`);
    },
    [reset, loadDraft, projectId]
  );

  const handleViewCanvas = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleRefreshDraft = useCallback(() => {
    if (draftId) {
      loadDraft(draftId);
    }
  }, [draftId, loadDraft]);

  const isLLMMode = isLLMExtractionDraft(draft);
  const isFixtureReplay = draft?.goal === DEMO_WORKSPACE_REPLAY_GOAL;
  const readyCount = isLLMMode ? countReadySemanticPoints(draft.semantic_points) : 0;
  const reviewCount = isLLMMode ? countReviewSemanticPoints(draft.semantic_points) : 0;
  const effectiveIncludedCount = isLLMMode ? readyCount : getIncludedCount();
  readyCountRef.current = readyCount;

  if (!draft) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--surface-app)]">
        <p className="text-muted-foreground">No draft data available.</p>
      </div>
    );
  }

  const containerVariants = prefersReducedMotion ? reducedMotion.fullScreenEnter : fullScreenEnter;

  return (
    <motion.div
      variants={containerVariants}
      initial="initial"
      animate="animate"
      className="relative flex h-screen flex-col bg-[var(--surface-app)]"
    >
      {/* Commit Dialog */}
      <CommitDraftDialog
        open={showCommitDialog}
        onClose={() => setShowCommitDialog(false)}
        onConfirm={handleConfirmCommit}
        onIterate={handleIterate}
        onViewCanvas={handleViewCanvas}
        includedCount={effectiveIncludedCount}
        constraintCount={draft.constraints.length}
      />

      {/* Extract Conversation Dialog */}
      {draftId && (
        <ExtractConversationDialog
          open={showExtractDialog}
          onOpenChange={setShowExtractDialog}
          draftId={draftId}
          projectId={projectId}
          onExtracted={handleRefreshDraft}
        />
      )}

      {/* Promote Preview Dialog */}
      {draftId && (
        <PromotePreviewDialog
          open={showPromoteDialog}
          onOpenChange={setShowPromoteDialog}
          autoDraftId={draftId}
          onPromoted={() => loadDraft(draftId)}
        />
      )}

      {/* Action Bar */}
      <DraftActionBar
        onClose={onClose}
        onCommit={() => setShowCommitDialog(true)}
        onExtract={() => setShowExtractDialog(true)}
        canCommit={effectiveIncludedCount > 0 && draft.status === 'editing'}
        projectId={projectId}
      />

      {/* Conflict Banner */}
      {conflictError && <ConflictBanner onRefresh={handleRefreshDraft} />}

      {/* Fixture replay banner */}
      {isFixtureReplay && (
        <div
          className="flex items-center gap-2 border-b border-[var(--accent-commit)]/25 bg-[var(--accent-commit-soft)] px-6 py-2.5 text-sm text-[var(--accent-commit)]"
          data-intro-target="draft-fixture-banner"
        >
          <FileCode2 className="h-4 w-4 shrink-0" />
          <span className="font-medium">{DEMO_WORKSPACE_FIXTURE.replay.label}</span>
          <span className="text-[var(--accent-commit)]/55">&middot;</span>
          <span className="text-[var(--text-secondary)]">
            Recorded fixture preview and commit path; no provider call is made.
          </span>
        </div>
      )}

      {/* Auto-draft promotion banner */}
      {draft.status === 'auto' && (
        <div className="flex items-center gap-2 border-b border-[var(--status-warning)]/50 bg-[var(--status-warning-muted)] px-6 py-2.5 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--status-warning)]" />
          <span className="flex-1 text-[var(--status-warning)]">
            Auto-extracted draft — read-only until promoted.
          </span>
          <Button size="sm" variant="outline" onClick={() => setShowPromoteDialog(true)}>
            Start Editing
          </Button>
        </div>
      )}

      {/* Content + Preview split */}
      <DraftSplitPane
        top={
          <div className="mx-auto max-w-3xl px-6 py-6 space-y-6">
            {isLLMMode ? (
              <>
                <div className="flex items-center gap-2 rounded-lg bg-[var(--status-info-muted)] border border-[var(--status-info)]/30 px-4 py-2 text-xs text-[var(--status-info)]">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="font-medium">LLM Extraction</span>
                  <span className="text-[var(--status-info)]/50">&middot;</span>
                  <span>{readyCount} ready</span>
                  <span className="text-[var(--status-info)]/50">&middot;</span>
                  <span>{reviewCount} to review</span>
                </div>
                <DraftWorkbenchLLM
                  draftId={draftId!}
                  projectId={projectId}
                  conversationId={getSemanticPointsConversationId(draft.semantic_points)}
                  semanticPoints={draft.semantic_points ?? []}
                  onUpdate={() => loadDraft(draftId!)}
                  onCommit={() => setShowCommitDialog(true)}
                  onRefresh={handleRefreshDraft}
                />
              </>
            ) : (
              <div className="space-y-6" data-intro-target="draft-nodes">
                <NodeList />
              </div>
            )}
            <CollapsibleSection
              title="Output & Constraints"
              badge={draft.constraints.length > 0 ? draft.constraints.length : undefined}
              defaultOpen={draft.constraints.length > 0 || !!draft.preview_type}
            >
              <div className="space-y-6" data-intro-target="draft-constraints">
                <DraftConstraintEditor />
                <InstructionEditor />
              </div>
            </CollapsibleSection>
            <DraftDiffSection />
          </div>
        }
        bottom={<PreviewPanel />}
      />
      <FeatureTourOverlay
        open={tourOpen}
        title="Draft"
        steps={DRAFT_TOUR_STEPS}
        onClose={() => setTourOpen(false)}
        onDone={onDemoDone}
      />
    </motion.div>
  );
}
