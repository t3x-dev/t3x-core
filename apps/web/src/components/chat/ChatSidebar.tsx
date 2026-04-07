'use client';

import { ChevronLeft, ChevronRight, Plus, Settings, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { UserMenu } from '@/components/layout/UserMenu';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { deleteConversation, listConversations } from '@/lib/api/conversations';
import { deleteProject, listProjects } from '@/lib/api/projects';
import type { Conversation, Project } from '@/lib/api/types';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chatStore';
import { ContextMenuPortal, useContextMenu } from './sidebar/ContextMenu';
import { LogoIcon } from './sidebar/LogoIcon';
import { ProjectFolder } from './sidebar/ProjectFolder';

// ── Main Sidebar ──

export function ChatSidebar() {
  const router = useRouter();
  const pathname = usePathname();

  const {
    sidebarCollapsed: collapsed,
    toggleSidebar,
    activeConversationId,
    expandedProjectIds,
    toggleProjectExpanded,
    setActiveConversation,
  } = useChatStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectConversations, setProjectConversations] = useState<Record<string, Conversation[]>>(
    {}
  );

  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const refreshKey = useChatStore((s) => s.refreshKey);

  // Fetch projects on mount and when refreshKey changes
  useEffect(() => {
    listProjects(50, 0)
      .then((data) => setProjects(data.projects))
      .catch(() => {
        // silently fail — sidebar is non-critical
      });
  }, [refreshKey]);

  // Fetch conversations for expanded projects (re-fetch on refreshKey)
  useEffect(() => {
    for (const projectId of Array.from(expandedProjectIds)) {
      listConversations(projectId, 50, 0)
        .then((data) => {
          setProjectConversations((prev) => ({
            ...prev,
            [projectId]: data.conversations,
          }));
        })
        .catch(() => {
          // silently fail
        });
    }
  }, [expandedProjectIds, refreshKey]);

  const isSettings = pathname.startsWith('/settings');

  function handleConversationClick(convId: string, projectId: string) {
    setActiveConversation(convId, projectId);
    router.push(`/chat/${convId}`);
  }

  function handleNewChat() {
    router.push('/chat');
  }

  function handleCanvasClick(projectId: string) {
    router.push(`/project/${projectId}`);
  }

  async function handleDeleteProject(projectId: string) {
    if (!window.confirm('Are you sure you want to delete this project? This cannot be undone.')) {
      return;
    }
    try {
      await deleteProject(projectId);
      window.location.reload();
    } catch {
      // silently fail
    }
  }

  async function handleDeleteConversation(_projectId: string, convId: string) {
    if (!window.confirm('Are you sure you want to delete this conversation?')) {
      return;
    }
    try {
      await deleteConversation(convId);
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
          'fixed left-0 top-0 z-40 flex h-screen flex-col border-r py-4',
          'transition-[width] duration-[var(--motion-slow)] ease-[var(--ease-out-soft)]',
          glass.panelBase,
          glass.highlight,
          collapsed ? 'w-16 items-center' : 'w-52 px-3'
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            'mb-4 flex h-10 shrink-0 items-center',
            collapsed ? 'justify-center' : 'px-1'
          )}
        >
          <LogoIcon />
          {!collapsed && (
            <span className="ml-3 text-sm font-semibold text-[var(--text-primary)] truncate">
              T3X
            </span>
          )}
        </div>

        {/* + New Chat button */}
        <div className={cn('mb-3', collapsed ? 'flex justify-center' : '')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                onClick={handleNewChat}
                className={cn(
                  'rounded-xl bg-[var(--accent-commit)]/10 ring-1 ring-[var(--accent-commit)]/30',
                  'text-[var(--accent-commit)] hover:bg-[var(--accent-commit)]/20 hover:text-[var(--accent-commit)]',
                  'transition-all duration-[var(--motion-base)]',
                  collapsed ? 'h-10 w-10' : 'h-10 w-full justify-start gap-2 px-3'
                )}
                aria-label="New chat"
              >
                <Plus className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="text-sm font-medium">New Chat</span>}
              </Button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" sideOffset={8}>
                New Chat
              </TooltipContent>
            )}
          </Tooltip>
        </div>

        {/* Scrollable content: Projects + conversations */}
        <ScrollArea className="flex-1 w-full">
          <div className={cn('flex flex-col gap-0.5', collapsed ? 'items-center' : '')}>
            {/* Projects section header */}
            {!collapsed && projects.length > 0 && (
              <div className="px-1 pt-2 pb-1">
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
                activeConversationId={activeConversationId}
                collapsed={collapsed}
                onToggleExpand={() => {
                  toggleProjectExpanded(project.project_id);
                }}
                onConversationClick={(convId) =>
                  handleConversationClick(convId, project.project_id)
                }
                onCanvasClick={() => handleCanvasClick(project.project_id)}
                onProjectContextMenu={(e) => handleProjectContextMenu(e, project.project_id)}
                onConversationContextMenu={(e, convId) =>
                  handleConversationContextMenu(e, project.project_id, convId)
                }
              />
            ))}

            {projects.length === 0 && !collapsed && (
              <div className="px-3 py-4 text-center">
                <span className="text-xs text-[var(--text-tertiary)]">No projects yet</span>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Bottom section */}
        <div
          className={cn(
            'mt-auto flex flex-col gap-1 pt-3 border-t border-[var(--stroke-divider)]',
            collapsed ? 'items-center' : ''
          )}
        >
          {/* User Menu */}
          <UserMenu collapsed={collapsed} />

          {/* Settings */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/settings"
                className={cn(
                  'flex items-center gap-3 rounded-xl transition-all duration-[var(--motion-base)] ease-[var(--ease-out-soft)]',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]/50',
                  'active:scale-95',
                  collapsed ? 'h-10 w-10 justify-center' : 'h-10 w-full px-3',
                  isSettings
                    ? 'border-l-2 border-[var(--accent-commit)] bg-[var(--hover-bg-strong)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
                )}
              >
                <Settings className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="text-sm font-medium">Settings</span>}
              </Link>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" sideOffset={8}>
                Settings
              </TooltipContent>
            )}
          </Tooltip>

          {/* Collapse toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className={cn(
                  'h-8 w-8 rounded-lg text-[var(--text-tertiary)]',
                  'hover:text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]',
                  'transition-all duration-[var(--motion-base)]'
                )}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {collapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" sideOffset={8}>
                Expand sidebar
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>

      {/* Context menu portal */}
      {menu && <ContextMenuPortal menu={menu} onClose={closeMenu} />}
    </TooltipProvider>
  );
}
