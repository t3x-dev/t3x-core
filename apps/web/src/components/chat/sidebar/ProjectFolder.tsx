'use client';

import { FolderOpen } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Conversation, Project } from '@/lib/api/types';
import { cn } from '@/lib/utils';

export interface ProjectFolderProps {
  project: Project;
  conversations: Conversation[];
  isExpanded: boolean;
  activeConversationId: string | null;
  collapsed: boolean;
  onToggleExpand: () => void;
  onConversationClick: (convId: string) => void;
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
  activeConversationId,
  collapsed,
  onToggleExpand,
  onConversationClick,
  onCanvasClick: _onCanvasClick,
  onProjectContextMenu,
  onConversationContextMenu,
}: ProjectFolderProps) {
  // Deterministic color based on project_id hash
  const colorIdx =
    project.project_id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) %
    PROJECT_ICON_COLORS.length;
  const iconColor = PROJECT_ICON_COLORS[colorIdx];
  const convCount = project.conversations_count ?? conversations.length;
  const commitCount = project.commits_count ?? 0;

  const folderButton = (
    <button
      type="button"
      onClick={onToggleExpand}
      onContextMenu={onProjectContextMenu}
      className={cn(
        'flex items-center gap-2 rounded-xl transition-all duration-[var(--motion-base)] ease-[var(--ease-out-soft)]',
        'hover:bg-[var(--hover-bg)]',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]/50',
        'active:scale-95 cursor-pointer w-full text-left',
        collapsed ? 'h-10 w-10 justify-center' : 'min-h-[44px] px-2 py-1.5',
        isExpanded && !collapsed
          ? 'bg-[var(--hover-bg-strong)] text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)]'
      )}
    >
      {/* Colored project icon */}
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm',
          iconColor.bg,
          iconColor.text
        )}
      >
        <FolderOpen className="h-3.5 w-3.5" />
      </div>
      {!collapsed && (
        <div className="flex flex-1 flex-col min-w-0">
          <span className="text-xs font-semibold truncate">{project.name}</span>
          <span className="text-[9px] text-[var(--text-tertiary)]">
            {convCount} conversation{convCount !== 1 ? 's' : ''}
            {commitCount > 0 ? ` · ${commitCount} commit${commitCount !== 1 ? 's' : ''}` : ''}
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
    <div>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{folderButton}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {project.name}
          </TooltipContent>
        </Tooltip>
      ) : (
        folderButton
      )}

      {isExpanded && !collapsed && (
        <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-[var(--stroke-divider)] pl-2">
          {/* Conversations */}
          {conversations.map((conv) => {
            const isActive = activeConversationId === conv.conversation_id;
            const title = conv.title ?? conv.conversation_id.slice(0, 30);
            return (
              <button
                key={conv.conversation_id}
                type="button"
                onClick={() => onConversationClick(conv.conversation_id)}
                onContextMenu={(e) => onConversationContextMenu(e, conv.conversation_id)}
                className={cn(
                  'flex items-center gap-2 rounded-lg h-7 px-2 w-full text-left',
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
                <span className="truncate">{title}</span>
              </button>
            );
          })}

          {conversations.length === 0 && (
            <span className="text-[10px] text-[var(--text-tertiary)] px-2 py-1">
              No conversations
            </span>
          )}
        </div>
      )}
    </div>
  );
}
