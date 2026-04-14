'use client';

/**
 * UserMenu — Avatar + dropdown menu for the sidebar bottom area.
 *
 * Collapsed: circular avatar with first letter of display name.
 * Expanded: avatar + username text.
 * Click: DropdownMenu with My Projects / Settings / Sign Out.
 *
 * Only renders when auth is enabled (AUTH_DISABLED !== 'true').
 * Reads from localStorage on mount, lazy-refreshes from /auth/me in background.
 */

import { Home, LogOut, Settings } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthMe } from '@/hooks/useAuthMe';
import { useSession } from '@/hooks/useSession';
import { cn } from '@/utils/cn';

// ============================================================
// Avatar Colors — deterministic from string
// ============================================================

const AVATAR_COLORS = [
  'bg-blue-600',
  'bg-emerald-600',
  'bg-violet-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-cyan-600',
  'bg-indigo-600',
  'bg-teal-600',
];

function getAvatarColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitial(name: string | null, username: string | null): string {
  const display = name || username || '?';
  return display.charAt(0).toUpperCase();
}

// ============================================================
// UserAvatar
// ============================================================

function UserAvatar({
  name,
  username,
  size = 'md',
}: {
  name: string | null;
  username: string | null;
  size?: 'sm' | 'md';
}) {
  const initial = getInitial(name, username);
  const colorClass = getAvatarColor(username || name || 'user');
  const sizeClass = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-8 w-8 text-sm';

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-medium text-white',
        colorClass,
        sizeClass
      )}
    >
      {initial}
    </div>
  );
}

// ============================================================
// UserMenu
// ============================================================

interface UserMenuProps {
  collapsed: boolean;
}

export function UserMenu({ collapsed }: UserMenuProps) {
  const [user, setUser] = useState<{ name: string | null; username: string | null } | null>(null);
  const [authEnabled, setAuthEnabled] = useState(false);
  const { loadAuthMe } = useAuthMe();
  const session = useSession();

  useEffect(() => {
    // Check if user has a session (auth is active)
    const sessionKey = session.getKey();
    if (!sessionKey) return;

    setAuthEnabled(true);

    // Read cached user from localStorage
    const cached = session.getUser();
    if (cached) {
      setUser({ name: cached.name, username: cached.username });
    }

    // Lazy refresh from API in background
    loadAuthMe()
      .then((data) => {
        setUser({ name: data.name, username: data.username });
        session.setUser({
          id: data.id,
          name: data.name,
          username: data.username,
          avatar_url: data.avatar_url,
        });
      })
      .catch(() => {
        // Ignore — we already have cached data or no user
      });
  }, [loadAuthMe, session]);

  if (!authEnabled || !user) return null;

  const displayName = user.name || user.username || 'User';

  const trigger = (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        className={cn(
          'flex items-center gap-3 rounded-xl w-full',
          'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]',
          'transition-all duration-[var(--motion-base)] ease-[var(--ease-out-soft)]',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]/50',
          collapsed ? 'h-10 w-10 justify-center' : 'h-10 px-3'
        )}
      >
        <UserAvatar name={user.name} username={user.username} />
        {!collapsed && <span className="text-sm font-medium truncate">{displayName}</span>}
      </button>
    </DropdownMenuTrigger>
  );

  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {displayName}
          </TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent side="right" align="end" className="w-48">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-2">
            <UserAvatar name={user.name} username={user.username} size="sm" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">{displayName}</span>
              {user.username && user.name && (
                <span className="text-xs text-muted-foreground">@{user.username}</span>
              )}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/" className="flex items-center gap-2 cursor-pointer">
            <Home className="h-4 w-4" />
            My Projects
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings" className="flex items-center gap-2 cursor-pointer">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => session.clear()}
          className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
