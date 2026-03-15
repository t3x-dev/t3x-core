'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';
import { ExtractionPanel } from '@/components/chat/ExtractionPanel';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chatStore';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const searchParams = useSearchParams();
  const firstMessage = searchParams.get('firstMessage');
  const activeProjectId = useChatStore((s) => s.activeProjectId);
  const panelMode = useExtractionPanelStore((s) => s.panelMode);

  // Resizable panel via drag handle
  const [panelWidth, setPanelWidth] = useState(320);
  const [previewPrevWidth, setPreviewPrevWidth] = useState(320);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-widen when entering preview mode, restore when leaving
  const prevModeRef = useRef(panelMode);
  if (panelMode !== prevModeRef.current) {
    if (panelMode === 'preview' && prevModeRef.current !== 'preview') {
      setPreviewPrevWidth(panelWidth);
      setPanelWidth(Math.max(480, panelWidth));
    } else if (panelMode !== 'preview' && prevModeRef.current === 'preview') {
      setPanelWidth(previewPrevWidth);
    }
    prevModeRef.current = panelMode;
  }

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = containerRect.right - ev.clientX;
      setPanelWidth(Math.max(240, Math.min(600, newWidth)));
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

  const isExpanded = panelMode !== 'collapsed';

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden">
      {/* Chat area takes remaining space — key forces full re-mount on conversation switch */}
      <ChatWorkspace
        key={conversationId}
        conversationId={conversationId}
        projectId={activeProjectId ?? undefined}
        firstMessage={firstMessage ?? undefined}
        className="flex-1 min-w-0"
      />

      {/* Drag handle (only when panel is expanded) */}
      {isExpanded && (
        <div
          onMouseDown={handleMouseDown}
          className="w-1 cursor-col-resize hover:bg-[var(--accent-commit)]/30 active:bg-[var(--accent-commit)]/50 transition-colors flex-shrink-0"
        />
      )}

      {/* Extraction panel */}
      <ExtractionPanel customWidth={isExpanded ? panelWidth : undefined} />
    </div>
  );
}
