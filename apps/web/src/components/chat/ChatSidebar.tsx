'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
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
import { useNewProjectChat } from '@/hooks/conversations/useNewProjectChat';
import { useProjectConversations } from '@/hooks/conversations/useProjectConversations';
import { useProjects } from '@/hooks/projects/useProjects';
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
    toggleProjectExpanded,
    setActiveConversation,
    setConversationTitle,
    sidebarWidth,
    setSidebarWidth,
    setSidebarResizing,
  } = useChatStore();
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

    const name = newProjectName.trim() || 'Untitled Project';
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
    const projectName = project?.name?.trim() || 'Untitled Project';

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
          'fixed left-0 top-0 z-40 flex h-screen flex-col overflow-hidden border-r border-[var(--stroke-default)] bg-[var(--panel)] backdrop-blur-[var(--fx-blur-panel)]',
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
            'flex h-11 shrink-0 items-center border-b border-[var(--stroke-divider)]',
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

        {/* New Project action */}
        <div className={cn('pb-2 pt-3', collapsed ? 'flex justify-center px-2' : 'px-3')}>
          <div className="flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  onClick={openNewProjectDialog}
                  className={cn(
                    'rounded-lg border border-transparent bg-transparent p-0 text-[var(--text-secondary)]',
                    'hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]',
                    'focus-visible:ring-1 focus-visible:ring-[var(--accent-commit)]/30',
                    'transition-all duration-[var(--motion-base)]',
                    collapsed
                      ? 'h-9 w-9'
                      : 'h-8 w-full justify-start gap-2 px-2 text-xs font-medium'
                  )}
                  aria-label="New project"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">New Project</span>}
                </Button>
              </TooltipTrigger>
              <TooltipContent side={collapsed ? 'right' : 'top'} sideOffset={8}>
                New Project
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Scrollable content: Projects + conversations */}
        <ScrollArea className="sidebar-scrollarea min-h-0 min-w-0 flex-1 w-full">
          <div
            className={cn(
              'flex min-w-0 flex-col gap-1 pb-2 pt-1',
              collapsed ? 'items-center px-2' : 'px-0'
            )}
          >
            {/* Projects section header */}
            {!collapsed && projects.length > 0 && (
              <div className="px-4 pb-0.5 pt-2">
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
            'mt-auto flex min-w-0 flex-col gap-1 border-t border-[var(--stroke-divider)] bg-[var(--surface-panel)]/40 py-2.5',
            collapsed ? 'items-center px-2' : 'px-2.5'
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
                    : 'Untitled Project'
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
                Enter a project name or leave it blank to create an untitled project.
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
                placeholder="Untitled Project"
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
