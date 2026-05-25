'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { cn } from '@/utils/cn';

interface ChatSidebarToggleButtonProps {
  className?: string;
}

export function ChatSidebarToggleButton({ className }: ChatSidebarToggleButtonProps) {
  const sidebarCollapsed = useChatStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useChatStore((state) => state.toggleSidebar);

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className={cn(
        'shrink-0 rounded-lg p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]',
        className
      )}
      aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      {sidebarCollapsed ? (
        <PanelLeftOpen className="h-4 w-4" />
      ) : (
        <PanelLeftClose className="h-4 w-4" />
      )}
    </button>
  );
}
