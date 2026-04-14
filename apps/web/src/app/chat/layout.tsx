'use client';

import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { cn } from '@/utils/cn';
import { useChatStore } from '@/store/chatStore';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const collapsed = useChatStore((s) => s.sidebarCollapsed);

  return (
    <div className="h-screen overflow-hidden">
      <ChatSidebar />
      <main
        className={cn(
          'h-full overflow-hidden transition-[margin-left] duration-[var(--motion-slow)] ease-[var(--ease-out-soft)]',
          collapsed ? 'ml-16' : 'ml-52'
        )}
      >
        {children}
      </main>
    </div>
  );
}
