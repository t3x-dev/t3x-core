'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorMessage, LoadingSpinner } from '@/components/layout/ApiStatus';
import { LeafComposerDock } from '@/components/leaf/LeafComposerDock';
import { LeafExtractToDraft } from '@/components/leaf/LeafExtractToDraft';
import { LeafInspector } from '@/components/leaf/LeafInspector';
import { LeafOutputDisplay } from '@/components/leaf/LeafOutputDisplay';
import { LeafWorkspaceFooter } from '@/components/leaf/LeafWorkspaceFooter';
import { LeafWorkspaceHeader } from '@/components/leaf/LeafWorkspaceHeader';
import { LearnFromEditSuggestion } from '@/components/leaf/LearnFromEditSuggestion';
import { LearnFromEditsPanel } from '@/components/leaf/LearnFromEditsPanel';
import { QualityPanel } from '@/components/leaf/QualityPanel';
import { SuggestConstraintsDialog } from '@/components/leaf/SuggestConstraintsDialog';
import { YAMLTreePanel } from '@/components/leaf/YAMLTreePanel';
import { KeyboardHintBar } from '@/components/shared/KeyboardHintBar';
import {
  buildLeafSemanticPointSummary,
  buildLeafSemanticPointSummaryByNode,
  deriveLeafSemanticPointItems,
} from '@/domain/leaf/semanticPoints';
import { useLeafPageData } from '@/hooks/leaves/useLeafPageData';
import { useKeyboardNavigation } from '@/hooks/shared/useKeyboardNavigation';
import type { Constraint, SuggestedConstraint } from '@/infrastructure';
import { useProjectStore } from '@/store/projectStore';
import { cn } from '@/utils/cn';
import { PAGE_ANIMATION_STYLES } from '@/utils/pageAnimations';

function getGenerateErrorMessage(error: string): {
  title: string;
  description: string;
  showRetry: boolean;
} {
  if (error.includes('GENERATION_NOT_CONFIGURED') || error.includes('API_KEY')) {
    return {
      title: 'LLM API Key Not Configured',
      description: 'Set ANTHROPIC_API_KEY in your environment to enable AI generation.',
      showRetry: false,
    };
  }
  if (error.includes('GENERATION_FAILED') || error.includes('timeout')) {
    return {
      title: 'Generation Failed',
      description: 'The AI service encountered an error. Please try again.',
      showRetry: true,
    };
  }
  return { title: 'Error', description: error, showRetry: true };
}

export default function LeafDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const leafId = params.leafId as string;
  const projectName = useProjectStore((s) => s.getProject(projectId))?.name;

  const {
    leaf,
    loading,
    error,
    nodes,
    semanticContent,
    saving,
    savingInstruction,
    savingModel,
    savingSemanticPoints,
    modelError,
    isGenerating,
    generatePhase,
    generateProgressMessages,
    generateError,
    generateSuccessBanner,
    isValidating,
    validateError,
    semanticWarning,
    exportMessage,
    selectedAssertionIds,
    retuning,
    mode,
    setMode,
    nodeCoverage,
    handleUpdateConstraints,
    handleRemoveConstraint,
    handleAddConstraint,
    handleAddConstraintFromSource,
    handleUpdateUserInstruction,
    handleUpdateModel,
    handleSetSemanticPointIncluded,
    handleGenerate,
    handleValidate,
    handleExport,
    toggleAssertion,
    handleRetune,
    setError: _setError,
    setLoading: _setLoading,
    setLeaf: _setLeaf,
  } = useLeafPageData(projectId, leafId);

  const [suggestOpen, setSuggestOpen] = useState(false);
  const [modeTouched, setModeTouched] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const handleModeChange = useCallback(
    (nextMode: typeof mode) => {
      setModeTouched(true);
      setMode(nextMode);
    },
    [setMode]
  );

  // Re-tune with navigation
  const onRetune = useCallback(async () => {
    const conversationId = await handleRetune();
    if (conversationId) {
      router.push(`/chat/${conversationId}`);
    }
  }, [handleRetune, router, projectId]);

  // Accept AI-suggested constraints (batch add — single API call)
  const handleAcceptSuggestions = useCallback(
    (suggestions: SuggestedConstraint[]) => {
      if (!leaf || saving || suggestions.length === 0) return;
      const newConstraints: Constraint[] = suggestions.map((s) => ({
        id: `cst_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)}`,
        type: s.type,
        value: s.value.trim(),
        match_mode: s.match_mode,
      }));
      const updatedConstraints = [...leaf.constraints, ...newConstraints];
      const optimisticLeaf = { ...leaf, constraints: updatedConstraints };
      handleUpdateConstraints(updatedConstraints, optimisticLeaf);
    },
    [leaf, saving, handleUpdateConstraints]
  );

  const reflectedCount = Array.from(nodeCoverage.values()).filter((c) => c.reflected).length;
  const semanticPointItems = useMemo(
    () =>
      leaf && semanticContent ? deriveLeafSemanticPointItems(semanticContent, leaf.config) : [],
    [leaf, semanticContent]
  );
  const semanticPointSummaryByNode = useMemo(
    () => buildLeafSemanticPointSummaryByNode(semanticPointItems),
    [semanticPointItems]
  );
  const semanticPointSummary = useMemo(
    () => buildLeafSemanticPointSummary(semanticPointItems),
    [semanticPointItems]
  );
  const coverageIncluded =
    semanticPointSummary.total > 0 ? semanticPointSummary.included : reflectedCount;
  const coverageTotal = semanticPointSummary.total > 0 ? semanticPointSummary.total : nodes.length;
  const assertionCount = leaf?.assertions?.length ?? 0;
  const assertionPassedCount = leaf?.assertions?.filter((assertion) => assertion.passed).length ?? 0;
  const assertionStatus =
    assertionCount === 0
      ? 'assertions not run'
      : `${assertionPassedCount} / ${assertionCount} assertions`;

  useEffect(() => {
    if (!modeTouched && leaf?.output && mode !== 'display') {
      setMode('display');
    }
  }, [leaf?.output, mode, modeTouched, setMode]);

  // Keyboard navigation for nodes
  const nodeIds = useMemo(() => nodes.map((s) => s.id), [nodes]);
  useKeyboardNavigation({
    ids: nodeIds,
    onSelect: (id) => {
      if (id) {
        const el = document.querySelector(`[data-node-id="${id}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    },
    onAction: (id) => {
      const node = nodes.find((s) => s.id === id);
      if (node && !saving) {
        handleAddConstraintFromSource('require', node.text, node.id);
      }
    },
    enabled: !loading && !!leaf && !suggestOpen,
  });

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <LoadingSpinner message="Loading leaf data..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <ErrorMessage
          error={error}
          onRetry={() => {
            window.location.reload();
          }}
        />
      </div>
    );
  }

  if (!leaf) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Leaf not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Shared animation styles */}
      <style>{PAGE_ANIMATION_STYLES}</style>

      {/* ── Header ── */}
      <LeafWorkspaceHeader
        leaf={leaf}
        projectId={projectId}
        projectName={projectName}
        onExport={handleExport}
        mode={mode}
        onModeChange={handleModeChange}
      />

      {/* ── Toolbar ── */}
      <div className="flex h-[40px] shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] bg-[color-mix(in_srgb,var(--surface-panel)_90%,transparent)] px-4">
        <div className="hidden items-center gap-2 md:flex">
          <span className="inline-flex items-center rounded-full border border-[var(--accent-leaf)]/30 bg-[var(--accent-leaf-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-leaf)]">
            {leaf.type} artifact
          </span>
          <span className="inline-flex items-center rounded-full border border-[var(--accent-leaf)]/30 bg-[var(--accent-leaf-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-leaf)]">
            {coverageIncluded} / {coverageTotal} semantic points
          </span>
          <span className="inline-flex items-center rounded-full border border-[var(--accent-commit)]/30 bg-[var(--accent-commit-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-commit)]">
            {semanticContent ? 'commit verified' : 'commit loading'}
          </span>
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium',
              assertionCount > 0 && assertionPassedCount === assertionCount
                ? 'border-[var(--status-success)]/30 bg-[var(--status-success-muted)] text-[var(--status-success)]'
                : 'border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] text-[var(--status-warning)]'
            )}
          >
            {assertionStatus}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 md:hidden">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="inline-flex items-center rounded-full border border-[var(--accent-leaf)]/30 bg-[var(--accent-leaf-soft)] px-2 py-1 text-[10px] font-medium text-[var(--accent-leaf)]">
              {coverageIncluded}/{coverageTotal} points
            </span>
            <span className="inline-flex items-center rounded-full border border-[var(--accent-commit)]/30 bg-[var(--accent-commit-soft)] px-2 py-1 text-[10px] font-medium text-[var(--accent-commit)]">
              verified
            </span>
          </div>
          <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-[var(--stroke-default)]">
            <button
              type="button"
              className={cn(
                'px-2 py-1 text-[10px] font-medium transition-all',
                mode === 'generate'
                  ? 'bg-[var(--accent-leaf)]/10 text-[var(--accent-leaf)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]'
              )}
              onClick={() => handleModeChange('generate')}
            >
              Generate
            </button>
            <button
              type="button"
              className={cn(
                'px-2 py-1 text-[10px] font-medium transition-all',
                mode === 'display'
                  ? 'bg-[var(--accent-leaf)]/10 text-[var(--accent-leaf)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]'
              )}
              onClick={() => handleModeChange('display')}
            >
              Display
            </button>
          </div>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <span className="text-[11px] text-[var(--text-tertiary)]">
            Quality first, then source review, then publish
          </span>
          {saving && <span className="text-[10px] text-[var(--text-tertiary)]">Saving...</span>}
          <KeyboardHintBar
            hints={[
              { key: 'j k', label: 'navigate' },
              { key: 'o', label: 'require' },
              { key: 'esc', label: 'deselect' },
            ]}
          />
        </div>
      </div>

      {/* ── Error / Warning Banners ── */}
      {generateError &&
        (() => {
          const info = getGenerateErrorMessage(generateError);
          return (
            <div className="mx-4 mt-2 rounded-md border bg-card px-4 py-3">
              <p className="text-sm font-medium text-destructive">{info.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{info.description}</p>
              {info.showRetry && (
                <button
                  type="button"
                  className="mt-2 rounded-md border px-3 py-1 text-sm"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                >
                  Retry
                </button>
              )}
            </div>
          );
        })()}

      {validateError && (
        <div className="mx-4 mt-2 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {validateError}
        </div>
      )}

      {semanticWarning && (
        <div className="mx-4 mt-2 rounded-md bg-[var(--status-warning-muted)] px-4 py-2 text-sm text-[var(--status-warning)]">
          Note: Semantic validation is not yet supported. Only exact match was used for validation.
        </div>
      )}

      {exportMessage && (
        <div
          className={cn(
            'mx-4 mt-2 rounded-md px-4 py-2 text-sm',
            exportMessage.type === 'success'
              ? 'bg-[var(--status-success-muted)] text-[var(--status-success)]'
              : 'bg-destructive/10 text-destructive'
          )}
        >
          {exportMessage.text}
        </div>
      )}

      {/* ── Body: Dual-Mode Layout ── */}
      <div className="flex flex-1 overflow-hidden bg-[var(--surface-app)]">
        <YAMLTreePanel
          content={semanticContent ?? { trees: [], relations: [] }}
          mode={mode}
          constraints={leaf.constraints}
          assertions={leaf.assertions ?? undefined}
          saving={saving}
          commitHash={leaf.commit_hash}
          projectId={projectId}
          onAddConstraintFromSource={handleAddConstraintFromSource}
          semanticPointSummaryByNode={semanticPointSummaryByNode}
          highlightedConstraintId={hoveredNodeId}
          onHoverNode={setHoveredNodeId}
        />

        {/* Center: Main Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Output scroll area */}
          <div className="flex flex-1 flex-col overflow-y-auto bg-[color-mix(in_srgb,var(--surface-app)_94%,var(--surface-panel))] p-6">
            <LeafOutputDisplay
              output={leaf.output}
              generatedAt={leaf.generated_at}
              assertions={leaf.assertions}
              constraints={leaf.constraints}
              onGenerate={handleGenerate}
              isGenerating={isGenerating}
              generatePhase={generatePhase}
              generateProgressMessages={generateProgressMessages}
              generateSuccessBanner={generateSuccessBanner}
              mode={mode}
              nodeCoverage={nodeCoverage}
              nodes={nodes}
              hoveredNodeId={hoveredNodeId}
              onHoverNode={setHoveredNodeId}
            />

            {/* Reverse-learn: suggest constraints from failed assertions */}
            {leaf.assertions?.some((a) => !a.passed) && (
              <LearnFromEditSuggestion
                leafId={leafId}
                onAddConstraint={(constraint) => {
                  handleAddConstraint(constraint.type, constraint.value, constraint.match_mode);
                }}
              />
            )}

            {/* Extract leaf output to draft */}
            {leaf.output && (
              <LeafExtractToDraft leafId={leafId} projectId={projectId} outputText={leaf.output} />
            )}
          </div>

          {/* Composer Dock (Generate mode only) */}
          {mode === 'generate' && (
            <LeafComposerDock
              leafId={leafId}
              instruction={
                typeof leaf.config?.user_instruction === 'string'
                  ? leaf.config.user_instruction
                  : ''
              }
              currentModel={typeof leaf.config?.model === 'string' ? leaf.config.model : undefined}
              hasOutput={!!leaf.output}
              saving={saving}
              savingInstruction={savingInstruction}
              savingModel={savingModel}
              modelError={modelError}
              isGenerating={isGenerating}
              isValidating={isValidating}
              generatePhase={generatePhase}
              generateProgressMessages={generateProgressMessages}
              onUpdateInstruction={handleUpdateUserInstruction}
              onUpdateModel={handleUpdateModel}
              onGenerate={handleGenerate}
              onValidate={handleValidate}
              onSuggestOpen={() => setSuggestOpen(true)}
            />
          )}

          {/* Learn constraints from user output edits */}
          <LearnFromEditsPanel
            leafId={leafId}
            hasOutput={!!leaf.output}
            onAddConstraint={(constraint) => {
              handleAddConstraint(constraint.type, constraint.value, constraint.match_mode);
            }}
          />
        </div>

        {/* Right: Mode-dependent panel */}
        {mode === 'generate' ? (
          <LeafInspector
            leaf={leaf}
            semanticContent={semanticContent}
            mode={mode}
            saving={saving}
            savingSemanticPoints={savingSemanticPoints}
            collapsed={false}
            onRemoveConstraint={handleRemoveConstraint}
            onAddConstraint={handleAddConstraint}
            onExport={handleExport}
            selectedAssertionIds={selectedAssertionIds}
            toggleAssertion={toggleAssertion}
            onRetune={onRetune}
            retuning={retuning}
            onToggleSemanticPoint={handleSetSemanticPointIncluded}
          />
        ) : (
          <QualityPanel
            assertions={leaf.assertions ?? []}
            constraints={leaf.constraints}
            generatedAt={leaf.generated_at ?? undefined}
            semanticPoints={semanticPointItems}
            coverageIncluded={coverageIncluded}
            coverageTotal={coverageTotal}
            onHighlightConstraint={setHoveredNodeId}
            onExport={handleExport}
          />
        )}
      </div>

      {/* ── Footer ── */}
      <LeafWorkspaceFooter leaf={leaf} projectId={projectId} />

      {/* ── Dialogs ── */}
      <SuggestConstraintsDialog
        open={suggestOpen}
        onOpenChange={setSuggestOpen}
        leafId={leafId}
        onAccept={handleAcceptSuggestions}
      />
    </div>
  );
}
