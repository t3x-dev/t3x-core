'use client';

import { LayoutDashboard, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { PinButton } from '@/components/ui/PinButton';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import { BranchSwitcher } from './BranchSwitcher';

interface ChatHeaderProps {
  conversationTitle?: string;
  projectName?: string;
  conversationId?: string | null;
  selectedModel?: string;
  onModelChange?: (provider: string, model: string) => void;
}

export function ChatHeader({
  conversationTitle,
  projectName,
  conversationId,
  selectedModel,
  onModelChange,
}: ChatHeaderProps) {
  const router = useRouter();
  const { activeProjectId, activeBranch, setActiveBranch, sidebarCollapsed, toggleSidebar } = useChatStore();
  const setCommitBranch = useCommitStore((s) => s.setCommitBranch);

  const initCommitState = useCommitStore((s) => s.initCommitState);

  const handleBranchChange = useCallback(
    (branch: string) => {
      setActiveBranch(branch);
      setCommitBranch(branch);
      // Re-initialize commit state (lastCommitHash, parent) for the new branch
      if (activeProjectId) {
        initCommitState(activeProjectId);
      }
    },
    [setActiveBranch, setCommitBranch, initCommitState, activeProjectId]
  );

  const handleCanvasClick = () => {
    if (activeProjectId) {
      router.push(`/project/${activeProjectId}`);
    }
  };

  const displayTitle = conversationTitle ?? 'New Conversation';

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

      {/* Branch + project badges */}
      {(projectName || activeBranch) && (
        <div className="flex items-center gap-2 shrink-0">
          {projectName && (
            <span className="text-xs font-medium text-[var(--text-secondary)] bg-[var(--hover-bg)] px-2 py-0.5 rounded-md truncate max-w-[140px]">
              {projectName}
            </span>
          )}
          {activeBranch && activeProjectId && (
            <BranchSwitcher
              projectId={activeProjectId}
              activeBranch={activeBranch}
              onBranchChange={handleBranchChange}
            />
          )}
        </div>
      )}

      {/* Right: Pin + Canvas link */}
      {activeProjectId && conversationId && (
        <PinButton projectId={activeProjectId} type="conversation" refId={conversationId} />
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleCanvasClick}
        disabled={!activeProjectId}
        className={cn(
          'shrink-0 gap-1.5 text-xs text-[var(--text-secondary)] rounded-lg',
          'hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]',
          'transition-colors duration-[var(--motion-base)]',
          'disabled:opacity-40 disabled:cursor-not-allowed'
        )}
        aria-label="Open Canvas"
      >
        <LayoutDashboard className="h-3.5 w-3.5" />
        <span>Canvas</span>
      </Button>
    </header>
  );
}
