'use client';

import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Command,
  FileText,
  Github,
  Home,
  LayoutGrid,
  ListChecks,
  Moon,
  Rocket,
  Settings,
  Sun,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';
import { ProjectDraftsSection } from '@/components/ProjectDraftsSection';
import { SettingsToggle } from '@/components/shared/SettingsToggle';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';

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

// Robot/Agent icon
function AgentIcon({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Agent"
    >
      {/* Robot head */}
      <rect
        x="4"
        y="6"
        width="16"
        height="12"
        rx="3"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      {/* Antenna */}
      <path d="M12 6V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="2" r="1.5" fill="currentColor" />
      {/* Left eye */}
      <circle cx="9" cy="11" r="1.5" fill="currentColor" />
      {/* Right eye */}
      <circle cx="15" cy="11" r="1.5" fill="currentColor" />
      {/* Mouth */}
      <path d="M9 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Ears */}
      <path d="M4 10H2M22 10h-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface NavItemProps {
  href: string;
  label: string;
  isActive: boolean;
  children: React.ReactNode;
  external?: boolean;
  disabled?: boolean;
  collapsed: boolean;
}

function NavItem({ href, label, isActive, children, external, disabled, collapsed }: NavItemProps) {
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

  const linkElement = external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {inner}
    </a>
  ) : disabled ? (
    <Button variant="ghost" className={cn(className, 'cursor-not-allowed opacity-50')} disabled>
      {inner}
    </Button>
  ) : (
    <Link href={href} className={className}>
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

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isAgentDemo = pathname.startsWith('/agent-demo');
  const isDeploy = pathname.startsWith('/deploy');
  const isInsights = pathname.startsWith('/insights');
  const isTemplates = pathname.startsWith('/templates');
  const isSettings = pathname.startsWith('/settings');
  const isHome = pathname === '/' || pathname.startsWith('/project');

  // Extract projectId from pathname for project-aware sections
  const projectId = useMemo(() => {
    const match = pathname.match(/^\/project\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
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
            'mb-6 flex h-10 shrink-0 items-center',
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

        {/* Command Palette Button */}
        <div className={cn('mb-[var(--space-group)]', collapsed ? 'flex justify-center' : '')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                onClick={() => {
                  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
                }}
                className={cn(
                  'rounded-xl bg-[var(--hover-bg)] ring-1 ring-[var(--stroke-default)]',
                  'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg-strong)]',
                  'transition-all duration-[var(--motion-base)]',
                  collapsed ? 'h-10 w-10' : 'h-10 w-full justify-start gap-3 px-3'
                )}
                aria-label="Open command palette"
              >
                <Command className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="text-xs">Search...</span>}
                {!collapsed && <Kbd className="ml-auto">⌘K</Kbd>}
              </Button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" sideOffset={8} className="flex items-center gap-2">
                <span>Command Palette</span>
                <Kbd>⌘K</Kbd>
              </TooltipContent>
            )}
          </Tooltip>
        </div>

        {/* Main Navigation */}
        <nav className={cn('flex flex-1 flex-col gap-1', collapsed ? 'items-center' : '')}>
          <NavItem href="/" label="Projects" isActive={isHome} collapsed={collapsed}>
            <Home className="h-5 w-5" />
          </NavItem>

          <NavItem href="/templates" label="Templates" isActive={isTemplates} collapsed={collapsed}>
            <LayoutGrid className="h-5 w-5" />
          </NavItem>

          <NavItem
            href="/agent-demo/chat"
            label="Agent Demo"
            isActive={isAgentDemo}
            collapsed={collapsed}
          >
            <AgentIcon />
          </NavItem>

          {process.env.NEXT_PUBLIC_RUNNER_ENABLED === 'true' && (
            <NavItem href="/deploy" label="Deploy & Eval" isActive={isDeploy} collapsed={collapsed}>
              <Rocket className="h-5 w-5" />
            </NavItem>
          )}
        </nav>

        {/* Project Drafts Section */}
        {projectId && (
          <div
            className={cn(
              'border-t border-[var(--stroke-divider)] py-2',
              collapsed ? 'flex justify-center' : ''
            )}
          >
            <ProjectDraftsSection projectId={projectId} collapsed={collapsed} />
          </div>
        )}

        {/* Bottom Navigation */}
        <nav className={cn('flex flex-col gap-1', collapsed ? 'items-center' : '')}>
          {/* QuickStart Checklist Reopen */}
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('t3x-quickstart-dismissed');
                    window.dispatchEvent(new Event('t3x-quickstart-reopen'));
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-xl transition-all duration-[var(--motion-base)] ease-[var(--ease-out-soft)]',
                    'h-10 w-10 justify-center',
                    'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
                  )}
                >
                  <ListChecks className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Quick Start Checklist
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem('t3x-quickstart-dismissed');
                window.dispatchEvent(new Event('t3x-quickstart-reopen'));
              }}
              className={cn(
                'flex items-center gap-3 rounded-xl transition-all duration-[var(--motion-base)] ease-[var(--ease-out-soft)]',
                'h-10 w-full px-3',
                'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
              )}
            >
              <span className="shrink-0">
                <ListChecks className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium truncate">Quick Start</span>
            </button>
          )}

          <NavItem href="/insights" label="Insights" isActive={isInsights} collapsed={collapsed}>
            <BarChart3 className="h-5 w-5" />
          </NavItem>

          <NavItem href="/settings" label="Settings" isActive={isSettings} collapsed={collapsed}>
            <Settings className="h-5 w-5" />
          </NavItem>

          <NavItem
            href="#"
            label="Docs (Coming Soon)"
            isActive={false}
            collapsed={collapsed}
            disabled
          >
            <FileText className="h-5 w-5" />
          </NavItem>

          <NavItem
            href="https://github.com/anthropics/t3x"
            label="GitHub"
            isActive={false}
            collapsed={collapsed}
            external
          >
            <Github className="h-5 w-5" />
          </NavItem>

          {/* Developer Mode Toggle */}
          <SettingsToggle collapsed={collapsed} />

          {/* Theme Toggle — use mounted guard to avoid SSR hydration mismatch */}
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                  className={cn(
                    'flex items-center gap-3 rounded-xl transition-all duration-[var(--motion-base)] ease-[var(--ease-out-soft)]',
                    'h-10 w-10 justify-center',
                    'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
                  )}
                  aria-label={
                    mounted
                      ? resolvedTheme === 'dark'
                        ? 'Switch to light mode'
                        : 'Switch to dark mode'
                      : 'Toggle theme'
                  }
                >
                  {mounted && resolvedTheme === 'dark' ? (
                    <Sun className="h-5 w-5" />
                  ) : (
                    <Moon className="h-5 w-5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {mounted && resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className={cn(
                'flex items-center gap-3 rounded-xl transition-all duration-[var(--motion-base)] ease-[var(--ease-out-soft)]',
                'h-10 w-full px-3',
                'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
              )}
              aria-label={
                mounted
                  ? resolvedTheme === 'dark'
                    ? 'Switch to light mode'
                    : 'Switch to dark mode'
                  : 'Toggle theme'
              }
            >
              <span className="shrink-0">
                {mounted && resolvedTheme === 'dark' ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </span>
              <span className="text-sm font-medium truncate">
                {mounted && resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </span>
            </button>
          )}
        </nav>

        {/* Collapse Toggle */}
        <div
          className={cn(
            'mt-3 pt-3 border-t border-[var(--stroke-divider)]',
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
