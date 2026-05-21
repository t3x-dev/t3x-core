'use client';

import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { useChatCompactViewport } from '@/hooks/shared/useChatCompactViewport';
import { CHAT_SIDEBAR_COLLAPSED_WIDTH, useChatStore } from '@/store/chatStore';
import { cn } from '@/utils/cn';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const collapsed = useChatStore((s) => s.sidebarCollapsed);
  const sidebarWidth = useChatStore((s) => s.sidebarWidth);
  const sidebarResizing = useChatStore((s) => s.sidebarResizing);
  const compactViewport = useChatCompactViewport();
  const contentOffset = compactViewport
    ? CHAT_SIDEBAR_COLLAPSED_WIDTH
    : collapsed
      ? CHAT_SIDEBAR_COLLAPSED_WIDTH
      : sidebarWidth;

  return (
    <div className="h-screen overflow-hidden">
      <ChatSidebar />
      <main
        className={cn(
          'h-full overflow-hidden bg-[var(--chat-panel)]',
          !sidebarResizing &&
            'transition-[margin-left] duration-[var(--motion-slow)] ease-[var(--ease-out-soft)]'
        )}
        style={{ marginLeft: contentOffset }}
      >
        {children}
      </main>
    </div>
  );
}
