'use client';

import { GitBranch, Leaf, MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UserMenu } from '@/components/layout/UserMenu';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DEFAULT_PROJECT_NAME } from '@/domain/project/defaults';
import { useNewProjectChat } from '@/hooks/conversations/useNewProjectChat';
import { useProjectConversations } from '@/hooks/conversations/useProjectConversations';
import { useProjectLeaves } from '@/hooks/leaves/useProjectLeaves';
import { useProjects } from '@/hooks/projects/useProjects';
import { useChatCompactViewport } from '@/hooks/shared/useChatCompactViewport';
import { CHAT_SIDEBAR_COLLAPSED_WIDTH, useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import { cn } from '@/utils/cn';
import { glass } from '@/utils/theme';
import { ContextMenuPortal, useContextMenu } from './sidebar/ContextMenu';
import { LogoIcon } from './sidebar/LogoIcon';
import { ProjectFolder } from './sidebar/ProjectFolder';

// ── Main Sidebar ──

type RenameTarget =
  | {
      kind: 'project';
      projectId: string;
      currentName: string;
    }
  | {
      kind: 'conversation';
      projectId: string;
      conversationId: string;
      currentName: string;
    };

type RecentConversation = {
  conversationId: string;
  projectId: string;
  projectName: string;
  title: string;
};

export function ChatSidebar() {
  const router = useRouter();
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectError, setNewProjectError] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const {
    sidebarCollapsed: collapsed,
    sidebarResizing,
    activeConversationId,
    activeProjectId,
    expandedProjectIds,
    setActiveConversation,
    setConversationTitle,
    sidebarWidth,
    setSidebarWidth,
    setSidebarResizing,
  } = useChatStore();
  const compactViewport = useChatCompactViewport();
  const setCommitConversationTitle = useCommitStore((s) => s.setConversationTitle);

  const {
    projects,
    refresh: refreshProjects,
    remove: removeProject,
    create: createProject,
    rename: renameProject,
  } = useProjects();
  const {
    conversationsByProject: projectConversations,
    load: loadConversations,
    remove: removeConversationFn,
    rename: renameConversation,
  } = useProjectConversations();
  const { start: startNewChat } = useNewProjectChat();

  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const wasCompactViewportRef = useRef(false);

  const refreshKey = useChatStore((s) => s.refreshKey);

  const currentProject = useMemo(() => {
    if (activeProjectId) {
      return projects.find((project) => project.project_id === activeProjectId) ?? null;
    }
    if (!activeConversationId) return null;
    return (
      projects.find((project) =>
        (projectConversations[project.project_id] ?? []).some(
          (conversation) => conversation.conversation_id === activeConversationId
        )
      ) ?? null
    );
  }, [activeConversationId, activeProjectId, projectConversations, projects]);

  const currentProjectId = currentProject?.project_id ?? null;
  const { leaves: currentProjectLeaves, loading: currentProjectLeavesLoading } = useProjectLeaves(
    currentProjectId,
    Boolean(currentProjectId && !collapsed)
  );

  const recentConversations = useMemo<RecentConversation[]>(() => {
    return Object.entries(projectConversations)
      .flatMap(([projectId, conversations]) => {
        const projectName =
          projects.find((project) => project.project_id === projectId)?.name ?? 'Project';
        return conversations.map((conversation) => ({
          conversationId: conversation.conversation_id,
          projectId,
          projectName,
          title: conversation.title ?? conversation.conversation_id.slice(0, 30),
        }));
      })
      .slice(0, 6);
  }, [projectConversations, projects]);

  const sidebarVisibleWidth = collapsed
    ? `${CHAT_SIDEBAR_COLLAPSED_WIDTH}px`
    : compactViewport
      ? `min(${sidebarWidth}px, calc(100vw - ${CHAT_SIDEBAR_COLLAPSED_WIDTH}px))`
      : `${sidebarWidth}px`;
  const sidebarStyle = {
    width: sidebarVisibleWidth,
    '--chat-sidebar-visible-width': sidebarVisibleWidth,
  } as React.CSSProperties;

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (collapsed || compactViewport) return;
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
    [collapsed, compactViewport, setSidebarResizing, setSidebarWidth]
  );

  const handleResizeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (collapsed || compactViewport) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      setSidebarWidth(sidebarWidth + (e.key === 'ArrowRight' ? 16 : -16));
    },
    [collapsed, compactViewport, setSidebarWidth, sidebarWidth]
  );

  useEffect(() => {
    if (compactViewport && !wasCompactViewportRef.current) {
      useChatStore.setState({ sidebarCollapsed: true });
    }
    wasCompactViewportRef.current = compactViewport;
  }, [compactViewport]);

  // Re-fetch projects when refreshKey changes (useProjects does the initial load)
  useEffect(() => {
    if (refreshKey === 0) return;
    void refreshProjects();
  }, [refreshKey, refreshProjects]);

  // Fetch conversations for expanded projects and the active top workbench
  // project (re-fetch on refreshKey).
  useEffect(() => {
    const projectIdsToLoad = new Set(expandedProjectIds);
    if (activeProjectId) {
      projectIdsToLoad.add(activeProjectId);
    }
    for (const projectId of Array.from(projectIdsToLoad)) {
      void loadConversations(projectId);
    }
  }, [activeProjectId, expandedProjectIds, refreshKey, loadConversations]);

  useEffect(() => {
    if (!renameTarget) return;
    const frame = requestAnimationFrame(() => {
      renameInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [renameTarget]);

  function handleConversationClick(convId: string, projectId: string) {
    setActiveConversation(convId, projectId);
    router.push(`/chat/${convId}`);
  }

  async function handleProjectClick(projectId: string, knownConversationCount?: number) {
    const store = useChatStore.getState();
    const wasExpanded = store.expandedProjectIds.has(projectId);
    const cachedConversations = projectConversations[projectId];
    const conversationCount = knownConversationCount ?? cachedConversations?.length;

    if (conversationCount === 0) {
      if (wasExpanded && store.activeProjectId === projectId) {
        store.toggleProjectExpanded(projectId);
        return;
      }
      if (!wasExpanded) {
        store.toggleProjectExpanded(projectId);
      }
      setActiveConversation(null, projectId);
      router.push(`/chat?projectId=${encodeURIComponent(projectId)}`);
      return;
    }

    if (wasExpanded) {
      store.toggleProjectExpanded(projectId);
      return;
    }

    if (!wasExpanded) {
      store.toggleProjectExpanded(projectId);
    }

    if (cachedConversations?.length) {
      handleConversationClick(cachedConversations[0].conversation_id, projectId);
      return;
    }

    setActiveConversation(null, projectId);
    const loadedConversations = await loadConversations(projectId);
    if (loadedConversations.length > 0) {
      handleConversationClick(loadedConversations[0].conversation_id, projectId);
    }
  }

  const openNewProjectDialog = useCallback(() => {
    setNewProjectName('');
    setNewProjectError(null);
    setNewProjectDialogOpen(true);
  }, []);

  const handleNewProjectDialogOpenChange = useCallback(
    (open: boolean) => {
      if (isCreatingProject) return;
      setNewProjectDialogOpen(open);
      if (!open) {
        setNewProjectName('');
        setNewProjectError(null);
      }
    },
    [isCreatingProject]
  );

  async function handleCreateProject(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (isCreatingProject) return;

    const name = newProjectName.trim() || DEFAULT_PROJECT_NAME;
    setIsCreatingProject(true);
    setNewProjectError(null);

    try {
      const project = await createProject(name);
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
      setNewProjectDialogOpen(false);
      setNewProjectName('');
      router.push(`/chat?projectId=${encodeURIComponent(project.project_id)}`);
    } catch {
      setNewProjectError('Failed to create project');
    } finally {
      setIsCreatingProject(false);
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

  function expandSidebarFromRail() {
    if (collapsed && !compactViewport) {
      useChatStore.setState({ sidebarCollapsed: false });
    }
  }

  function handleChatTabClick() {
    expandSidebarFromRail();
    if (activeConversationId) {
      router.push(`/chat/${activeConversationId}`);
      return;
    }
    if (activeProjectId) {
      router.push(`/chat?projectId=${encodeURIComponent(activeProjectId)}`);
      return;
    }
    router.push('/chat');
  }

  function handleCanvasTabClick() {
    expandSidebarFromRail();
    if (!currentProjectId) return;
    handleCanvasClick(currentProjectId);
  }

  function handleLeafTabClick() {
    expandSidebarFromRail();
    const firstLeaf = currentProjectLeaves[0];
    if (!currentProjectId || !firstLeaf) return;
    router.push(`/project/${currentProjectId}/leaf/${firstLeaf.id}`);
  }

  function handleNewChatClick() {
    if (activeProjectId) {
      void handleNewChatInProject(activeProjectId);
      return;
    }
    setActiveConversation(null, null);
    router.push('/chat');
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

  const openRenameDialog = useCallback((target: RenameTarget) => {
    setRenameTarget(target);
    setRenameValue(target.currentName);
    setRenameError(null);
  }, []);

  const handleRenameDialogOpenChange = useCallback(
    (open: boolean) => {
      if (isRenaming) return;
      if (!open) {
        setRenameTarget(null);
        setRenameValue('');
        setRenameError(null);
      }
    },
    [isRenaming]
  );

  async function handleRenameSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!renameTarget || isRenaming) return;

    const nextName = renameValue.trim();
    if (!nextName) {
      setRenameError('Name is required');
      return;
    }
    if (nextName === renameTarget.currentName.trim()) {
      handleRenameDialogOpenChange(false);
      return;
    }

    setIsRenaming(true);
    setRenameError(null);

    try {
      if (renameTarget.kind === 'project') {
        await renameProject(renameTarget.projectId, nextName);
      } else {
        const conversation = await renameConversation(
          renameTarget.projectId,
          renameTarget.conversationId,
          nextName
        );
        const title = conversation.title ?? nextName;
        if (activeConversationId === renameTarget.conversationId) {
          setConversationTitle(title);
          setCommitConversationTitle(title);
        }
      }
      setRenameTarget(null);
      setRenameValue('');
    } catch {
      setRenameError(
        renameTarget.kind === 'project'
          ? 'Failed to rename project'
          : 'Failed to rename conversation'
      );
    } finally {
      setIsRenaming(false);
    }
  }

  function handleProjectContextMenu(e: React.MouseEvent, projectId: string) {
    const project = projects.find((item) => item.project_id === projectId);
    const projectName = project?.name?.trim() || DEFAULT_PROJECT_NAME;

    openMenu(e, [
      {
        label: 'Rename',
        icon: <Pencil className="h-3.5 w-3.5" />,
        onClick: () =>
          openRenameDialog({
            kind: 'project',
            projectId,
            currentName: projectName,
          }),
      },
      {
        label: 'Delete Project',
        icon: <Trash2 className="h-3.5 w-3.5" />,
        danger: true,
        onClick: () => handleDeleteProject(projectId),
      },
    ]);
  }

  function handleConversationContextMenu(e: React.MouseEvent, projectId: string, convId: string) {
    const conversation = (projectConversations[projectId] ?? []).find(
      (item) => item.conversation_id === convId
    );
    const conversationName = conversation?.title?.trim() || 'Untitled Conversation';

    openMenu(e, [
      {
        label: 'Rename',
        icon: <Pencil className="h-3.5 w-3.5" />,
        onClick: () =>
          openRenameDialog({
            kind: 'conversation',
            projectId,
            conversationId: convId,
            currentName: conversationName,
          }),
      },
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
          'fixed left-0 top-0 z-40 flex h-screen flex-col overflow-hidden border-r border-[var(--stroke-default)] bg-[var(--sidebar-panel)] backdrop-blur-[var(--fx-blur-panel)]',
          !sidebarResizing &&
            'transition-[width] duration-[var(--motion-slow)] ease-[var(--ease-out-soft)]',
          glass.highlight,
          collapsed ? 'items-center' : ''
        )}
        style={sidebarStyle}
      >
        <div className={cn('flex h-14 shrink-0 items-center px-3', collapsed && 'justify-center')}>
          <button
            type="button"
            onClick={handleChatTabClick}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-opacity hover:opacity-80"
            aria-label="T3X chat home"
          >
            <LogoIcon />
          </button>
        </div>

        {collapsed ? (
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1 px-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleChatTabClick}
                  className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--accent-conversation)]/20 bg-[var(--accent-conversation-soft)] text-[var(--accent-conversation)]"
                  aria-label="Chat"
                  aria-current="page"
                >
                  <span
                    aria-hidden="true"
                    className="absolute left-[-8px] h-5 w-[3px] rounded-full bg-[var(--accent-conversation)]"
                  />
                  <MessageSquare className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Chat
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleCanvasTabClick}
                  disabled={!currentProjectId}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--accent-commit)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[var(--text-tertiary)]"
                  aria-label="Canvas"
                >
                  <GitBranch className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Canvas
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleLeafTabClick}
                  disabled={
                    !currentProjectId ||
                    currentProjectLeavesLoading ||
                    currentProjectLeaves.length === 0
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--accent-leaf)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[var(--text-tertiary)]"
                  aria-label="Leaf"
                >
                  <Leaf className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Leaf
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={openNewProjectDialog}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
                  aria-label="New project"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                New Project
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <>
            <div className="px-3 pb-3">
              <div
                className="grid grid-cols-3 gap-0.5 rounded-xl border border-[var(--stroke-divider)] bg-[var(--hover-bg)] p-0.5"
                role="tablist"
                aria-label="Workspace mode"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected="true"
                  aria-current="page"
                  onClick={handleChatTabClick}
                  className="flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg bg-[var(--surface-panel)] px-2 text-[12px] font-semibold text-[var(--text-primary)] shadow-[var(--fx-shadow-sm)]"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-[var(--accent-conversation)]" />
                  <span className="truncate">Chat</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected="false"
                  onClick={handleCanvasTabClick}
                  disabled={!currentProjectId}
                  className="flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-panel)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[var(--text-secondary)]"
                  title={currentProjectId ? 'Canvas' : 'Select a project before opening Canvas'}
                >
                  <GitBranch className="h-3.5 w-3.5 text-[var(--accent-commit)]" />
                  <span className="truncate">Canvas</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected="false"
                  onClick={handleLeafTabClick}
                  disabled={
                    !currentProjectId ||
                    currentProjectLeavesLoading ||
                    currentProjectLeaves.length === 0
                  }
                  className="flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-panel)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[var(--text-secondary)]"
                  title={
                    currentProjectId && currentProjectLeaves.length > 0
                      ? 'Leaf'
                      : 'Select a project with leaves before opening Leaf'
                  }
                >
                  <Leaf className="h-3.5 w-3.5 text-[var(--accent-leaf)]" />
                  <span className="truncate">Leaf</span>
                </button>
              </div>
            </div>

            <div className="px-3 pb-2">
              <Button
                variant="ghost"
                onClick={handleNewChatClick}
                className="h-10 w-full justify-between rounded-lg bg-[var(--hover-bg-strong)] px-3 text-[13px] font-semibold text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
                aria-label="New chat"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Plus className="h-4 w-4 shrink-0" />
                  <span className="truncate">New chat</span>
                </span>
                <span className="text-[11px] font-medium text-[var(--text-tertiary)]">⌘N</span>
              </Button>
            </div>

            {/* Scrollable content: Projects + recent chats */}
            <ScrollArea className="sidebar-scrollarea min-h-0 min-w-0 flex-1 w-full">
              <div
                className="flex min-w-0 flex-col gap-2 pb-4 pt-0"
                style={{
                  width: 'var(--chat-sidebar-visible-width)',
                  maxWidth: 'var(--chat-sidebar-visible-width)',
                }}
              >
                <div className="px-3">
                  <div className="flex items-center justify-between px-1 pb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Projects
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={openNewProjectDialog}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
                          aria-label="New project"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={8}>
                        New Project
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {projects.map((project) => (
                  <ProjectFolder
                    key={project.project_id}
                    project={project}
                    conversations={projectConversations[project.project_id] ?? []}
                    isExpanded={expandedProjectIds.has(project.project_id)}
                    isActive={activeProjectId === project.project_id}
                    activeConversationId={activeConversationId}
                    collapsed={false}
                    onToggleExpand={() =>
                      void handleProjectClick(project.project_id, project.conversations_count)
                    }
                    onConversationClick={(convId) =>
                      handleConversationClick(convId, project.project_id)
                    }
                    onNewChat={(pid) => handleNewChatInProject(pid)}
                    onProjectContextMenu={(e) => handleProjectContextMenu(e, project.project_id)}
                    onConversationContextMenu={(e, convId) =>
                      handleConversationContextMenu(e, project.project_id, convId)
                    }
                  />
                ))}

                {projects.length === 0 && (
                  <div className="px-4 py-4 text-center">
                    <span className="text-xs text-[var(--text-tertiary)]">No projects yet</span>
                  </div>
                )}

                {recentConversations.length > 0 && (
                  <div className="mt-3 px-3">
                    <div className="px-1 pb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                        Recents
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      {recentConversations.map((conversation) => {
                        const isActive = activeConversationId === conversation.conversationId;
                        return (
                          <button
                            key={`${conversation.projectId}:${conversation.conversationId}`}
                            type="button"
                            onClick={() =>
                              handleConversationClick(
                                conversation.conversationId,
                                conversation.projectId
                              )
                            }
                            className={cn(
                              'grid min-h-[38px] min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors',
                              isActive
                                ? 'border-[var(--accent-conversation)]/20 bg-[var(--accent-conversation-soft)] text-[var(--text-primary)]'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
                            )}
                          >
                            <MessageSquare
                              className={cn(
                                'h-4 w-4 shrink-0',
                                isActive
                                  ? 'text-[var(--accent-conversation)]'
                                  : 'text-[var(--text-tertiary)]'
                              )}
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-[12px] font-medium leading-4">
                                {conversation.title}
                              </span>
                              <span className="block truncate text-[10px] leading-3 text-[var(--text-tertiary)]">
                                {conversation.projectName}
                              </span>
                            </span>
                            {isActive && (
                              <span className="h-2 w-2 rounded-full bg-[var(--accent-conversation)]" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}

        <div
          className={cn(
            'mt-auto flex min-w-0 flex-col gap-1 py-2.5',
            collapsed ? 'items-center px-2' : 'px-2.5'
          )}
        >
          <UserMenu collapsed={collapsed} />
        </div>
      </aside>

      {!collapsed && !compactViewport && (
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

      <Dialog open={Boolean(renameTarget)} onOpenChange={handleRenameDialogOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <form onSubmit={handleRenameSubmit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>
                Rename {renameTarget?.kind === 'project' ? 'Project' : 'Conversation'}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Update the selected {renameTarget?.kind ?? 'item'} name.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <label
                htmlFor="rename-name"
                className="text-sm font-medium text-[var(--text-primary)]"
              >
                Name
              </label>
              <Input
                id="rename-name"
                ref={renameInputRef}
                value={renameValue}
                onChange={(event) => {
                  setRenameValue(event.target.value);
                  if (renameError) setRenameError(null);
                }}
                placeholder={
                  renameTarget?.kind === 'conversation'
                    ? 'Untitled Conversation'
                    : DEFAULT_PROJECT_NAME
                }
                disabled={isRenaming}
                aria-invalid={renameError ? 'true' : undefined}
                aria-describedby={renameError ? 'rename-error' : undefined}
              />
              {renameError && (
                <p id="rename-error" className="text-xs text-[var(--status-error)]">
                  {renameError}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleRenameDialogOpenChange(false)}
                disabled={isRenaming}
              >
                Cancel
              </Button>
              <Button type="submit" variant="commit" disabled={isRenaming || !renameValue.trim()}>
                {isRenaming ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={newProjectDialogOpen} onOpenChange={handleNewProjectDialogOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <form onSubmit={handleCreateProject} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>New Project</DialogTitle>
              <DialogDescription className="sr-only">
                Enter a project name or leave it blank to create an untitled workspace.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <label
                htmlFor="new-project-name"
                className="text-sm font-medium text-[var(--text-primary)]"
              >
                Project name
              </label>
              <Input
                id="new-project-name"
                autoFocus
                value={newProjectName}
                onChange={(event) => {
                  setNewProjectName(event.target.value);
                  if (newProjectError) setNewProjectError(null);
                }}
                placeholder={DEFAULT_PROJECT_NAME}
                disabled={isCreatingProject}
                aria-invalid={newProjectError ? 'true' : undefined}
                aria-describedby={newProjectError ? 'new-project-error' : undefined}
              />
              {newProjectError && (
                <p id="new-project-error" className="text-xs text-[var(--status-error)]">
                  {newProjectError}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleNewProjectDialogOpenChange(false)}
                disabled={isCreatingProject}
              >
                Cancel
              </Button>
              <Button type="submit" variant="commit" disabled={isCreatingProject}>
                {isCreatingProject ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
