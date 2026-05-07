'use client';

import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { CHAT_SIDEBAR_COLLAPSED_WIDTH, useChatStore } from '@/store/chatStore';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const collapsed = useChatStore((s) => s.sidebarCollapsed);
  const sidebarWidth = useChatStore((s) => s.sidebarWidth);
  const contentOffset = collapsed ? CHAT_SIDEBAR_COLLAPSED_WIDTH : sidebarWidth;

  return (
    <div className="h-screen overflow-hidden">
      <ChatSidebar />
      <main
        className="h-full overflow-hidden transition-[margin-left] duration-[var(--motion-slow)] ease-[var(--ease-out-soft)]"
        style={{ marginLeft: contentOffset }}
      >
        {children}
      </main>
    </div>
  );
}
