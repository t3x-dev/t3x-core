'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { ErrorMessage, LoadingSpinner } from '@/components/ApiStatus';
import { LeafComposerDock } from '@/components/leaf/LeafComposerDock';
import { LeafExtractToDraft } from '@/components/leaf/LeafExtractToDraft';
import { LeafInspector } from '@/components/leaf/LeafInspector';
import { LeafOutputDisplay } from '@/components/leaf/LeafOutputDisplay';
import { LeafWorkspaceFooter } from '@/components/leaf/LeafWorkspaceFooter';
import { LeafWorkspaceHeader } from '@/components/leaf/LeafWorkspaceHeader';
import { LearnFromEditSuggestion } from '@/components/leaf/LearnFromEditSuggestion';
import { LearnFromEditsPanel } from '@/components/leaf/LearnFromEditsPanel';
import { SentenceSourcePanel } from '@/components/leaf/SentenceSourcePanel';
import { SuggestConstraintsDialog } from '@/components/leaf/SuggestConstraintsDialog';
import { KeyboardHintBar } from '@/components/shared/KeyboardHintBar';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import { useLeafPageData } from '@/hooks/useLeafPageData';
import type { Constraint, SuggestedConstraint } from '@/lib/api';
import { getLeaf } from '@/lib/api';
import { PAGE_ANIMATION_STYLES } from '@/lib/pageAnimations';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';

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
    sentences,
    saving,
    savingInstruction,
    savingModel,
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
    sentenceCoverage,
    sentenceConfidence,
    handleUpdateConstraints,
    handleRemoveConstraint,
    handleAddConstraint,
    handleAddConstraintFromSource,
    handleUpdateUserInstruction,
    handleUpdateModel,
    handleGenerate,
    handleValidate,
    handleExport,
    toggleAssertion,
    handleRetune,
    setError,
    setLoading,
    setLeaf,
  } = useLeafPageData(projectId, leafId);

  const [suggestOpen, setSuggestOpen] = useState(false);
  const [sourcePanelCollapsed, setSourcePanelCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [hoveredSentenceId, setHoveredSentenceId] = useState<string | null>(null);

  // Re-tune with navigation
  const onRetune = useCallback(async () => {
    const conversationId = await handleRetune();
    if (conversationId) {
      router.push(`/project/${projectId}/conversation/${conversationId}`);
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

  const reflectedCount = Array.from(sentenceCoverage.values()).filter((c) => c.reflected).length;

  // Keyboard navigation for sentences
  const sentenceIds = useMemo(() => sentences.map((s) => s.id), [sentences]);
  const { activeId: activeSentenceId } = useKeyboardNavigation({
    ids: sentenceIds,
    onSelect: (id) => {
      if (id) {
        const el = document.querySelector(`[data-sentence-id="${id}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    },
    onAction: (id) => {
      const sentence = sentences.find((s) => s.id === id);
      if (sentence && !saving) {
        handleAddConstraintFromSource('require', sentence.text, sentence.id);
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
            setError(null);
            setLoading(true);
            getLeaf(leafId)
              .then(setLeaf)
              .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
              .finally(() => setLoading(false));
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
        onModeChange={setMode}
      />

      {/* ── Toolbar ── */}
      <div className="flex h-[44px] shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] px-4 bg-[color-mix(in_srgb,var(--surface-panel)_90%,transparent)]">
        {/* Left: toggle badges */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all',
              !sourcePanelCollapsed
                ? 'border-[var(--accent-leaf)] text-[var(--accent-leaf)]'
                : 'border-[var(--stroke-default)] text-[var(--text-secondary)] hover:border-[var(--stroke-strong)]'
            )}
            onClick={() => setSourcePanelCollapsed(!sourcePanelCollapsed)}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-conversation)]" />
            Sentences {sentences.length}
          </button>
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all',
              !inspectorCollapsed
                ? 'border-[var(--accent-leaf)] text-[var(--accent-leaf)]'
                : 'border-[var(--stroke-default)] text-[var(--text-secondary)] hover:border-[var(--stroke-strong)]'
            )}
            onClick={() => setInspectorCollapsed(!inspectorCollapsed)}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-leaf)]" />
            Constraints {leaf.constraints.length}
          </button>

          {/* Display mode: coverage summary */}
          {mode === 'display' && sentences.length > 0 && (
            <span className="text-xs font-medium text-[var(--status-success)] ml-2">
              {reflectedCount}/{sentences.length} sentences reflected
            </span>
          )}
        </div>

        {/* Right: keyboard hints + status */}
        <div className="flex items-center gap-3">
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

      {/* ── Body: Three-Zone Layout ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Source Panel */}
        <SentenceSourcePanel
          sentences={sentences}
          constraints={leaf.constraints}
          mode={mode}
          sentenceCoverage={sentenceCoverage}
          sentenceConfidence={sentenceConfidence}
          saving={saving}
          collapsed={sourcePanelCollapsed}
          onToggle={() => setSourcePanelCollapsed(!sourcePanelCollapsed)}
          onAddConstraintFromSource={handleAddConstraintFromSource}
          onHoverSentence={setHoveredSentenceId}
          hoveredSentenceId={hoveredSentenceId}
          activeSentenceId={activeSentenceId}
        />

        {/* Center: Main Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Output scroll area */}
          <div className="flex flex-1 flex-col overflow-y-auto p-6">
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
              sentenceCoverage={sentenceCoverage}
              sentences={sentences}
              hoveredSentenceId={hoveredSentenceId}
              onHoverSentence={setHoveredSentenceId}
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

            {/* Display mode: Lineage Summary */}
            {mode === 'display' && leaf.output && (
              <div className="mt-4 rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-card)] p-4">
                <div className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
                  Lineage Summary
                </div>
                <div className="flex flex-col gap-2 text-xs text-[var(--text-secondary)]">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-conversation)]" />
                    Source: {sentences.length} sentences from commit{' '}
                    {leaf.commit_hash.replace('sha256:', '').slice(0, 7)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-success)]" />
                    Coverage: {reflectedCount} reflected, {sentences.length - reflectedCount} not
                    used
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-leaf)]" />
                    Constraints:{' '}
                    {leaf.assertions
                      ? `${leaf.assertions.filter((a) => a.passed).length}/${leaf.assertions.length} passed`
                      : 'none'}
                  </div>
                  {leaf.generated_at && (
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)]" />
                      Generated: {new Date(leaf.generated_at).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
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

          {/* Learn constraints from user output edits (Item 17) */}
          <LearnFromEditsPanel
            leafId={leafId}
            hasOutput={!!leaf.output}
            onAddConstraint={(constraint) => {
              handleAddConstraint(constraint.type, constraint.value, constraint.match_mode);
            }}
          />
        </div>

        {/* Right: Inspector Rail */}
        <LeafInspector
          leaf={leaf}
          mode={mode}
          saving={saving}
          collapsed={inspectorCollapsed}
          onRemoveConstraint={handleRemoveConstraint}
          onAddConstraint={handleAddConstraint}
          onExport={handleExport}
          selectedAssertionIds={selectedAssertionIds}
          toggleAssertion={toggleAssertion}
          onRetune={onRetune}
          retuning={retuning}
        />
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
