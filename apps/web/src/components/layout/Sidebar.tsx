'use client';

import { ChevronLeft, ChevronRight, GitBranch, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCanvasStore } from '@/store/canvasStore';
import { useChatStore } from '@/store/chatStore';
import { cn } from '@/utils/cn';
import { glass } from '@/utils/theme';
import { UserMenu } from './UserMenu';

// T3X Logo - Bowtie shape with radial gradient (Blue center → Orange outer)
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
        <radialGradient id="logoGradient" cx="32" cy="32" r="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="12%" stopColor="#2563EB" />
          <stop offset="40%" stopColor="#FB923C" />
          <stop offset="100%" stopColor="#FFE2C6" />
        </radialGradient>
      </defs>
      {/* Dark rounded background */}
      <rect width="64" height="64" rx="14" fill="#020617" />
      {/* Bowtie strokes */}
      <g
        fill="none"
        stroke="url(#logoGradient)"
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

interface NavItemProps {
  href: string;
  label: string;
  isActive: boolean;
  children: React.ReactNode;
  collapsed: boolean;
}

function NavItem({ href, label, isActive, children, collapsed }: NavItemProps) {
  const baseClass = cn(
    'flex items-center gap-3 rounded-xl transition-all duration-[var(--motion-base)] ease-[var(--ease-out-soft)]',
    collapsed ? 'h-10 w-10 justify-center' : 'h-10 w-full px-3',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]/50',
    'active:scale-95'
  );

  const activeClass = cn(
    baseClass,
    'border-l-2 border-[var(--accent-commit)] bg-[var(--hover-bg-strong)] text-[var(--text-primary)]'
  );

  const inactiveClass = cn(
    baseClass,
    'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
  );

  const className = isActive ? activeClass : inactiveClass;

  const inner = (
    <>
      <span className="shrink-0">{children}</span>
      {!collapsed && <span className="text-sm font-medium truncate">{label}</span>}
    </>
  );

  const linkElement = (
    <Link href={href} className={className} aria-current={isActive ? 'page' : undefined}>
      {inner}
    </Link>
  );

  // In expanded mode, no tooltip needed since label is visible
  if (!collapsed) return linkElement;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{linkElement}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function projectIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/project\/([^/]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const routeProjectId = projectIdFromPathname(pathname);
  const canvasProjectId = useCanvasStore((state) => state.projectId);
  const activeChatProjectId = useChatStore((state) => state.activeProjectId);
  const fallbackProjectId = routeProjectId ?? canvasProjectId ?? activeChatProjectId;
  const canvasHref = fallbackProjectId ? `/project/${encodeURIComponent(fallbackProjectId)}` : '/chat';
  const isChatsActive = pathname === '/' || pathname.startsWith('/chat');
  const isCanvasActive = Boolean(routeProjectId);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        aria-label="Main navigation"
        className={cn(
          'fixed left-0 top-0 z-40 flex h-screen flex-col border-r py-4',
          'transition-[width] duration-[var(--motion-slow)] ease-[var(--ease-out-soft)]',
          glass.panelBase,
          glass.highlight,
          collapsed ? 'w-16 items-center' : 'w-52 px-3'
        )}
      >
        {/* Logo — clickable, goes to Chats */}
        <Link
          href="/chat"
          className={cn(
            'mb-6 flex h-10 shrink-0 items-center hover:opacity-80 transition-opacity',
            collapsed ? 'justify-center' : 'px-1'
          )}
        >
          <LogoIcon />
          {!collapsed && (
            <span className="ml-3 text-sm font-semibold text-[var(--text-primary)] truncate">
              T3X
            </span>
          )}
        </Link>

        {/* Main Navigation */}
        <nav className={cn('flex flex-col gap-1', collapsed ? 'items-center' : '')}>
          <NavItem href="/chat" label="Chats" isActive={isChatsActive} collapsed={collapsed}>
            <MessageSquare className="h-5 w-5" />
          </NavItem>
          <NavItem href={canvasHref} label="Canvas" isActive={isCanvasActive} collapsed={collapsed}>
            <GitBranch className="h-5 w-5" />
          </NavItem>
        </nav>

        {/* User Menu — Settings lives in this dropdown (Profile / Settings / Sign Out) */}
        <div className={cn('mt-auto', collapsed ? 'flex justify-center' : '')}>
          <UserMenu collapsed={collapsed} />
        </div>

        {/* Collapse Toggle */}
        <div
          className={cn(
            'pt-3 border-t border-[var(--stroke-divider)]',
            collapsed ? 'flex justify-center' : ''
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggle}
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
                Expand (⌘\)
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
