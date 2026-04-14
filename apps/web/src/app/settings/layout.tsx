'use client';

import {
  Blocks,
  LogOut,
  Settings,
  SlidersHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearSession, getSessionKey } from '@/infrastructure/session';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/settings/preferences', label: 'Preferences', icon: SlidersHorizontal },
  { href: '/settings/providers', label: 'Providers', icon: Blocks },
] as const;

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const pathname = usePathname();
  const [isAuthEnabled, setIsAuthEnabled] = useState(false);

  useEffect(() => {
    setIsAuthEnabled(!!getSessionKey());
  }, []);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-48 shrink-0 border-r border-[var(--stroke-divider)] py-6 px-3 flex flex-col">
        <div className="flex items-center gap-2 px-3 mb-6">
          <Settings className="h-5 w-5 text-[var(--text-primary)]" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Settings</h2>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium',
                  'transition-colors duration-150',
                  isActive
                    ? 'bg-[var(--hover-bg-strong)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Sign Out — only shown when user is authenticated */}
        {isAuthEnabled && (
          <div className="border-t border-[var(--stroke-divider)] pt-3 mt-4">
            <button
              type="button"
              onClick={() => clearSession()}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors duration-150"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
