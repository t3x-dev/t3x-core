'use client';

import { motion } from 'framer-motion';
import { GitCommit, LayoutGrid, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';
import { CommitDropdown } from './CommitDropdown';
import { FrameGraphMini } from './FrameGraphMini';
import { FrameYAMLView } from './FrameYAMLView';

// ── Panel widths ──

const PANEL_WIDTHS: Record<string, number> = {
  collapsed: 40,
  default: 320,
  preview: 480,
};

// ── Collapsed rail ──

function CollapsedRail({ frameCount, isExtracting, onExpand }: { frameCount: number; isExtracting: boolean; onExpand: () => void }) {
  return (
    <div className="flex h-full flex-col items-center py-4 gap-3">
      <button
        type="button"
        onClick={onExpand}
        className="flex flex-col items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        aria-label="Expand extraction panel"
      >
        {isExtracting ? (
          <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-commit)]" />
        ) : (
          <LayoutGrid className="h-4 w-4" />
        )}
        {frameCount > 0 && (
          <span className="rounded-full bg-[var(--accent-commit)] px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">
            {frameCount}
          </span>
        )}
      </button>
      {/* Vertical label */}
      <span
        className="text-[9px] font-medium uppercase tracking-widest text-[var(--text-tertiary)]"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
      >
        {isExtracting ? 'Processing...' : 'Frames'}
      </span>
    </div>
  );
}

// ── View toggle tabs ──

function ViewTabs({
  activeView,
  onChangeView,
}: {
  activeView: 'graph' | 'yaml';
  onChangeView: (v: 'graph' | 'yaml') => void;
}) {
  return (
    <div className="flex border-b border-[var(--stroke-default)]">
      {(['graph', 'yaml'] as const).map((view) => (
        <button
          key={view}
          type="button"
          onClick={() => onChangeView(view)}
          className={cn(
            'flex-1 py-2 text-xs font-medium capitalize transition-colors',
            activeView === view
              ? 'border-b-2 border-[var(--accent-commit)] text-[var(--text-primary)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          )}
        >
          {view}
        </button>
      ))}
    </div>
  );
}

// ── Main ExtractionPanel ──

export function ExtractionPanel({ customWidth }: { customWidth?: number }) {
  const panelMode = useExtractionPanelStore((s) => s.panelMode);
  const activeView = useExtractionPanelStore((s) => s.activeView);
  const draft = useExtractionPanelStore((s) => s.draft);
  const isExtracting = useExtractionPanelStore((s) => s.isExtracting);
  const togglePanel = useExtractionPanelStore((s) => s.togglePanel);
  const setPanelMode = useExtractionPanelStore((s) => s.setPanelMode);
  const setActiveView = useExtractionPanelStore((s) => s.setActiveView);

  const frameCount = draft.frames.length;
  const targetWidth = panelMode === 'collapsed'
    ? PANEL_WIDTHS.collapsed
    : (customWidth ?? PANEL_WIDTHS[panelMode] ?? 320);

  // Keyboard shortcut: Cmd+] to toggle panel
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === ']') {
        e.preventDefault();
        togglePanel();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [togglePanel]);

  return (
    <motion.div
      animate={{ width: targetWidth }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="relative flex h-full flex-shrink-0 flex-col border-l border-[var(--stroke-default)] bg-[var(--surface-panel)] overflow-hidden"
    >
      {/* Collapsed rail */}
      {panelMode === 'collapsed' && (
        <CollapsedRail frameCount={frameCount} isExtracting={isExtracting} onExpand={togglePanel} />
      )}

      {/* Default / Preview panel */}
      {panelMode !== 'collapsed' && (
        <div className="flex h-full flex-col min-w-0">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-[var(--stroke-default)] px-3 py-2">
            <div className="flex items-center gap-1.5">
              {isExtracting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-commit)]" />
              ) : (
                <GitCommit className="h-3.5 w-3.5 text-[var(--accent-commit)]" />
              )}
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                {isExtracting ? 'Extracting...' : 'Frames'}
              </span>
              {frameCount > 0 && !isExtracting && (
                <span className="rounded-full bg-[var(--hover-bg)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
                  {frameCount}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={togglePanel}
              className="rounded p-0.5 text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
              aria-label="Collapse panel"
            >
              ×
            </button>
          </div>

          {/* View toggle */}
          <ViewTabs activeView={activeView} onChangeView={setActiveView} />

          {/* Content area */}
          {panelMode === 'default' ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden">
                {activeView === 'graph' ? <FrameGraphMini /> : <FrameYAMLView />}
              </div>
              <CommitDropdown />
            </div>
          ) : (
            /* Preview mode: split vertically */
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Top: extraction content */}
              <div className="flex-1 overflow-hidden border-b border-[var(--stroke-default)]">
                {activeView === 'graph' ? <FrameGraphMini /> : <FrameYAMLView />}
              </div>

              {/* Bottom: PreviewPanel placeholder (Task 9) */}
              <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-[var(--surface-panel)]">
                <span className="text-xs text-[var(--text-tertiary)]">Preview Panel</span>
                <span className="text-[10px] text-[var(--text-tertiary)]">(Task 9)</span>
                <button
                  type="button"
                  onClick={() => setPanelMode('default')}
                  className="mt-2 rounded px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
                >
                  Back to Default
                </button>
              </div>

              <CommitDropdown />
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
