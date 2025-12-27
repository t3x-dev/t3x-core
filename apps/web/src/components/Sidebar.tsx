'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, BarChart3, FileText, Github, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// T3X Logo - Two obtuse angles facing each other (bowtie shape)
function LogoIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGradientLeft" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <linearGradient id="logoGradientRight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>
      {/* Left angle > pointing right */}
      <path
        d="M4 6L14 16L4 26"
        stroke="url(#logoGradientLeft)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Right angle < pointing left */}
      <path
        d="M28 6L18 16L28 26"
        stroke="url(#logoGradientRight)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
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
      <path
        d="M12 6V3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="2" r="1.5" fill="currentColor" />
      {/* Left eye */}
      <circle cx="9" cy="11" r="1.5" fill="currentColor" />
      {/* Right eye */}
      <circle cx="15" cy="11" r="1.5" fill="currentColor" />
      {/* Mouth */}
      <path
        d="M9 15h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Ears */}
      <path
        d="M4 10H2M22 10h-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
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
          <button
            className={cn(navItemClass, 'cursor-not-allowed opacity-50')}
            disabled
          >
            {children}
          </button>
        ) : (
          <Link
            href={href}
            className={isActive ? navItemActiveClass : navItemClass}
          >
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
      <aside className="flex h-screen w-16 flex-col items-center border-r border-border/50 bg-gradient-to-b from-background to-muted/30 py-4 shadow-[1px_0_3px_rgba(0,0,0,0.02)]">
        {/* Logo */}
        <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-background to-muted/50 shadow-sm ring-1 ring-border/50">
          <LogoIcon />
        </div>

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

          <NavItem href="https://github.com/anthropics/t3x" label="GitHub" isActive={false} external>
            <Github className="h-5 w-5" />
          </NavItem>
        </nav>
      </aside>
    </TooltipProvider>
  );
}
