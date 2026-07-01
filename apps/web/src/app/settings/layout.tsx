'use client';

import {
  Activity,
  ArrowLeft,
  Blocks,
  GitBranch,
  KeyRound,
  LogOut,
  type LucideIcon,
  Settings,
  SlidersHorizontal,
  User,
  Webhook,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from '@/hooks/shared/useSession';
import { cn } from '@/utils/cn';

interface SettingsNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
  note?: string;
}

const NAV_GROUPS: SettingsNavGroup[] = [
  {
    label: 'OVERVIEW',
    items: [{ href: '/settings', label: 'Overview', icon: Activity, exact: true }],
  },
  {
    label: 'LOCAL',
    items: [
      { href: '/settings/profile', label: 'Profile', icon: User },
      { href: '/settings/preferences', label: 'Preferences', icon: SlidersHorizontal },
    ],
  },
  {
    label: 'AI',
    items: [{ href: '/settings/providers', label: 'Providers', icon: Blocks }],
  },
  {
    label: 'ACCESS',
    items: [{ href: '/settings/access', label: 'API / CLI / MCP', icon: KeyRound }],
  },
  {
    label: 'AUTOMATION',
    items: [
      { href: '/settings/webhooks', label: 'Webhooks', icon: Webhook },
      { href: '/settings/recipes', label: 'Recipes', icon: Blocks },
    ],
  },
  {
    label: 'PROJECT',
    note: 'Project overrides are edited from each project.',
    items: [],
  },
];

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const pathname = usePathname();
  const currentPath = pathname ?? '';
  const { clear, getKey } = useSession();
  const [isAuthEnabled, setIsAuthEnabled] = useState(false);

  useEffect(() => {
    setIsAuthEnabled(!!getKey());
  }, [getKey]);

  return (
    <div className="flex h-full bg-[var(--surface-app)]">
      <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--stroke-divider)] px-3 py-5">
        <div className="mb-3 px-1">
          <Link
            href="/chat"
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium',
              'text-[var(--text-secondary)] transition-colors duration-150',
              'hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
            )}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span>Back to workspace</span>
          </Link>
        </div>
        <div className="mb-5 flex items-center gap-2 px-3">
          <Settings className="h-5 w-5 text-[var(--text-primary)]" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Settings</h2>
        </div>
        <nav className="flex flex-1 flex-col gap-4">
          {NAV_GROUPS.map((group) => (
            <section key={group.label} className="space-y-1">
              <div className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                {group.label}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isExact = 'exact' in item && item.exact;
                const isActive = isExact
                  ? currentPath === item.href
                  : currentPath === item.href || currentPath.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium',
                      'transition-colors duration-150',
                      isActive
                        ? 'bg-[var(--hover-bg-strong)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
              {group.note && (
                <p className="rounded-lg px-3 py-2 text-[11px] leading-5 text-[var(--text-tertiary)]">
                  <GitBranch className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
                  {group.note}
                </p>
              )}
            </section>
          ))}
        </nav>

        {isAuthEnabled && (
          <div className="mt-4 border-t border-[var(--stroke-divider)] pt-3">
            <button
              type="button"
              onClick={() => clear()}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors duration-150"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        )}
      </aside>

      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
