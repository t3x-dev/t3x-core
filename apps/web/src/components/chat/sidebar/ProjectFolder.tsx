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
  { bg: 'bg-[var(--status-success)]/15', text: 'text-[var(--status-success)]' },
  { bg: 'bg-[var(--accent-pending)]/15', text: 'text-[var(--accent-pending)]' },
  { bg: 'bg-[var(--status-error)]/15', text: 'text-[var(--status-error)]' },
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
        'box-border flex min-w-0 items-center gap-2.5 overflow-hidden rounded-xl border border-transparent transition-all duration-[var(--motion-base)] ease-[var(--ease-out-soft)]',
        'hover:border-[var(--stroke-default)] hover:bg-[var(--hover-bg)]',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]/50',
        'active:scale-95 cursor-pointer w-full text-left',
        collapsed ? 'h-10 w-10 justify-center' : 'min-h-[52px] px-2.5 py-2',
        // Active wins over expanded: a project picked from "+ New Project"
        // (or any nav that prims activeProjectId) gets a tinted bg + ring
        // so the user immediately sees which project they're producing in,
        // even before the folder is expanded or has any conversations yet.
        isActive
          ? 'bg-[var(--accent-commit)]/10 ring-1 ring-[var(--accent-commit)]/30 text-[var(--text-primary)]'
          : isExpanded && !collapsed
            ? 'bg-[var(--hover-bg-strong)] text-[var(--text-primary)]'
            : 'text-[var(--text-secondary)]'
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--hover-bg)] text-[var(--text-tertiary)]',
          isActive && 'bg-[var(--panel)]/70 text-[var(--accent-commit)]'
        )}
      >
        <Folder className="h-4 w-4" />
      </span>
      {!collapsed && (
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold"
            title={project.name}
          >
            {project.name}
          </span>
          <span
            className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-[var(--text-tertiary)]"
            title={projectSummary}
          >
            {commitCount > 0 && (
              <>
                <span className="inline-flex items-center gap-0.5">
                  <span className="h-1 w-1 rounded-full bg-[var(--status-success)]" />
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
        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--status-success)]/15 px-1 text-[9px] font-bold text-[var(--status-success)] shrink-0">
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
        <div className="min-w-0 w-full px-3">{folderButton}</div>
      )}

      {isExpanded && !collapsed && (
        <div className="ml-8 mr-3 mt-1 flex min-w-0 flex-col gap-0.5 border-l border-[var(--stroke-divider)] pl-2">
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
                  'flex min-w-0 items-center gap-2 overflow-hidden rounded-lg h-7 px-2 w-full text-left',
                  'transition-all duration-[var(--motion-base)] text-[11px]',
                  isActive
                    ? 'text-[var(--text-primary)] font-semibold'
                    : 'text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)]'
                )}
              >
                <span
                  className={cn(
                    'w-[5px] h-[5px] rounded-full shrink-0',
                    isActive ? 'bg-[var(--accent-commit)]' : 'bg-[var(--text-tertiary)] opacity-30'
                  )}
                />
                <span className="block min-w-0 max-w-full flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {title}
                </span>
              </button>
            );
          })}

          {conversations.length === 0 && (
            <span className="text-[10px] text-[var(--text-tertiary)] px-2 py-1">
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
              className="flex min-w-0 items-center gap-1.5 overflow-hidden rounded-lg h-7 px-2 w-full text-left text-[10px] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)] transition-colors"
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
