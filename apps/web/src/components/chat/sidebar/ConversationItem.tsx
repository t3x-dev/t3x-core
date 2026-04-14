'use client';

import { MessageSquare } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatTimeAgo } from '@/domain/format/timeUtils';
import type { Conversation } from '@/types/api';
import { cn } from '@/lib/utils';

export interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function ConversationItem({
  conversation,
  isActive,
  collapsed,
  onClick,
  onContextMenu,
}: ConversationItemProps) {
  const title = conversation.title ?? conversation.conversation_id.slice(0, 40);
  const timeAgo = formatTimeAgo(conversation.created_at);

  const baseClass = cn(
    'flex items-center gap-2 rounded-xl transition-all duration-[var(--motion-base)] ease-[var(--ease-out-soft)]',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]/50',
    'active:scale-95 cursor-pointer w-full text-left',
    collapsed ? 'h-10 w-10 justify-center' : 'h-9 px-3'
  );

  const activeClass = cn(
    baseClass,
    'border-l-2 border-[var(--accent-commit)] bg-[var(--hover-bg-strong)] text-[var(--text-primary)]'
  );

  const inactiveClass = cn(
    baseClass,
    'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
  );

  const inner = collapsed ? (
    <MessageSquare className="h-4 w-4 shrink-0" />
  ) : (
    <>
      <MessageSquare className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
      <span className="text-xs font-medium truncate flex-1">{title}</span>
      <span className="text-[10px] text-[var(--text-tertiary)] shrink-0 ml-auto">{timeAgo}</span>
    </>
  );

  const button = (
    <button
      type="button"
      className={isActive ? activeClass : inactiveClass}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {inner}
    </button>
  );

  if (!collapsed) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {title}
      </TooltipContent>
    </Tooltip>
  );
}
