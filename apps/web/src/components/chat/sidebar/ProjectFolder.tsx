'use client';

import { Folder } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useChatStore } from '@/store/chatStore';
import type { Conversation, Project } from '@/types/api';
import { cn } from '@/utils/cn';

export interface ProjectFolderProps {
  project: Project;
  conversations: Conversation[];
  isExpanded: boolean;
  /** Currently-selected project (highlight even when collapsed/no conv yet). */
  isActive: boolean;
  activeConversationId: string | null;
  collapsed: boolean;
  onToggleExpand: () => void;
  onConversationClick: (convId: string) => void;
  onNewChat: (projectId: string) => void;
  onCanvasClick: () => void;
  onProjectContextMenu: (e: React.MouseEvent) => void;
  onConversationContextMenu: (e: React.MouseEvent, convId: string) => void;
}

// Project icon colors — cycle through based on project index
export const PROJECT_ICON_COLORS = [
  { bg: 'bg-[var(--accent-commit)]/15', text: 'text-[var(--accent-commit)]' },
  { bg: 'bg-[var(--source)]/15', text: 'text-[var(--source)]' },
  { bg: 'bg-[var(--accent-leaf)]/15', text: 'text-[var(--accent-leaf)]' },
  { bg: 'bg-[var(--accent-pending)]/15', text: 'text-[var(--accent-pending)]' },
  { bg: 'bg-[var(--accent-conversation)]/15', text: 'text-[var(--accent-conversation)]' },
];

export function ProjectFolder({
  project,
  conversations,
  isExpanded,
  isActive,
  activeConversationId,
  collapsed,
  onToggleExpand,
  onConversationClick,
  onNewChat,
  onCanvasClick: _onCanvasClick,
  onProjectContextMenu,
  onConversationContextMenu,
}: ProjectFolderProps) {
  const convCount = project.conversations_count ?? conversations.length;
  const commitCount = project.commits_count ?? 0;
  const projectSummary = `${commitCount > 0 ? 'main · ' : ''}${commitCount} ${commitCount === 1 ? 'commit' : 'commits'} · ${convCount} ${convCount === 1 ? 'source' : 'sources'}`;

  const folderButton = (
    <button
      type="button"
      title={`${project.name}\n${projectSummary}`}
      onClick={() => {
        if (collapsed) {
          useChatStore.setState({ sidebarCollapsed: false });
        }
        onToggleExpand();
      }}
      onContextMenu={onProjectContextMenu}
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'group/project relative box-border flex min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-transparent transition-all duration-[var(--motion-base)] ease-[var(--ease-out-soft)]',
        'hover:bg-[var(--hover-bg)]',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]/50',
        'active:scale-[0.99] cursor-pointer w-full text-left',
        collapsed ? 'h-9 w-9 justify-center' : 'min-h-[44px] px-2 py-1.5',
        // Active wins over expanded: a project picked from "+ New Project"
        // (or any nav that prims activeProjectId) gets a tinted bg + ring
        // so the user immediately sees which project they're producing in,
        // even before the folder is expanded or has any conversations yet.
        isActive
          ? 'border-[var(--accent-commit)]/20 bg-[var(--accent-commit)]/[0.075] text-[var(--text-primary)] shadow-[var(--fx-shadow-sm)]'
          : isExpanded && !collapsed
            ? 'bg-[var(--hover-bg)]/65 text-[var(--text-primary)]'
            : 'text-[var(--text-secondary)]'
      )}
    >
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--hover-bg)]/75 text-[var(--text-tertiary)] transition-colors',
          isActive && 'bg-[var(--accent-commit)]/10 text-[var(--accent-commit)]',
          !isActive && 'group-hover/project:text-[var(--text-secondary)]'
        )}
      >
        <Folder className="h-4 w-4" />
      </span>
      {!collapsed && (
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold leading-4"
            title={project.name}
          >
            {project.name}
          </span>
          <span
            className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[10px] leading-3 text-[var(--text-tertiary)]"
            title={projectSummary}
          >
            {commitCount > 0 && (
              <>
                <span className="inline-flex items-center gap-0.5">
                  <span className="h-1 w-1 rounded-full bg-[var(--accent-commit)]" />
                  main
                </span>
                {' · '}
              </>
            )}
            {commitCount} {commitCount === 1 ? 'commit' : 'commits'}
            {' · '}
            {convCount} {convCount === 1 ? 'source' : 'sources'}
          </span>
        </div>
      )}
      {!collapsed && commitCount > 0 && (
        <span className="flex h-[17px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--accent-commit-soft)] px-1 text-[9px] font-semibold text-[var(--accent-commit)]">
          {commitCount}
        </span>
      )}
    </button>
  );

  return (
    <div className={cn('min-w-0', collapsed ? 'flex w-full flex-col items-center' : 'w-full')}>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{folderButton}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {project.name}
          </TooltipContent>
        </Tooltip>
      ) : (
        <div className="min-w-0 w-full px-2.5">{folderButton}</div>
      )}

      {isExpanded && !collapsed && (
        <div className="ml-[29px] mr-2.5 mt-1 flex min-w-0 flex-col gap-0.5 border-l border-[var(--stroke-divider)]/80 pl-2">
          {/* Conversations */}
          {conversations.map((conv) => {
            const isActive = activeConversationId === conv.conversation_id;
            const title = conv.title ?? conv.conversation_id.slice(0, 30);
            return (
              <button
                key={conv.conversation_id}
                type="button"
                title={title}
                onClick={() => onConversationClick(conv.conversation_id)}
                onContextMenu={(e) => onConversationContextMenu(e, conv.conversation_id)}
                className={cn(
                  'relative flex h-7 min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 w-full text-left',
                  'transition-all duration-[var(--motion-base)] text-[11px]',
                  isActive
                    ? 'bg-[var(--accent-conversation-soft)] font-semibold text-[var(--text-primary)]'
                    : 'text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)]'
                )}
              >
                <span
                  className={cn(
                    'w-[5px] h-[5px] rounded-full shrink-0',
                    isActive
                      ? 'bg-[var(--accent-conversation)]'
                      : 'bg-[var(--text-tertiary)] opacity-30'
                  )}
                />
                <span className="block min-w-0 max-w-full flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {title}
                </span>
              </button>
            );
          })}

          {conversations.length === 0 && (
            <span className="px-2 py-1 text-[10px] text-[var(--text-tertiary)]/80">
              No conversations
            </span>
          )}

          {/* Add new chat within this project — only when at least one commit exists */}
          {commitCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNewChat(project.project_id);
              }}
              className="flex h-7 min-w-0 w-full items-center gap-1.5 overflow-hidden rounded-md px-2 text-left text-[10px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)]"
            >
              <span className="text-xs">+</span>
              <span className="block min-w-0 max-w-full flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                New Chat
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
