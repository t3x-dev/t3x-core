'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';
import { YOpsWorkspace } from '@/components/chat/YOpsWorkspace';
import { useInheritFromCommit } from '@/hooks/conversations/useInheritFromCommit';
import { useChatStore } from '@/store/chatStore';
import { selectPanelExpanded, useWorkspaceStore } from '@/store/workspaceStore';
import {
  clampWorkspacePanelWidth,
  getPreferredWorkspacePanelWidth,
  WORKSPACE_PANEL_FALLBACK_WIDTH,
} from '@/utils/chatWorkspaceLayout';

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const searchParams = useSearchParams();
  const firstMessage = searchParams.get('firstMessage');
  const initialProvider = searchParams.get('provider');
  const initialModel = searchParams.get('model');
  const inheritFromParam = searchParams.get('inheritFrom');
  // Project context comes from two sources:
  //   - the in-memory chat store (filled by sidebar nav, post-extract, etc.)
  //   - a `projectId` query param (set by the empty-project redirect from
  //     /project/[id], or any other deep-link that wants to anchor the
  //     conversation to a specific project on cold start).
  // The query param wins so a direct load / refresh of the chat URL
  // doesn't lose the project context the URL is explicitly carrying.
  const projectIdParam = searchParams.get('projectId');
  const activeProjectId = useChatStore((s) => s.activeProjectId);
  const resolvedProjectId = projectIdParam ?? activeProjectId;
  const panelExpanded = useWorkspaceStore(selectPanelExpanded);
  const setActiveWorkspaceProject = useWorkspaceStore((s) => s.setActiveProject);

  // Mirror the resolved project into the workspace store so the per-project
  // expansion preference (`panelExpandedByProject[resolvedProjectId]`) keys
  // off the right project for both reads and writes.
  useEffect(() => {
    setActiveWorkspaceProject(resolvedProjectId ?? null);
  }, [resolvedProjectId, setActiveWorkspaceProject]);

  const { inheritFromCommitHash, clearInherit } = useInheritFromCommit(conversationId);
  const resolvedInheritFromCommitHash = inheritFromParam ?? inheritFromCommitHash;

  const [panelWidth, setPanelWidth] = useState(WORKSPACE_PANEL_FALLBACK_WIDTH);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasMeasuredPanelWidth = useRef(false);
  const isExpanded = panelExpanded;

  useEffect(() => {
    if (!isExpanded || !containerRef.current) return;

    const syncPanelWidth = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.getBoundingClientRect().width;
      const firstMeasurement = !hasMeasuredPanelWidth.current;
      const preferredWidth = getPreferredWorkspacePanelWidth(containerWidth);
      hasMeasuredPanelWidth.current = true;
      setPanelWidth((current) => {
        const requested = firstMeasurement ? preferredWidth : current;
        return clampWorkspacePanelWidth(requested, containerWidth);
      });
    };

    syncPanelWidth();

    if (typeof ResizeObserver === 'undefined') return;
    const resizeObserver = new ResizeObserver(syncPanelWidth);
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [isExpanded]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = containerRect.right - ev.clientX;
      setPanelWidth(clampWorkspacePanelWidth(newWidth, containerRect.width));
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

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden">
      {/* Chat area takes remaining space — key forces full re-mount on conversation switch */}
      <ChatWorkspace
        key={conversationId}
        conversationId={conversationId}
        projectId={resolvedProjectId ?? undefined}
        firstMessage={firstMessage ?? undefined}
        initialProvider={initialProvider ?? undefined}
        initialModel={initialModel ?? undefined}
        className="flex-1 min-w-0"
        inheritFromCommitHash={resolvedInheritFromCommitHash ?? undefined}
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
