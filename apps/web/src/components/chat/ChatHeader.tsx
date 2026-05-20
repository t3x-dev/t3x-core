'use client';

import { ChevronDown, Loader2, PanelLeftClose, PanelLeftOpen, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getExtractDisabledReason } from '@/domain/extractionReadiness';
import { useCommitActions } from '@/hooks/commits/useCommitActions';
import { useChatCompactViewport } from '@/hooks/shared/useChatCompactViewport';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import { selectPanelExpanded, useWorkspaceStore } from '@/store/workspaceStore';
import { cn } from '@/utils/cn';
import { getFixedPopoverStyle } from '@/utils/popoverPosition';
import { BranchSwitcher } from './BranchSwitcher';

const EXTRACT_MENU_WIDTH = 224;
const EXTRACT_MENU_ESTIMATED_HEIGHT = 260;

const PRESET_LABELS: Record<string, { label: string; desc: string }> = {
  concise: { label: 'Concise', desc: 'Key points (~30%)' },
  balanced: { label: 'Balanced', desc: 'All substantive content (~70-80%)' },
  detailed: { label: 'Detailed', desc: 'Everything including nuance (~95%)' },
};

interface ChatHeaderProps {
  conversationTitle?: string;
  projectName?: string;
  conversationId?: string | null;
  selectedProvider?: string | null;
  selectedModel?: string;
  onModelChange?: (provider: string, model: string) => void;
  isChatLoading?: boolean;
  isChatStreaming?: boolean;
  modelsLoading?: boolean;
}

export function ChatHeader({
  conversationTitle,
  projectName: _projectName,
  conversationId,
  selectedProvider,
  selectedModel,
  isChatLoading = false,
  isChatStreaming = false,
  modelsLoading = false,
}: ChatHeaderProps) {
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
  const panelExpanded = useWorkspaceStore(selectPanelExpanded);
  const isCommitted = useWorkspaceStore((s) => s.isCommitted);
  const workspaceMode = useWorkspaceStore((s) => s.mode);
  const isExtracting = workspaceMode === 'streaming';
  const hasDraft = useWorkspaceStore((s) => s.hasDraft);
  const extractionPreset = useWorkspaceStore((s) => s.extractionPreset);
  const setExtractionPreset = useWorkspaceStore((s) => s.setExtractionPreset);
  const turnCount = useWorkspaceStore((s) => s.turns.length);
  const lastError = useWorkspaceStore((s) => s.lastError);
  const compactViewport = useChatCompactViewport();
  // Extract requires both an active project and a resolved conversation in
  // the workspace store. On a direct load of /chat/[convId], `useChatInit`
  // backfills `activeProjectId` from `fetchConversationMeta` asynchronously;
  // the button can render visible before that fetch resolves. Without this
  // gate the click handler in `useExtraction` silently early-returns
  // (no toast, no API call) and the user has to click again after the
  // fetch lands. Disable the button while the precondition isn't met so
  // the failure mode is visible, not invisible.
  const workspaceConversationId = useWorkspaceStore((s) => s.conversationId);
  const extractDisabledReason = getExtractDisabledReason({
    activeProjectId,
    workspaceConversationId,
    routeConversationId: conversationId,
    turnCount,
    workspaceMode,
    isCommitted,
    hasDraft,
    isChatLoading,
    isChatStreaming,
    modelsLoading,
    selectedProvider,
    selectedModel,
    lastError,
  });
  const isExtractReady = extractDisabledReason === null;

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLButtonElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownRef.current?.contains(target) || dropdownMenuRef.current?.contains(target))
        return;
      setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const displayTitle = storeTitle || conversationTitle || 'New Chat';
  const getExtractMenuStyle = (): React.CSSProperties => {
    if (!chevronRef.current) {
      return { position: 'fixed', top: 0, left: 8, zIndex: 9999, width: EXTRACT_MENU_WIDTH };
    }

    return {
      ...getFixedPopoverStyle(chevronRef.current.getBoundingClientRect(), {
        width: EXTRACT_MENU_WIDTH,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        estimatedHeight: EXTRACT_MENU_ESTIMATED_HEIGHT,
        align: 'end',
      }),
      width: EXTRACT_MENU_WIDTH,
      maxHeight: 'min(320px, calc(100vh - 16px))',
      overflowY: 'auto',
    };
  };

  return (
    <header
      className={cn(
        'flex h-11 shrink-0 items-center gap-3 bg-[var(--panel)] px-4 backdrop-blur-[var(--fx-blur-panel)]'
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
      {panelExpanded && !compactViewport && (
        <div
          ref={dropdownRef}
          className="relative flex h-6 shrink-0 overflow-hidden rounded-full border border-[var(--source)]/[0.18] bg-[color-mix(in_srgb,var(--surface-panel)_76%,var(--source)_7%)]"
        >
          <button
            type="button"
            data-testid="extract-button"
            onClick={() => window.dispatchEvent(new CustomEvent('t3x:extract-requested'))}
            disabled={isExtracting || !isExtractReady}
            title={extractDisabledReason ?? undefined}
            className="flex min-w-0 items-center gap-1 px-2 text-[10px] font-semibold leading-none text-[var(--source)] transition-colors hover:bg-[var(--source)]/[0.08] disabled:cursor-not-allowed disabled:opacity-30"
          >
            {isExtracting ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            ) : (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--source)]/10">
                <Sparkles className="h-2.5 w-2.5" />
              </span>
            )}
            {isExtracting ? (
              'Extracting...'
            ) : (
              <span className="inline-flex min-w-0 items-center gap-1 leading-none">
                <span>Extract</span>
                <span className="max-w-[56px] truncate rounded-full bg-[var(--source)]/[0.08] px-1 py-0.5 text-[9px] font-medium leading-none opacity-80">
                  {PRESET_LABELS[extractionPreset].label}
                </span>
              </span>
            )}
          </button>
          <button
            ref={chevronRef}
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            disabled={isExtracting || !isExtractReady}
            aria-label="Extract options"
            title={extractDisabledReason ?? undefined}
            className="flex w-6 items-center justify-center border-l border-[var(--source)]/[0.12] text-[var(--source)] transition-colors hover:bg-[var(--source)]/[0.08] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronDown className="h-2.5 w-2.5" />
          </button>

          {dropdownOpen &&
            createPortal(
              <div
                ref={dropdownMenuRef}
                className="rounded-md border border-[var(--stroke-default)] bg-[var(--surface-elevated)] shadow-[var(--fx-shadow-lg)]"
                style={getExtractMenuStyle()}
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
                <div className="my-1 border-t border-[var(--stroke-default)]" />
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent('t3x:extract-requested', {
                        detail: { chooseSources: true },
                      })
                    );
                    setDropdownOpen(false);
                  }}
                  className="flex w-full flex-col px-3 py-2 text-left hover:bg-[var(--hover-bg)] transition-colors"
                >
                  <span className="text-xs font-medium text-[var(--text-primary)]">
                    Choose sources
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    Review pinned sources before extracting
                  </span>
                </button>
              </div>,
              document.body
            )}
        </div>
      )}
    </header>
  );
}
