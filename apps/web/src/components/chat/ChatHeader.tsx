'use client';

import { ChevronDown, Hexagon, Loader2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCommitActions } from '@/hooks/useCommitActions';
import { glass } from '@/utils/theme';
import { cn } from '@/utils/cn';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { BranchSwitcher } from './BranchSwitcher';

const PRESET_LABELS: Record<string, { label: string; desc: string }> = {
  concise: { label: 'Concise', desc: 'Key points (~30%)' },
  balanced: { label: 'Balanced', desc: 'All substantive content (~70-80%)' },
  detailed: { label: 'Detailed', desc: 'Everything including nuance (~95%)' },
};

interface ChatHeaderProps {
  conversationTitle?: string;
  projectName?: string;
  conversationId?: string | null;
  selectedModel?: string;
  onModelChange?: (provider: string, model: string) => void;
}

export function ChatHeader({ conversationTitle, projectName, conversationId }: ChatHeaderProps) {
  const {
    activeProjectId,
    activeBranch,
    setActiveBranch,
    sidebarCollapsed,
    toggleSidebar,
    conversationTitle: storeTitle,
  } = useChatStore();
  const setCommitBranch = useCommitStore((s) => s.setCommitBranch);
  const { init: initCommitState } = useCommitActions();
  const panelExpanded = useWorkspaceStore((s) => s.panelExpanded);
  const isCommitted = useWorkspaceStore((s) => s.isCommitted);
  const isExtracting = useWorkspaceStore((s) => s.mode === 'streaming');
  const extractionPreset = useWorkspaceStore((s) => s.extractionPreset);
  const setExtractionPreset = useWorkspaceStore((s) => s.setExtractionPreset);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLButtonElement>(null);

  const handleBranchChange = useCallback(
    (branch: string) => {
      setActiveBranch(branch);
      setCommitBranch(branch);
      if (activeProjectId) {
        initCommitState(activeProjectId);
      }
    },
    [setActiveBranch, setCommitBranch, initCommitState, activeProjectId]
  );

  const handleBlur = () => {
    setTimeout(() => {
      setDropdownOpen(false);
    }, 200);
  };

  const displayTitle = storeTitle || conversationTitle || 'New Chat';

  return (
    <header
      className={cn(
        'flex h-11 items-center gap-3 border-b border-[var(--stroke-divider)] px-4 shrink-0',
        glass.panelBase
      )}
    >
      {/* Sidebar toggle */}
      <button
        type="button"
        onClick={toggleSidebar}
        className="shrink-0 p-1.5 -ml-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="h-4 w-4" />
        ) : (
          <PanelLeftClose className="h-4 w-4" />
        )}
      </button>

      {/* Left: Conversation title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-medium text-[var(--text-primary)] truncate">{displayTitle}</h1>
      </div>

      {/* Branch badge */}
      {activeBranch && activeProjectId && (
        <BranchSwitcher
          projectId={activeProjectId}
          activeBranch={activeBranch}
          onBranchChange={handleBranchChange}
        />
      )}

      {/* Extract split button — only visible when YOps panel is expanded */}
      {panelExpanded && !isCommitted && (
        <div ref={dropdownRef} className="relative flex shrink-0" onBlur={handleBlur}>
          <button
            type="button"
            data-testid="extract-button"
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
              <span className="text-[8px] opacity-70">{PRESET_LABELS[extractionPreset].label}</span>
            )}
          </button>
          <button
            ref={chevronRef}
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            disabled={isExtracting}
            className="flex items-center px-1 py-1 text-[10px] rounded-r border border-[var(--source)]/30 bg-[var(--source)]/10 text-[var(--source)] hover:bg-[var(--source)]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronDown className="h-2.5 w-2.5" />
          </button>

          {dropdownOpen &&
            createPortal(
              <div
                className="w-56 rounded-md border border-[var(--stroke-default)] bg-white dark:bg-zinc-900 shadow-xl"
                style={{
                  position: 'fixed',
                  top: chevronRef.current
                    ? chevronRef.current.getBoundingClientRect().bottom + 4
                    : 0,
                  left: chevronRef.current
                    ? chevronRef.current.getBoundingClientRect().right - 224
                    : 0,
                  zIndex: 9999,
                }}
              >
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
              </div>,
              document.body
            )}
        </div>
      )}
    </header>
  );
}
