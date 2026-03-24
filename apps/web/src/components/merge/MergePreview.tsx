'use client';

/**
 * MergePreview - Shows the final merged result before commit
 *
 * Collapsible panel at the bottom showing what the merge
 * commit will contain. Supports both sentence-based (legacy)
 * and frame-based merge modes.
 */

import { ChevronDown, ChevronUp, FileText, Layers } from 'lucide-react';
import { useTerminology } from '@/hooks/useTerminology';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';

interface MergePreviewProps {
  expanded: boolean;
  onToggle: () => void;
}

export function MergePreview({ expanded, onToggle }: MergePreviewProps) {
  const { t } = useTerminology();
  const {
    getPreviewSentences,
    prepared,
    getResolutionStats,
    frameMergeResult,
    frameResolutions,
    keepSourceFrames,
    keepTargetFrames,
    getPreviewFrames,
  } = useMergeWorkspaceStore();

  const isFrameMode = frameMergeResult !== null;

  // Frame-mode preview
  if (isFrameMode) {
    const previewFrames = getPreviewFrames();
    const autoKeptCount = frameMergeResult.autoKept.length;
    const resolvedCount = frameMergeResult.conflicts.filter((c) =>
      frameResolutions.has(c.frameId)
    ).length;
    const keptSourceCount = frameMergeResult.onlyInSource.filter((f) =>
      keepSourceFrames.has(f.id)
    ).length;
    const keptTargetCount = frameMergeResult.onlyInTarget.filter((f) =>
      keepTargetFrames.has(f.id)
    ).length;

    return (
      <div className={cn(glass.panelBase, 'border-x-0 border-b-0 rounded-none')}>
        {/* Header - Always visible */}
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center justify-between px-6 py-3 hover:bg-[var(--hover-bg)] transition-colors"
        >
          <div className="flex items-center gap-3">
            <FileText className="h-4 w-4 text-[var(--text-tertiary)]" />
            <span className="font-medium text-[var(--text-primary)]">Merge Preview</span>
            <span className="text-sm text-[var(--text-tertiary)]">
              {previewFrames.length} frames will be in final {t('commit').toLowerCase()}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
              <span className="text-[var(--diff-added-line)]">{autoKeptCount} auto-kept</span>
              <span className="text-[var(--diff-modified-line)]">{resolvedCount} resolved</span>
              <span className="text-[var(--accent-commit)]">
                {keptSourceCount + keptTargetCount} unique kept
              </span>
            </div>
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" />
            ) : (
              <ChevronUp className="h-4 w-4 text-[var(--text-tertiary)]" />
            )}
          </div>
        </button>

        {/* Content - Collapsible */}
        {expanded && (
          <div className="px-6 pb-4 max-h-64 overflow-auto">
            <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--stroke-divider)] p-[var(--space-group)] elevation-2">
              {previewFrames.length === 0 ? (
                <p className="text-center text-[var(--text-tertiary)] py-4">
                  No frames selected for merge
                </p>
              ) : (
                <div className="space-y-[var(--space-item)]">
                  {previewFrames.map((frame, idx) => (
                    <div key={frame.id || idx} className="flex items-start gap-3 text-sm">
                      <span className="shrink-0 w-6 text-[var(--text-tertiary)] text-right font-mono text-xs">
                        {idx + 1}.
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="rounded bg-[var(--surface-app)] px-1 py-0.5 font-mono text-[10px] font-medium text-[var(--text-secondary)] border border-[var(--stroke-divider)]">
                            {frame.type}
                          </span>
                          <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                            {frame.id}
                          </span>
                        </div>
                        <div className="font-mono text-[11px] text-[var(--text-tertiary)]">
                          {Object.entries(frame.slots)
                            .slice(0, 3)
                            .map(([key, value]) => (
                              <span key={key} className="mr-2">
                                <span style={{ color: '#7aa2f7' }}>{key}</span>
                                <span style={{ color: '#89ddff' }}>: </span>
                                <span style={{ color: '#9ece6a' }}>
                                  {typeof value === 'string'
                                    ? `"${value.length > 40 ? `${value.slice(0, 40)}...` : value}"`
                                    : JSON.stringify(value)}
                                </span>
                              </span>
                            ))}
                          {Object.keys(frame.slots).length > 3 && (
                            <span className="text-[var(--text-tertiary)]">
                              +{Object.keys(frame.slots).length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Sentence-mode preview (legacy fallback)
  const sentences = getPreviewSentences();
  const identicalCount = prepared?.identical.length || 0;
  const stats = getResolutionStats();
  const keptSourceCount = prepared?.onlyInSource.filter((c) => c.keep).length || 0;
  const keptTargetCount = prepared?.onlyInTarget.filter((c) => c.keep).length || 0;

  return (
    <div className={cn(glass.panelBase, 'border-x-0 border-b-0 rounded-none')}>
      {/* Header - Always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-3 hover:bg-[var(--hover-bg)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4 text-[var(--text-tertiary)]" />
          <span className="font-medium text-[var(--text-primary)]">{t('mergePreview')}</span>
          <span className="text-sm text-[var(--text-tertiary)]">
            {sentences.length} sentences will be in final {t('commit').toLowerCase()}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
            <span className="text-[var(--diff-added-line)]">{identicalCount} identical</span>
            <span className="text-[var(--diff-modified-line)]">{stats.standard} resolved</span>
            {stats.both > 0 && (
              <span className="text-[var(--accent-commit)] flex items-center gap-0.5">
                <Layers className="h-3 w-3" />
                {stats.both} both
              </span>
            )}
            <span className="text-[var(--accent-commit)]">
              {keptSourceCount + keptTargetCount} unique kept
            </span>
          </div>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" />
          ) : (
            <ChevronUp className="h-4 w-4 text-[var(--text-tertiary)]" />
          )}
        </div>
      </button>

      {/* Content - Collapsible */}
      {expanded && (
        <div className="px-6 pb-4 max-h-64 overflow-auto">
          <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--stroke-divider)] p-[var(--space-group)] elevation-2">
            {sentences.length === 0 ? (
              <p className="text-center text-[var(--text-tertiary)] py-4">
                No sentences selected for merge
              </p>
            ) : (
              <div className="space-y-[var(--space-item)]">
                {sentences.map((sentence, idx) => (
                  <div key={sentence.id || idx} className="flex items-start gap-3 text-sm">
                    <span className="shrink-0 w-6 text-[var(--text-tertiary)] text-right">
                      {idx + 1}.
                    </span>
                    <span className="flex-1">{sentence.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
