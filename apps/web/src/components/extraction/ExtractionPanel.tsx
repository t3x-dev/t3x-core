'use client';

import { motion } from 'framer-motion';
import { GitCommit, LayoutGrid, Loader2, X } from 'lucide-react';
import { useEffect, useCallback } from 'react';
import { useExtractionStore } from '@/store/extractionStore';
import { useExtractionUIStore, type ExtractionPhase } from '@/store/extractionUIStore';
import { useCommitStore } from '@/store/commitStore';
import { PhaseTabs } from './PhaseTabs';
import { IdleView } from './IdleView';
import { YOpsFeed } from './YOpsFeed';
import { TriageView } from './TriageView';
import { ReviewView } from './ReviewView';

/**
 * ExtractionPanel v6 — Top-level phase router.
 *
 * Collapsed rail (40px): icon + badge + vertical label
 * Expanded (380px): header + PhaseTabs + phase content
 * Uses framer-motion for width animation.
 */

const COLLAPSED_WIDTH = 40;
const DEFAULT_WIDTH = 380;

// ── Phase title map ──

const VIEW_TITLES: Record<string, string> = {
  idle: 'Knowledge',
  yops: 'YOps',
  triage: 'Triage',
  review: 'Review',
};

// ── Collapsed rail ──

function CollapsedRail({
  nodeCount,
  isExtracting,
  onExpand,
}: {
  nodeCount: number;
  isExtracting: boolean;
  onExpand: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center py-4 gap-3">
      <button
        type="button"
        onClick={onExpand}
        className="flex flex-col items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        aria-label="Expand extraction panel"
      >
        {isExtracting ? (
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--accent-extract)' }} />
        ) : (
          <LayoutGrid className="h-4 w-4" />
        )}
        {nodeCount > 0 && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none"
            style={{
              background: 'var(--accent-extract)',
              color: '#fff',
            }}
          >
            {nodeCount}
          </span>
        )}
      </button>
      <span
        className="text-[9px] font-medium uppercase tracking-widest text-[var(--text-tertiary)]"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
      >
        Knowledge
      </span>
    </div>
  );
}

// ── Extract button (header) ──

function ExtractButton() {
  const triggerExtract = useExtractionStore((s) => s.triggerExtract);

  return (
    <button
      type="button"
      className="flex items-center gap-1.5 cursor-pointer transition-all duration-150"
      style={{
        padding: '6px 14px',
        borderRadius: 8,
        border: '1px solid rgba(139,92,246,0.3)',
        background: 'rgba(139,92,246,0.08)',
        color: 'var(--accent-extract)',
        fontSize: 11,
        fontWeight: 600,
      }}
      onClick={() => triggerExtract?.()}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      Extract
    </button>
  );
}

// ── Phase content router ──
// Routes based on viewTab (what user is looking at), not phase (extraction lifecycle).
// In idle state, shows IdleView regardless.

function PhaseContent() {
  const phase = useExtractionUIStore((s) => s.phase);
  const viewTab = useExtractionUIStore((s) => s.viewTab);

  if (phase === 'idle') return <IdleView />;

  switch (viewTab) {
    case 'yops':
      return <YOpsFeed />;
    case 'triage':
      return <TriageView />;
    case 'review':
      return <ReviewView />;
    default:
      return null;
  }
}

// ── Main panel ──

interface ExtractionPanelProps {
  customWidth?: number;
}

export function ExtractionPanel({ customWidth }: ExtractionPanelProps) {
  const phase = useExtractionUIStore((s) => s.phase);
  const viewTab = useExtractionUIStore((s) => s.viewTab);
  const panelMode = useExtractionUIStore((s) => s.panelMode);
  const setPanelMode = useExtractionUIStore((s) => s.setPanelMode);
  const togglePanel = useExtractionUIStore((s) => s.togglePanel);
  const setPhase = useExtractionUIStore((s) => s.setPhase);
  const isExtracting = useExtractionStore((s) => s.isExtracting);
  const triggerExtract = useExtractionStore((s) => s.triggerExtract);
  const setTriggerExtract = useExtractionStore((s) => s.setTriggerExtract);
  const committedNodeSnapshot = useCommitStore((s) => s.committedNodeSnapshot);

  const isCollapsed = panelMode === 'collapsed';
  const expandedWidth = customWidth ?? DEFAULT_WIDTH;
  const targetWidth = isCollapsed ? COLLAPSED_WIDTH : expandedWidth;
  const nodeCount = Object.keys(committedNodeSnapshot).length;

  // ── Keyboard shortcuts ──
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // Cmd+] — toggle panel
      if (meta && e.key === ']') {
        e.preventDefault();
        togglePanel();
        return;
      }

      // Cmd+E — trigger extraction
      if (meta && e.key === 'e') {
        e.preventDefault();
        triggerExtract?.();
        return;
      }

      // A — accept all (triage only, not in an input)
      if (e.key === 'a' && viewTab === 'triage' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        const { useTriageStore: triageImport } = require('@/store/triageStore');
        triageImport.getState().acceptAll();
        return;
      }

      // Enter — proceed to next phase
      if (e.key === 'Enter' && !meta && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        if (viewTab === 'triage') {
          e.preventDefault();
          setPhase('review');
          return;
        }
      }

      // Cmd+Enter — commit (review only)
      if (meta && e.key === 'Enter' && viewTab === 'review') {
        e.preventDefault();
        // Commit via store
        const { useCommitStore: commitImport } = require('@/store/commitStore');
        const { useTriageStore: triageImport } = require('@/store/triageStore');
        commitImport.getState().commitNodes('').then(() => {
          setPhase('idle');
          triageImport.getState().reset();
        }).catch(() => {});
        return;
      }

      // Escape — back to previous phase / cancel
      if (e.key === 'Escape') {
        if (viewTab === 'review') {
          e.preventDefault();
          setPhase('triage');
        }
      }
    },
    [phase, togglePanel, triggerExtract, setPhase],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Collapsed rail ──
  if (isCollapsed) {
    return (
      <motion.div
        initial={false}
        animate={{ width: COLLAPSED_WIDTH }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex flex-col h-full overflow-hidden shrink-0"
        style={{
          background: 'var(--surface-panel)',
          borderLeft: '1px solid var(--stroke-default)',
        }}
      >
        <CollapsedRail
          nodeCount={nodeCount}
          isExtracting={isExtracting}
          onExpand={() => setPanelMode('default')}
        />
      </motion.div>
    );
  }

  // ── Expanded panel ──
  return (
    <motion.div
      initial={false}
      animate={{ width: targetWidth }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="flex flex-col h-full overflow-hidden shrink-0"
      style={{
        background: 'var(--surface-panel)',
        borderLeft: '1px solid var(--stroke-default)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--stroke-default)',
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        {/* Left side */}
        <div className="flex items-center gap-2">
          {isExtracting ? (
            <Loader2
              className="h-3.5 w-3.5 animate-spin"
              style={{ color: 'var(--accent-extract)' }}
            />
          ) : (
            <GitCommit
              className="h-3.5 w-3.5"
              style={{
                color: nodeCount > 0 ? '#4ade80' : 'var(--text-tertiary)',
                opacity: nodeCount > 0 ? 0.6 : 1,
              }}
            />
          )}
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: phase === 'idle' ? 'var(--text-secondary)' : 'var(--text-primary)',
            }}
          >
            {isExtracting ? 'Extracting...' : VIEW_TITLES[phase === 'idle' ? 'idle' : viewTab] ?? 'Knowledge'}
          </span>
          {phase === 'idle' && nodeCount > 0 && (
            <span
              style={{
                fontSize: 10,
                background: 'rgba(255,255,255,0.04)',
                padding: '1px 7px',
                borderRadius: 8,
                color: 'var(--text-secondary)',
              }}
            >
              {nodeCount}
            </span>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {phase === 'idle' && <ExtractButton />}
          <button
            type="button"
            className="flex items-center justify-center cursor-pointer"
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-tertiary)',
            }}
            onClick={() => setPanelMode('collapsed')}
            aria-label="Collapse panel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Phase tabs (hidden in idle) */}
      <PhaseTabs />

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        <PhaseContent />
      </div>
    </motion.div>
  );
}
