'use client';

import { LayoutDashboard, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chatStore';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';
import { BranchSwitcher } from './BranchSwitcher';
import { ChatModelSelector } from './ChatModelSelector';

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
  const { activeProjectId, activeBranch, setActiveBranch } = useChatStore();
  const setCommitBranch = useExtractionPanelStore((s) => s.setCommitBranch);

  const handleBranchChange = useCallback(
    (branch: string) => {
      setActiveBranch(branch);
      setCommitBranch(branch);
    },
    [setActiveBranch, setCommitBranch]
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
        'flex items-center gap-3 border-b border-[var(--stroke-divider)] px-4 py-2.5 shrink-0',
        glass.panelBase
      )}
    >
      {/* Left: Conversation title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-medium text-[var(--text-primary)] truncate">{displayTitle}</h1>
      </div>

      {/* Center: Model selector + project + branch badge */}
      {selectedModel && onModelChange && (
        <ChatModelSelector
          conversationId={conversationId ?? null}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
        />
      )}
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

      {/* Right: Canvas link + Settings */}
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
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => {
          if (activeProjectId) {
            router.push(`/project/${activeProjectId}/settings`);
          }
        }}
        disabled={!activeProjectId}
        className={cn(
          'shrink-0 h-8 w-8 text-[var(--text-secondary)] rounded-lg',
          'hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]',
          'transition-colors duration-[var(--motion-base)]',
          'disabled:opacity-40 disabled:cursor-not-allowed'
        )}
        aria-label="Project Settings"
      >
        <Settings className="h-3.5 w-3.5" />
      </Button>
    </header>
  );
}
