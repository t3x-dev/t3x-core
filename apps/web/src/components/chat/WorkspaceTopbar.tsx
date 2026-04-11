'use client';

import type { TreeNode } from '@t3x-dev/core';
import { ChevronDown, Hexagon, Loader2, PanelRightClose, Play } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { computeTreeDiff } from '@/lib/treeDiff';
import { cn } from '@/lib/utils';
import { useDraftStore } from '@/store/draftStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

const PRESET_LABELS: Record<string, { label: string; desc: string }> = {
  concise: { label: 'Concise', desc: 'Key points (~30%)' },
  balanced: { label: 'Balanced', desc: 'All substantive content (~70-80%)' },
  detailed: { label: 'Detailed', desc: 'Everything including nuance (~95%)' },
};

export function WorkspaceTopbar() {
  const setPanelExpanded = useWorkspaceStore((s) => s.setPanelExpanded);
  const mode = useWorkspaceStore((s) => s.mode);
  const base = useWorkspaceStore((s) => s.base);
  const result = useWorkspaceStore((s) => s.result);
  const parseErrors = useWorkspaceStore((s) => s.parseErrors);
  const scriptOps = useWorkspaceStore((s) => s.scriptOps);
  const execute = useWorkspaceStore((s) => s.execute);
  const extractionPreset = useWorkspaceStore((s) => s.extractionPreset);
  const setExtractionPreset = useWorkspaceStore((s) => s.setExtractionPreset);

  const isExtracting = useDraftStore((s) => s.isExtracting);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const diff = useMemo(() => {
    if (!result) return null;
    return computeTreeDiff(base.trees as TreeNode[], result.trees as TreeNode[]);
  }, [base.trees, result]);

  const quoteValidation = useWorkspaceStore((s) => s.quoteValidation);

  const canRun =
    mode !== 'streaming' &&
    mode !== 'committing' &&
    parseErrors.length === 0 &&
    scriptOps.length > 0;

  // Close dropdown on outside click
  const handleBlur = () => {
    setTimeout(() => {
      if (!dropdownRef.current?.contains(document.activeElement)) {
        setDropdownOpen(false);
      }
    }, 150);
  };

  return (
    <div className="flex h-11 items-center gap-2 px-3 border-b border-[var(--stroke-default)] bg-[var(--panel-alt)]">
      <span className="text-xs font-semibold">YOps Workspace</span>

      {mode === 'streaming' && (
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
          <Loader2 className="h-3 w-3 animate-spin text-[var(--source)]" />
          Extracting...
        </span>
      )}

      {diff && (
        <div className="flex items-center gap-1 ml-2">
          {diff.summary.nodesAdded > 0 && (
            <span className="text-[8px] font-semibold font-mono px-1.5 py-0.5 rounded bg-[var(--status-success)]/15 text-[var(--status-success)]">
              +{diff.summary.nodesAdded} node{diff.summary.nodesAdded !== 1 ? 's' : ''}
            </span>
          )}
          {diff.summary.slotsAdded > 0 && (
            <span className="text-[8px] font-semibold font-mono px-1.5 py-0.5 rounded bg-[var(--status-success)]/15 text-[var(--status-success)]">
              +{diff.summary.slotsAdded} slot{diff.summary.slotsAdded !== 1 ? 's' : ''}
            </span>
          )}
          {diff.summary.slotsModified > 0 && (
            <span className="text-[8px] font-semibold font-mono px-1.5 py-0.5 rounded bg-[var(--status-warning)]/15 text-[var(--status-warning)]">
              ~{diff.summary.slotsModified}
            </span>
          )}
          {diff.summary.nodesRemoved > 0 && (
            <span className="text-[8px] font-semibold font-mono px-1.5 py-0.5 rounded bg-[var(--status-error)]/15 text-[var(--status-error)]">
              -{diff.summary.nodesRemoved}
            </span>
          )}
        </div>
      )}

      {quoteValidation && quoteValidation.total > 0 && (
        <span
          className={`text-[8px] font-semibold font-mono px-1.5 py-0.5 rounded ${
            quoteValidation.coverage === 1
              ? 'bg-[var(--status-success)]/15 text-[var(--status-success)]'
              : quoteValidation.coverage >= 0.7
                ? 'bg-[var(--status-warning)]/15 text-[var(--status-warning)]'
                : 'bg-[var(--status-error)]/15 text-[var(--status-error)]'
          }`}
          title={
            quoteValidation.missing.length > 0
              ? `Missing quotes: ${quoteValidation.missing.join(', ')}`
              : 'All slots have source quotes'
          }
        >
          {quoteValidation.quoted}/{quoteValidation.total} quoted
        </span>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {/* Extract split button */}
        <div ref={dropdownRef} className="relative flex" onBlur={handleBlur}>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('t3x:extract-requested'))}
            disabled={isExtracting}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-l border border-r-0 border-[var(--source)]/30 bg-[var(--source)]/10 text-[var(--source)] hover:bg-[var(--source)]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExtracting ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <Hexagon className="h-2.5 w-2.5" />
            )}
            {isExtracting ? 'Extracting...' : 'Extract'}
            {!isExtracting && (
              <span className="text-[8px] opacity-70">
                {PRESET_LABELS[extractionPreset].label}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            disabled={isExtracting}
            className="flex items-center px-1 py-1 text-[10px] rounded-r border border-[var(--source)]/30 bg-[var(--source)]/10 text-[var(--source)] hover:bg-[var(--source)]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronDown className="h-2.5 w-2.5" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] shadow-lg">
              {(['concise', 'balanced', 'detailed'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setExtractionPreset(preset);
                    setDropdownOpen(false);
                  }}
                  className={cn(
                    'flex flex-col w-full px-3 py-2 text-left hover:bg-[var(--hover-bg)] transition-colors',
                    preset === extractionPreset && 'bg-[var(--source)]/10'
                  )}
                >
                  <span className="text-xs font-medium text-[var(--text-primary)]">
                    {PRESET_LABELS[preset].label}
                    {preset === extractionPreset && (
                      <span className="ml-1.5 text-[8px] text-[var(--source)]">current</span>
                    )}
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    {PRESET_LABELS[preset].desc}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={execute}
          disabled={!canRun}
          className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded bg-[var(--action)] text-white hover:bg-[var(--action-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Play className="h-2.5 w-2.5" />
          {result ? 'Re-run' : 'Run'}
        </button>
        <button
          type="button"
          onClick={() => setPanelExpanded(false)}
          className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
          title="Collapse panel"
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
