'use client';

import { motion } from 'framer-motion';
import { GitCommit, LayoutGrid, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { framesToSentences } from '@/lib/framesToSentences';
import { cn } from '@/lib/utils';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';
import { CommitDropdown } from './CommitDropdown';
import { AdvisoryPanel } from './AdvisoryPanel';
import { FrameYAMLView } from './FrameYAMLView';
import { PreviewPanel } from './PreviewPanel';
import { TopicMap } from './TopicMap';

// ── Panel widths ──

const PANEL_WIDTHS: Record<string, number> = {
  collapsed: 40,
  default: 320,
  preview: 480,
};

// ── Collapsed rail ──

function CollapsedRail({
  frameCount,
  isExtracting,
  onExpand,
}: {
  frameCount: number;
  isExtracting: boolean;
  onExpand: () => void;
}) {
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



// ── Commit preview section ──

function CommitPreviewSection() {
  const router = useRouter();
  const conversationId = useExtractionPanelStore((s) => s.conversationId);
  const projectId = useExtractionPanelStore((s) => s.projectId);
  const lastCommitHash = useExtractionPanelStore((s) => s.lastCommitHash);
  const commitBranch = useExtractionPanelStore((s) => s.commitBranch);
  const isCommitting = useExtractionPanelStore((s) => s.isCommitting);
  const commitError = useExtractionPanelStore((s) => s.commitError);
  const selectDeltaFrames = useExtractionPanelStore((s) => s.selectDeltaFrames);
  const commitFrames = useExtractionPanelStore((s) => s.commitFrames);
  const setPanelMode = useExtractionPanelStore((s) => s.setPanelMode);
  const clearCommitError = useExtractionPanelStore((s) => s.clearCommitError);

  const [commitMessage, setCommitMessage] = useState('');
  const deltaFrames = selectDeltaFrames();
  const deltaSentences = framesToSentences(
    { frames: deltaFrames, relations: [] },
    conversationId ?? undefined
  );

  const handleConfirm = async () => {
    try {
      const result = await commitFrames(commitMessage);
      const commitUrl = projectId
        ? `/project/${projectId}/commit/${encodeURIComponent(result.hash)}`
        : null;
      toast.success(`Committed to ${commitBranch}`, {
        description: result.hash.slice(0, 16),
        action: commitUrl
          ? {
              label: 'View commit',
              onClick: () => router.push(commitUrl),
            }
          : undefined,
      });
      setCommitMessage('');
    } catch {
      // Error already set in store
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-primary)]">Commit Preview</span>
        <span className="text-[10px] text-[var(--text-tertiary)]">
          {deltaSentences.length} new sentence{deltaSentences.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
        {deltaSentences.length === 0 ? (
          <div className="text-[11px] text-[var(--text-tertiary)] italic py-2">
            All frames already committed — up to date
          </div>
        ) : (
          deltaSentences.map((s) => (
            <div
              key={s.id}
              className="text-[11px] text-[var(--text-secondary)] rounded px-2 py-1 bg-[var(--hover-bg)]"
            >
              <span className="text-green-500 mr-1">+</span>
              {s.text.length > 80 ? `${s.text.slice(0, 80)}...` : s.text}
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
        <span>
          Branch: <strong>{commitBranch}</strong>
        </span>
        <span>·</span>
        <span>{lastCommitHash ? `Parent: ${lastCommitHash.slice(0, 12)}` : 'Root commit'}</span>
      </div>

      <input
        type="text"
        value={commitMessage}
        onChange={(e) => setCommitMessage(e.target.value)}
        placeholder="Commit message (optional)"
        className="w-full rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-commit)]"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isCommitting && deltaSentences.length > 0) handleConfirm();
          if (e.key === 'Escape') setPanelMode('default');
        }}
        disabled={isCommitting}
      />

      {commitError && (
        <div className="text-[11px] text-red-400 bg-red-400/10 rounded px-2 py-1">
          {commitError}
          <button type="button" onClick={clearCommitError} className="ml-2 underline">
            dismiss
          </button>
        </div>
      )}

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setPanelMode('default')}
          disabled={isCommitting}
          className="flex-1 rounded border border-[var(--stroke-default)] px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isCommitting || deltaSentences.length === 0}
          className="flex-1 rounded bg-[var(--accent-commit)] px-2 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-40"
        >
          {isCommitting ? 'Committing...' : 'Confirm Commit'}
        </button>
      </div>
    </div>
  );
}

// ── Main ExtractionPanel ──

export function ExtractionPanel({ customWidth }: { customWidth?: number }) {
  const panelMode = useExtractionPanelStore((s) => s.panelMode);
  const draft = useExtractionPanelStore((s) => s.draft);
  const isExtracting = useExtractionPanelStore((s) => s.isExtracting);
  const togglePanel = useExtractionPanelStore((s) => s.togglePanel);
  const setPanelMode = useExtractionPanelStore((s) => s.setPanelMode);
  const lastDeltaChanges = useExtractionPanelStore((s) => s.lastDeltaChanges);
  const focusIntentEnabled = useExtractionPanelStore((s) => s.focusIntentEnabled);
  const setFocusIntent = useExtractionPanelStore((s) => s.setFocusIntent);

  const frameCount = draft.frames.length;
  const added = lastDeltaChanges.filter((c) => c.action === 'add').length;
  const updated = lastDeltaChanges.filter((c) => c.action === 'update').length;
  const removed = lastDeltaChanges.filter((c) => c.action === 'remove').length;
  const hasChanges = added + updated + removed > 0;
  const targetWidth =
    panelMode === 'collapsed'
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
              {hasChanges && !isExtracting && (
                <span
                  style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: 'var(--hover-bg)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {added > 0 && <span style={{ color: '#4ade80' }}>+{added}</span>}
                  {updated > 0 && <span style={{ color: '#facc15' }}> ~{updated}</span>}
                  {removed > 0 && <span style={{ color: '#f87171' }}> -{removed}</span>}
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

          {/* Topic list */}
          <TopicMap />

          {/* Focus intent toggle */}
          <div className="px-3 py-1.5 border-b border-[var(--stroke-default)]">
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '2px 0',
              }}
            >
              <input
                type="checkbox"
                checked={focusIntentEnabled}
                onChange={(e) => setFocusIntent(e.target.checked)}
                style={{ accentColor: 'rgb(139,92,246)' }}
              />
              Focus intent
            </label>
          </div>

          {/* Content area */}
          {panelMode === 'default' ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden">
                <FrameYAMLView />
              </div>
              <AdvisoryPanel />
              <CommitDropdown />
            </div>
          ) : (
            /* Preview mode: side-by-side (frames left, preview+commit right) */
            <div className="flex flex-1 overflow-hidden">
              {/* Left: extraction content */}
              <div className="flex flex-1 flex-col overflow-hidden border-r border-[var(--stroke-default)]">
                <div className="flex-1 overflow-hidden">
                  <FrameYAMLView />
                </div>
                <AdvisoryPanel />
                <CommitDropdown />
              </div>

              {/* Right: Preview + Commit */}
              <div className="flex flex-1 flex-col overflow-hidden">
                {/* Leaf preview */}
                <div className="flex-1 overflow-y-auto border-b border-[var(--stroke-default)]">
                  <PreviewPanel />
                </div>
                {/* Commit section */}
                <div className="overflow-y-auto">
                  <CommitPreviewSection />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
