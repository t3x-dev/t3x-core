'use client';

import { Workflow } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { formatUserFacingError } from '@/domain/format/errors';
import { getProjectIdWorkspacePath } from '@/domain/project/repoPath';
import { useConversationBranchSwitch } from '@/hooks/conversations/useConversationBranchSwitch';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { cn } from '@/utils/cn';
import { BranchSwitcher } from './BranchSwitcher';
import { ChatSidebarToggleButton } from './ChatSidebarToggleButton';

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

export function ChatHeader({ conversationTitle, conversationId }: ChatHeaderProps) {
  const { activeProjectId, activeBranch, conversationTitle: storeTitle } = useChatStore();
  const switchConversationBranch = useConversationBranchSwitch();
  const isCommitted = useWorkspaceStore((state) => state.isCommitted);
  const [branchSwitching, setBranchSwitching] = useState(false);

  const branchDisabledReason = isCommitted
    ? 'Committed conversations keep their branch.'
    : branchSwitching
      ? 'Updating branch...'
      : null;

  const handleBranchChange = useCallback(
    async (branch: string) => {
      if (branch === activeBranch) return;
      if (branchDisabledReason) {
        toast.message(branchDisabledReason, { id: 'branch-change-disabled' });
        return;
      }
      if (!activeProjectId) return;
      setBranchSwitching(true);
      try {
        await switchConversationBranch({ projectId: activeProjectId, conversationId, branch });
      } catch (error) {
        toast.error(formatUserFacingError(error, 'Failed to update branch.'));
      } finally {
        setBranchSwitching(false);
      }
    },
    [activeBranch, activeProjectId, branchDisabledReason, conversationId, switchConversationBranch]
  );

  const canOpenWorkspace = Boolean(activeProjectId && conversationId && conversationId !== 'new');
  const workspaceHref = canOpenWorkspace
    ? getProjectIdWorkspacePath(activeProjectId!, {
        branch: activeBranch,
        sourceConversationId: conversationId,
      })
    : null;
  const displayTitle = storeTitle || conversationTitle || 'New Chat';

  return (
    <header
      className={cn(
        'flex h-11 shrink-0 items-center gap-3 bg-[var(--chat-panel)] px-4 backdrop-blur-[var(--fx-blur-panel)]'
      )}
    >
      <ChatSidebarToggleButton className="-ml-1.5" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-medium text-[var(--text-primary)]">{displayTitle}</h1>
      </div>

      {activeBranch && activeProjectId && (
        <BranchSwitcher
          projectId={activeProjectId}
          activeBranch={activeBranch}
          onBranchChange={handleBranchChange}
          disabled={branchDisabledReason !== null}
          disabledReason={branchDisabledReason ?? undefined}
        />
      )}

      {workspaceHref && (
        <a
          data-testid="open-workspace-button"
          data-intro-target="chat-workspace-action"
          href={workspaceHref}
          title="Review and commit this Source through the repository Workspace"
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-[var(--source)]/20 bg-[var(--source)]/[0.07] px-2.5 text-[10px] font-semibold text-[var(--source)] transition-colors hover:bg-[var(--source)]/[0.12]"
        >
          <Workflow className="h-3 w-3" />
          Open Workspace
        </a>
      )}
    </header>
  );
}
