'use client';

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { deleteConversation, listConversations } from '@/lib/api/conversations';
import { deleteProject, listProjects } from '@/lib/api/projects';
import type { Conversation, Project } from '@/lib/api/types';
import { glass } from '@/lib/theme';
import { formatTimeAgo } from '@/lib/timeUtils';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chatStore';

// ── Right-click Context Menu (portal-based, never intercepts left click) ──

interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const open = useCallback((e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, []);

  const close = useCallback(() => setMenu(null), []);

  return { menu, open, close };
}

function ContextMenuPortal({ menu, onClose }: { menu: ContextMenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[100] min-w-[140px] rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-panel)] p-1 shadow-lg"
      style={{ left: menu.x, top: menu.y }}
    >
      {menu.items.map((item) => (
        <button
          key={item.label}
          type="button"
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
            item.danger
              ? 'text-red-500 hover:bg-red-500/10'
              : 'text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'
          )}
          onClick={() => {
            onClose();
            item.onClick();
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
}

// ── T3X Logo ──

function LogoIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="T3X Logo"
    >
      <defs>
        <radialGradient id="chatLogoGradient" cx="32" cy="32" r="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="12%" stopColor="#2563EB" />
          <stop offset="40%" stopColor="#FB923C" />
          <stop offset="100%" stopColor="#FFE2C6" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#020617" />
      <g
        fill="none"
        stroke="url(#chatLogoGradient)"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 18 L32 28 L48 18" />
        <path d="M16 46 L32 36 L48 46" />
      </g>
    </svg>
  );
}

// ── Conversation Item ──

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function ConversationItem({
  conversation,
  isActive,
  collapsed,
  onClick,
  onContextMenu,
}: ConversationItemProps) {
  const title = conversation.title ?? conversation.conversation_id.slice(0, 40);
  const timeAgo = formatTimeAgo(conversation.created_at);

  const baseClass = cn(
    'flex items-center gap-2 rounded-xl transition-all duration-[var(--motion-base)] ease-[var(--ease-out-soft)]',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]/50',
    'active:scale-95 cursor-pointer w-full text-left',
    collapsed ? 'h-10 w-10 justify-center' : 'h-9 px-3'
  );

  const activeClass = cn(
    baseClass,
    'border-l-2 border-[var(--accent-commit)] bg-[var(--hover-bg-strong)] text-[var(--text-primary)]'
  );

  const inactiveClass = cn(
    baseClass,
    'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
  );

  const inner = collapsed ? (
    <MessageSquare className="h-4 w-4 shrink-0" />
  ) : (
    <>
      <MessageSquare className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
      <span className="text-xs font-medium truncate flex-1">{title}</span>
      <span className="text-[10px] text-[var(--text-tertiary)] shrink-0 ml-auto">{timeAgo}</span>
    </>
  );

  const button = (
    <button
      type="button"
      className={isActive ? activeClass : inactiveClass}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {inner}
    </button>
  );

  if (!collapsed) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {title}
      </TooltipContent>
    </Tooltip>
  );
}

// ── Project Folder ──

interface ProjectFolderProps {
  project: Project;
  conversations: Conversation[];
  isExpanded: boolean;
  activeConversationId: string | null;
  collapsed: boolean;
  onToggleExpand: () => void;
  onConversationClick: (convId: string) => void;
  onCanvasClick: () => void;
  onProjectContextMenu: (e: React.MouseEvent) => void;
  onConversationContextMenu: (e: React.MouseEvent, convId: string) => void;
}

function ProjectFolder({
  project,
  conversations,
  isExpanded,
  activeConversationId,
  collapsed,
  onToggleExpand,
  onConversationClick,
  onCanvasClick,
  onProjectContextMenu,
  onConversationContextMenu,
}: ProjectFolderProps) {
  const folderButton = (
    <button
      type="button"
      onClick={onToggleExpand}
      onContextMenu={onProjectContextMenu}
      className={cn(
        'flex items-center gap-2 rounded-xl transition-all duration-[var(--motion-base)] ease-[var(--ease-out-soft)]',
        'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]/50',
        'active:scale-95 cursor-pointer w-full text-left',
        collapsed ? 'h-10 w-10 justify-center' : 'h-9 px-3'
      )}
    >
      <FolderOpen className="h-4 w-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="text-xs font-medium truncate flex-1">{project.name}</span>
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" />
          )}
        </>
      )}
    </button>
  );

  return (
    <div>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{folderButton}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {project.name}
          </TooltipContent>
        </Tooltip>
      ) : (
        folderButton
      )}

      {isExpanded && !collapsed && (
        <div className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l border-[var(--stroke-divider)] pl-2">
          {/* Canvas link */}
          <button
            type="button"
            onClick={onCanvasClick}
            className={cn(
              'flex items-center gap-2 rounded-lg h-8 px-2 w-full text-left',
              'text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)]',
              'transition-all duration-[var(--motion-base)] text-xs'
            )}
          >
            <LayoutDashboard className="h-3 w-3 shrink-0" />
            <span>Canvas</span>
          </button>

          {/* Conversations */}
          {conversations.map((conv) => (
            <ConversationItem
              key={conv.conversation_id}
              conversation={conv}
              isActive={activeConversationId === conv.conversation_id}
              collapsed={false}
              onClick={() => onConversationClick(conv.conversation_id)}
              onContextMenu={(e) => onConversationContextMenu(e, conv.conversation_id)}
            />
          ))}

          {conversations.length === 0 && (
            <span className="text-[10px] text-[var(--text-tertiary)] px-2 py-1">
              No conversations
            </span>
          )}
        </div>
      )}
    </div>
  );
}

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
