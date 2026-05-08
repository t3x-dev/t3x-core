'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { UserMenu } from '@/components/layout/UserMenu';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useNewProjectChat } from '@/hooks/conversations/useNewProjectChat';
import { useProjectConversations } from '@/hooks/conversations/useProjectConversations';
import { useProjects } from '@/hooks/projects/useProjects';
import { CHAT_SIDEBAR_COLLAPSED_WIDTH, useChatStore } from '@/store/chatStore';
import { cn } from '@/utils/cn';
import { glass } from '@/utils/theme';
import { ContextMenuPortal, useContextMenu } from './sidebar/ContextMenu';
import { LogoIcon } from './sidebar/LogoIcon';
import { ProjectFolder } from './sidebar/ProjectFolder';

// ── Main Sidebar ──

export function ChatSidebar() {
  const router = useRouter();

  const {
    sidebarCollapsed: collapsed,
    sidebarResizing,
    activeConversationId,
    activeProjectId,
    expandedProjectIds,
    toggleProjectExpanded,
    setActiveConversation,
    sidebarWidth,
    setSidebarWidth,
    setSidebarResizing,
  } = useChatStore();

  const {
    projects,
    refresh: refreshProjects,
    remove: removeProject,
    create: createProject,
  } = useProjects();
  const {
    conversationsByProject: projectConversations,
    load: loadConversations,
    remove: removeConversationFn,
  } = useProjectConversations();
  const { start: startNewChat } = useNewProjectChat();

  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  // Track pending auto-navigation when expanding a project for the first time
  const pendingNavProjectId = useRef<string | null>(null);

  const refreshKey = useChatStore((s) => s.refreshKey);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (collapsed) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startWidth = useChatStore.getState().sidebarWidth;
      setSidebarResizing(true);

      const handleMove = (ev: MouseEvent) => {
        setSidebarWidth(startWidth + ev.clientX - startX);
      };

      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
        window.removeEventListener('blur', handleUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setSidebarResizing(false);
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
      window.addEventListener('blur', handleUp);
    },
    [collapsed, setSidebarResizing, setSidebarWidth]
  );

  const handleResizeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      setSidebarWidth(sidebarWidth + (e.key === 'ArrowRight' ? 16 : -16));
    },
    [setSidebarWidth, sidebarWidth]
  );

  // Re-fetch projects when refreshKey changes (useProjects does the initial load)
  useEffect(() => {
    if (refreshKey === 0) return;
    void refreshProjects();
  }, [refreshKey, refreshProjects]);

  // Fetch conversations for expanded projects (re-fetch on refreshKey)
  useEffect(() => {
    for (const projectId of Array.from(expandedProjectIds)) {
      void loadConversations(projectId);
    }
  }, [expandedProjectIds, refreshKey, loadConversations]);

  // Auto-navigate to latest conversation after expanding a project (data may load async)
  useEffect(() => {
    const pid = pendingNavProjectId.current;
    if (!pid) return;
    const convs = projectConversations[pid];
    if (!convs) return; // Data not yet loaded
    pendingNavProjectId.current = null;
    if (convs.length > 0) {
      setActiveConversation(convs[0].conversation_id, pid);
      router.push(`/chat/${convs[0].conversation_id}`);
    }
  }, [projectConversations, router, setActiveConversation]);

  function handleConversationClick(convId: string, projectId: string) {
    setActiveConversation(convId, projectId);
    router.push(`/chat/${convId}`);
  }

  async function handleNewProject() {
    try {
      const project = await createProject('Untitled Project');
      // Prime the store so ChatWorkspace.useAutoProject reuses this project
      // for the first message instead of creating another one. The query
      // param is the source of truth on refresh (store state is in-memory),
      // and matches the existing empty-project redirect contract.
      setActiveConversation(null, project.project_id);
      // Expand the new folder so the user sees the empty state
      // ("No conversations") under the highlighted project, reinforcing
      // that this is where their next chat will land.
      const store = useChatStore.getState();
      if (!store.expandedProjectIds.has(project.project_id)) {
        store.toggleProjectExpanded(project.project_id);
      }
      store.refreshSidebar();
      router.push(`/chat?projectId=${encodeURIComponent(project.project_id)}`);
    } catch {
      // Fallback: land on blank chat so users can still type a first message
      // (which will auto-create a project via useAutoProject).
      setActiveConversation(null, null);
      router.push('/chat');
    }
  }

  async function handleNewChatInProject(projectId: string) {
    const convId = await startNewChat(projectId);
    if (!convId) {
      router.push('/chat');
      return;
    }
    setActiveConversation(convId, projectId);
    router.push(`/chat/${convId}`);
    useChatStore.getState().refreshSidebar();
  }

  function handleCanvasClick(projectId: string) {
    router.push(`/project/${projectId}`);
  }

  async function handleDeleteProject(projectId: string) {
    if (!window.confirm('Are you sure you want to delete this project? This cannot be undone.')) {
      return;
    }
    try {
      await removeProject(projectId);
      window.location.reload();
    } catch {
      // silently fail
    }
  }

  async function handleDeleteConversation(projectId: string, convId: string) {
    if (!window.confirm('Are you sure you want to delete this conversation?')) {
      return;
    }
    try {
      await removeConversationFn(projectId, convId);
      window.location.reload();
    } catch {
      // silently fail
    }
  }

  function handleProjectContextMenu(e: React.MouseEvent, projectId: string) {
    openMenu(e, [
      {
        label: 'Delete Project',
        icon: <Trash2 className="h-3.5 w-3.5" />,
        danger: true,
        onClick: () => handleDeleteProject(projectId),
      },
    ]);
  }

  function handleConversationContextMenu(e: React.MouseEvent, projectId: string, convId: string) {
    openMenu(e, [
      {
        label: 'Delete Conversation',
        icon: <Trash2 className="h-3.5 w-3.5" />,
        danger: true,
        onClick: () => handleDeleteConversation(projectId, convId),
      },
    ]);
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        aria-label="Chat navigation"
        className={cn(
          'fixed left-0 top-0 z-40 flex h-screen flex-col overflow-hidden border-r border-[var(--stroke-default)] bg-[var(--surface-panel)] backdrop-blur-[var(--fx-blur-panel)]',
          !sidebarResizing &&
            'transition-[width] duration-[var(--motion-slow)] ease-[var(--ease-out-soft)]',
          glass.highlight,
          collapsed ? 'items-center' : ''
        )}
        style={{ width: collapsed ? CHAT_SIDEBAR_COLLAPSED_WIDTH : sidebarWidth }}
      >
        {/* Logo */}
        <div
          className={cn(
            'flex h-11 shrink-0 items-center border-b border-[var(--stroke-default)]',
            collapsed ? 'justify-center px-2' : 'px-3'
          )}
        >
          <button
            type="button"
            onClick={() => {
              setActiveConversation(null, null);
              router.push('/chat');
            }}
            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          >
            <LogoIcon />
            {!collapsed && (
              <span className="text-sm font-semibold text-[var(--text-primary)] truncate">T3X</span>
            )}
          </button>
        </div>

        {/* New Project button */}
        <div className={cn('py-2', collapsed ? 'flex justify-center px-2' : 'px-3')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                onClick={handleNewProject}
                className={cn(
                  'rounded-xl bg-[var(--accent-commit)]/10 ring-1 ring-[var(--accent-commit)]/30',
                  'text-[var(--accent-commit)] hover:bg-[var(--accent-commit)]/20 hover:text-[var(--accent-commit)]',
                  'transition-all duration-[var(--motion-base)]',
                  collapsed ? 'h-10 w-10' : 'h-10 w-full justify-start gap-2 px-3'
                )}
                aria-label="New project"
              >
                <Plus className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="text-sm font-medium">New Project</span>}
              </Button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" sideOffset={8}>
                New Project
              </TooltipContent>
            )}
          </Tooltip>
        </div>

        {/* Scrollable content: Projects + conversations */}
        <ScrollArea className="min-w-0 flex-1 w-full">
          <div
            className={cn(
              'flex min-w-0 flex-col gap-0.5 py-2',
              collapsed ? 'items-center px-2' : 'px-0'
            )}
          >
            {/* Projects section header */}
            {!collapsed && projects.length > 0 && (
              <div className="px-4 pt-2 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Projects
                </span>
              </div>
            )}

            {/* Project folders */}
            {projects.map((project) => (
              <ProjectFolder
                key={project.project_id}
                project={project}
                conversations={projectConversations[project.project_id] ?? []}
                isExpanded={expandedProjectIds.has(project.project_id)}
                isActive={activeProjectId === project.project_id}
                activeConversationId={activeConversationId}
                collapsed={collapsed}
                onToggleExpand={() => {
                  const wasExpanded = expandedProjectIds.has(project.project_id);
                  toggleProjectExpanded(project.project_id);
                  // Auto-navigate to latest conversation when expanding (not collapsing)
                  if (!wasExpanded) {
                    const convs = projectConversations[project.project_id] ?? [];
                    if (convs.length > 0) {
                      // Data already loaded (re-expanding) — navigate immediately
                      handleConversationClick(convs[0].conversation_id, project.project_id);
                    } else {
                      // First expand — data loading async, navigate when ready
                      pendingNavProjectId.current = project.project_id;
                    }
                  }
                }}
                onConversationClick={(convId) =>
                  handleConversationClick(convId, project.project_id)
                }
                onNewChat={(pid) => handleNewChatInProject(pid)}
                onCanvasClick={() => handleCanvasClick(project.project_id)}
                onProjectContextMenu={(e) => handleProjectContextMenu(e, project.project_id)}
                onConversationContextMenu={(e, convId) =>
                  handleConversationContextMenu(e, project.project_id, convId)
                }
              />
            ))}

            {projects.length === 0 && !collapsed && (
              <div className="px-4 py-4 text-center">
                <span className="text-xs text-[var(--text-tertiary)]">No projects yet</span>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Bottom section */}
        <div
          className={cn(
            'mt-auto flex min-w-0 flex-col gap-1 py-3 border-t border-[var(--stroke-divider)]',
            collapsed ? 'items-center px-2' : 'px-3'
          )}
        >
          {/* User Menu — Settings lives in this dropdown (Profile / Settings / Sign Out) */}
          <UserMenu collapsed={collapsed} />
        </div>
      </aside>

      {!collapsed && (
        <button
          type="button"
          aria-label="Resize project sidebar"
          title="Drag to resize sidebar"
          onMouseDown={handleResizeMouseDown}
          onKeyDown={handleResizeKeyDown}
          className="group fixed top-0 z-50 flex h-screen w-2 -translate-x-1/2 cursor-col-resize justify-center border-0 bg-transparent p-0 focus-visible:outline-none"
          style={{ left: sidebarWidth }}
        >
          <span
            aria-hidden="true"
            className={cn(
              'h-full w-px transition-colors',
              sidebarResizing
                ? 'bg-[var(--accent-commit)]/60'
                : 'bg-transparent group-hover:bg-[var(--accent-commit)]/45 group-active:bg-[var(--accent-commit)]/60 group-focus-visible:bg-[var(--accent-commit)]/45'
            )}
          />
        </button>
      )}

      {/* Context menu portal */}
      {menu && <ContextMenuPortal menu={menu} onClose={closeMenu} />}
    </TooltipProvider>
  );
}
