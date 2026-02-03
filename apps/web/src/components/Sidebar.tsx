'use client';

import { BarChart3, Command, FileText, Github, Home, Rocket } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// T3X Logo - Bowtie shape with radial gradient (Blue center → Orange outer)
function LogoIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
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

const navItemClass = cn(
  'flex h-10 w-10 items-center justify-center rounded-xl',
  'text-muted-foreground transition-all duration-200',
  'hover:bg-accent hover:text-accent-foreground hover:scale-105',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  'active:scale-95'
);

const navItemActiveClass = cn(
  navItemClass,
  'bg-gradient-to-br from-primary/15 to-primary/5 text-primary',
  'shadow-[0_0_0_1px_rgba(79,70,229,0.1),0_2px_8px_rgba(79,70,229,0.08)]',
  'hover:from-primary/20 hover:to-primary/10 hover:text-primary'
);

interface NavItemProps {
  href: string;
  label: string;
  isActive: boolean;
  children: React.ReactNode;
  external?: boolean;
  disabled?: boolean;
}

function NavItem({ href, label, isActive, children, external, disabled }: NavItemProps) {
  const content = (
    <Tooltip>
      <TooltipTrigger asChild>
        {external ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={isActive ? navItemActiveClass : navItemClass}
          >
            {children}
          </a>
        ) : disabled ? (
          <Button
            variant="ghost"
            className={cn(navItemClass, 'cursor-not-allowed opacity-50')}
            disabled
          >
            {children}
          </Button>
        ) : (
          <Link href={href} className={isActive ? navItemActiveClass : navItemClass}>
            {children}
          </Link>
        )}
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );

  return content;
}

export function Sidebar() {
  const pathname = usePathname();
  const isAgentDemo = pathname.startsWith('/agent-demo');
  const isDeploy = pathname.startsWith('/deploy') || pathname.startsWith('/eval');
  const isInsights = pathname.startsWith('/insights');
  const isHome = pathname === '/' || pathname.startsWith('/project');

  return (
    <TooltipProvider delayDuration={0}>
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-16 flex-col items-center border-r border-border/50 bg-gradient-to-b from-background to-muted/30 py-4 shadow-[1px_0_3px_rgba(0,0,0,0.02)]">
        {/* Logo */}
        <div className="mb-6 flex h-10 w-10 items-center justify-center">
          <LogoIcon />
        </div>

        {/* Command Palette Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              onClick={() => {
                // Simulate Cmd+K keypress to open command palette
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
              }}
              className={cn(navItemClass, 'mb-4 bg-muted/50 ring-1 ring-border/50')}
              aria-label="Open command palette"
            >
              <Command className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="flex items-center gap-2">
            <span>Command Palette</span>
            <Kbd>⌘K</Kbd>
          </TooltipContent>
        </Tooltip>

        {/* Main Navigation */}
        <nav className="flex flex-1 flex-col items-center gap-1.5">
          <NavItem href="/" label="Projects" isActive={isHome}>
            <Home className="h-5 w-5" />
          </NavItem>

          <NavItem href="/agent-demo/chat" label="Agent Demo" isActive={isAgentDemo}>
            <AgentIcon />
          </NavItem>

          <NavItem href="/deploy" label="Deploy & Eval" isActive={isDeploy}>
            <Rocket className="h-5 w-5" />
          </NavItem>
        </nav>

        {/* Bottom Navigation */}
        <nav className="flex flex-col items-center gap-1.5">
          <NavItem href="/insights" label="Insights" isActive={isInsights}>
            <BarChart3 className="h-5 w-5" />
          </NavItem>

          <NavItem href="#" label="Docs (Coming Soon)" isActive={false} disabled>
            <FileText className="h-5 w-5" />
          </NavItem>

          <NavItem
            href="https://github.com/anthropics/t3x"
            label="GitHub"
            isActive={false}
            external
          >
            <Github className="h-5 w-5" />
          </NavItem>
        </nav>
      </aside>
    </TooltipProvider>
  );
}
