'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';
import { YOpsWorkspace } from '@/components/chat/YOpsWorkspace';
import { useInheritFromCommit } from '@/hooks/conversations/useInheritFromCommit';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const searchParams = useSearchParams();
  const firstMessage = searchParams.get('firstMessage');
  const activeProjectId = useChatStore((s) => s.activeProjectId);
  const panelExpanded = useWorkspaceStore((s) => s.panelExpanded);

  const { inheritFromCommitHash, clearInherit } = useInheritFromCommit(conversationId);

  // Resizable panel via drag handle
  const [panelWidth, setPanelWidth] = useState(700);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = containerRect.right - ev.clientX;
      setPanelWidth(Math.max(500, Math.min(1200, newWidth)));
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  const isExpanded = panelExpanded;

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden">
      {/* Chat area takes remaining space — key forces full re-mount on conversation switch */}
      <ChatWorkspace
        key={conversationId}
        conversationId={conversationId}
        projectId={activeProjectId ?? undefined}
        firstMessage={firstMessage ?? undefined}
        className="flex-1 min-w-0"
        inheritFromCommitHash={inheritFromCommitHash}
        onInheritComplete={clearInherit}
      />

      {/* Drag handle (only when panel is expanded) */}
      {isExpanded && (
        <div
          onMouseDown={handleMouseDown}
          className="w-1 cursor-col-resize hover:bg-[var(--accent-commit)]/30 active:bg-[var(--accent-commit)]/50 transition-colors flex-shrink-0"
        />
      )}

      {/* YOps workspace panel */}
      <YOpsWorkspace customWidth={isExpanded ? panelWidth : undefined} />
    </div>
  );
}
