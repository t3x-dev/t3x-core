'use client';

import { FileText, Folder, GitCommitHorizontal, MessagesSquare, Network } from 'lucide-react';
import type { Conversation, Leaf, Project } from '@/types/api';
import { cn } from '@/utils/cn';

interface CurrentProjectWorkbenchProps {
  project: Project;
  conversations: Conversation[];
  activeConversationId: string | null;
  leaves: Leaf[];
  leavesLoading: boolean;
  conversationCommitHashes?: Record<string, string>;
  onSourceChatsClick: () => void;
  onCanvasClick: () => void;
  onCommitsClick: () => void;
  onOutputsClick: (leafId: string) => void;
  onConversationClick: (conversationId: string) => void;
  onNewChat: () => void;
  onProjectContextMenu: (event: React.MouseEvent) => void;
  onConversationContextMenu: (event: React.MouseEvent, conversationId: string) => void;
}

function SidebarSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pb-1 pt-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
        {children}
      </span>
    </div>
  );
}

function WorkbenchBadge({ children, leaf }: { children: React.ReactNode; leaf?: boolean }) {
  return (
    <span
      className={cn(
        'flex h-[17px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[9px] font-semibold',
        leaf
          ? 'bg-[var(--accent-leaf)]/12 text-[var(--accent-leaf)]'
          : 'bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]'
      )}
    >
      {children}
    </span>
  );
}

interface WorkbenchButtonProps {
  icon: React.ReactNode;
  label: string;
  count: number | string;
  active?: boolean;
  leaf?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function WorkbenchButton({
  icon,
  label,
  count,
  active,
  leaf,
  disabled,
  onClick,
}: WorkbenchButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[11px] font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]/50',
        active
          ? 'bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]',
        disabled &&
          'cursor-not-allowed opacity-55 hover:bg-transparent hover:text-[var(--text-secondary)]'
      )}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <WorkbenchBadge leaf={leaf}>{count}</WorkbenchBadge>
    </button>
  );
}

function shortCommitHash(hash: string | null | undefined): string | null {
  return hash ? hash.replace(/^sha256:/, '').slice(0, 8) : null;
}

export function CurrentProjectWorkbench({
  project,
  conversations,
  activeConversationId,
  leaves,
  leavesLoading,
  conversationCommitHashes = {},
  onSourceChatsClick,
  onCanvasClick,
  onCommitsClick,
  onOutputsClick,
  onConversationClick,
  onNewChat,
  onProjectContextMenu,
  onConversationContextMenu,
}: CurrentProjectWorkbenchProps) {
  const convCount = project.conversations_count ?? conversations.length;
  const commitCount = project.commits_count ?? 0;
  const projectSummary = `${commitCount > 0 ? 'main · ' : ''}${commitCount} ${
    commitCount === 1 ? 'commit' : 'commits'
  } · ${convCount} ${convCount === 1 ? 'source' : 'sources'} · ${leaves.length} ${
    leaves.length === 1 ? 'output' : 'outputs'
  }`;
  const firstLeaf = leaves[0];

  return (
    <>
      <SidebarSectionLabel>Current Project</SidebarSectionLabel>
      <div className="mx-2.5 w-[calc(var(--chat-sidebar-visible-width)-20px)] min-w-0 overflow-hidden">
        <div
          title={`${project.name}\n${projectSummary}`}
          onContextMenu={onProjectContextMenu}
          className="box-border flex min-h-[44px] w-full min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-[var(--accent-commit)]/25 bg-[var(--sidebar-panel)] px-2 py-1.5 text-[var(--text-primary)] shadow-none"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--accent-commit)]/10 text-[var(--accent-commit)]">
            <Folder className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold leading-4">
              {project.name}
            </span>
            <span className="flex max-w-full items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] leading-none text-[var(--text-tertiary)]">
              {commitCount > 0 && (
                <>
                  <span className="inline-flex h-3 items-center gap-0.5 leading-none">
                    <span className="h-1 w-1 rounded-full bg-[var(--accent-commit)]" />
                    main
                  </span>
                  <span className="inline-flex h-3 items-center leading-none">·</span>
                </>
              )}
              <span className="inline-flex h-3 items-center leading-none">
                {commitCount} {commitCount === 1 ? 'commit' : 'commits'}
              </span>
              <span className="inline-flex h-3 items-center leading-none">·</span>
              <span className="inline-flex h-3 items-center leading-none">
                {convCount} {convCount === 1 ? 'source' : 'sources'}
              </span>
              <span className="inline-flex h-3 items-center leading-none">·</span>
              <span className="inline-flex h-3 items-center leading-none">
                {leaves.length} {leaves.length === 1 ? 'output' : 'outputs'}
              </span>
            </span>
          </div>
          {commitCount > 0 && <WorkbenchBadge>{commitCount}</WorkbenchBadge>}
        </div>
      </div>

      <SidebarSectionLabel>Functions</SidebarSectionLabel>
      <div className="mx-2.5 w-[calc(var(--chat-sidebar-visible-width)-20px)] min-w-0 overflow-hidden rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)]/65 p-1">
        <WorkbenchButton
          icon={<MessagesSquare className="h-3.5 w-3.5" />}
          label="Source Chats"
          count={convCount}
          active
          onClick={onSourceChatsClick}
        />
        <WorkbenchButton
          icon={<Network className="h-3.5 w-3.5" />}
          label="Canvas"
          count={commitCount}
          onClick={onCanvasClick}
        />
        <WorkbenchButton
          icon={<GitCommitHorizontal className="h-3.5 w-3.5" />}
          label="Commits"
          count={commitCount}
          onClick={onCommitsClick}
        />
        <WorkbenchButton
          icon={<FileText className="h-3.5 w-3.5" />}
          label="Outputs"
          count={leavesLoading ? '...' : leaves.length}
          leaf
          disabled={!firstLeaf}
          onClick={() => firstLeaf && onOutputsClick(firstLeaf.id)}
        />
      </div>

      <SidebarSectionLabel>Chats in current project</SidebarSectionLabel>
      <div className="mx-2.5 mb-1 w-[calc(var(--chat-sidebar-visible-width)-20px)] min-w-0 overflow-hidden rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)]/65 p-1">
        {conversations.map((conversation) => {
          const isActive = activeConversationId === conversation.conversation_id;
          const title = conversation.title ?? conversation.conversation_id.slice(0, 30);
          const conversationCommitHash =
            conversation.committed_as ?? conversationCommitHashes[conversation.conversation_id];
          const committedShortHash = shortCommitHash(conversationCommitHash);
          const displayTitle = committedShortHash ? `${title} · ${committedShortHash}` : title;
          return (
            <button
              key={conversation.conversation_id}
              type="button"
              title={
                conversationCommitHash
                  ? `${displayTitle}\ncommit ${conversationCommitHash}`
                  : displayTitle
              }
              onClick={() => onConversationClick(conversation.conversation_id)}
              onContextMenu={(event) =>
                onConversationContextMenu(event, conversation.conversation_id)
              }
              className={cn(
                'relative flex h-7 min-w-0 w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left text-[11px] transition-colors',
                isActive
                  ? 'bg-[var(--accent-conversation-soft)] font-semibold text-[var(--text-primary)]'
                  : 'text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)]'
              )}
            >
              <span
                className={cn(
                  'h-[5px] w-[5px] shrink-0 rounded-full',
                  isActive
                    ? 'bg-[var(--accent-conversation)]'
                    : 'bg-[var(--text-tertiary)] opacity-30'
                )}
              />
              <span className="flex min-w-0 flex-1 items-center gap-1">
                <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {title}
                </span>
                {committedShortHash && (
                  <span className="shrink-0 text-[10px] font-medium text-[var(--text-tertiary)]">
                    · {committedShortHash}
                  </span>
                )}
              </span>
            </button>
          );
        })}

        {conversations.length === 0 && (
          <span className="block px-2 py-1 text-[10px] text-[var(--text-tertiary)]/80">
            No conversations
          </span>
        )}

        {commitCount > 0 && (
          <button
            type="button"
            onClick={onNewChat}
            className="flex h-7 min-w-0 w-full items-center gap-1.5 overflow-hidden rounded-md px-2 text-left text-[10px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)]"
          >
            <span className="text-xs">+</span>
            <span className="block min-w-0 max-w-full flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
              New Chat
            </span>
          </button>
        )}
      </div>
    </>
  );
}
