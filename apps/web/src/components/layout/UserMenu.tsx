'use client';

/**
 * UserMenu — Avatar + dropdown menu for the sidebar bottom area.
 *
 * Collapsed: circular avatar with first letter of display name.
 * Expanded: avatar + username text.
 * Click: DropdownMenu with Profile / Settings / Sign Out.
 *
 * When local auth is disabled, still renders a local profile menu so
 * Settings remains reachable in source-dev and self-hosted local mode.
 * Otherwise reads from localStorage on mount, lazy-refreshes from /auth/me
 * in background, and hides until a session exists.
 */

import { LogOut, Settings, User } from 'lucide-react';
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
import { useAuthMe } from '@/hooks/shared/useAuthMe';
import { useSession } from '@/hooks/shared/useSession';
import {
  DEFAULT_LOCAL_WORKSPACE_NAME,
  resolveLocalWorkspaceName,
  useSettingsStore,
} from '@/store/settingsStore';
import { cn } from '@/utils/cn';
import { getLocalWorkspaceAvatarClass } from '@/utils/localWorkspaceAvatar';

function getAvatarColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  const colors = [
    'bg-[var(--accent-commit)]',
    'bg-[var(--status-success)]',
    'bg-[var(--accent-extract)]',
    'bg-[var(--accent-branch)]',
    'bg-[var(--status-error)]',
    'bg-[var(--accent-leaf)]',
    'bg-[var(--accent-conversation)]',
    'bg-[var(--accent-leaf)]',
  ];
  return colors[Math.abs(hash) % colors.length];
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
  avatarColor,
}: {
  name: string | null;
  username: string | null;
  size?: 'sm' | 'md';
  avatarColor?: string;
}) {
  const initial = getInitial(name, username);
  const colorClass = avatarColor ?? getAvatarColor(username || name || 'user');
  const sizeClass = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-8 w-8 text-sm';

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-medium text-[var(--on-accent)]',
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
  const [mounted, setMounted] = useState(false);
  const { loadAuthMe } = useAuthMe();
  const { clear, getKey, getUser, setUser: persistUser } = useSession();
  const localWorkspaceName = useSettingsStore((state) => state.localWorkspaceName);
  const localWorkspaceAvatarColor = useSettingsStore((state) => state.localWorkspaceAvatarColor);
  const authDisabled = process.env.NEXT_PUBLIC_AUTH_DISABLED?.toLowerCase() === 'true';

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (authDisabled) return;

    // Check if user has a session (auth is active)
    const sessionKey = getKey();
    if (!sessionKey) return;

    setAuthEnabled(true);

    // Read cached user from localStorage
    const cached = getUser();
    if (cached) {
      setUser({ name: cached.name, username: cached.username });
    }

    // Lazy refresh from API in background
    loadAuthMe()
      .then((data) => {
        setUser({ name: data.name, username: data.username });
        persistUser({
          id: data.id,
          name: data.name,
          username: data.username,
          avatar_url: data.avatar_url,
        });
      })
      .catch(() => {
        // Ignore — we already have cached data or no user
      });
  }, [authDisabled, getKey, getUser, loadAuthMe, persistUser]);

  const localDisplayName = resolveLocalWorkspaceName(localWorkspaceName);
  const menuUser = authDisabled ? { name: localDisplayName, username: null } : user;
  const showSignOut = !authDisabled;

  if (!mounted) {
    return (
      <div
        aria-hidden="true"
        className={cn('rounded-full', collapsed ? 'h-9 w-9' : 'h-10 w-full')}
      />
    );
  }

  if ((!authEnabled || !user) && !authDisabled) return null;
  if (!menuUser) return null;

  const displayName = menuUser.name || menuUser.username || 'User';
  const triggerDisplayName =
    authDisabled && displayName === DEFAULT_LOCAL_WORKSPACE_NAME ? 'Local profile' : displayName;

  const trigger = (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        className={cn(
          'flex w-full items-center rounded-full',
          'transition-all duration-[var(--motion-base)] ease-[var(--ease-out-soft)]',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]/50',
          collapsed
            ? 'h-9 w-9 justify-center text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
            : 'h-10 justify-start gap-2.5 border border-[var(--stroke-default)] bg-[var(--sidebar-panel)] px-2.5 pr-3 text-[var(--text-secondary)] shadow-[var(--fx-shadow-sm)] hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg-strong)] hover:text-[var(--text-primary)]'
        )}
        aria-label={triggerDisplayName}
      >
        <UserAvatar
          name={menuUser.name}
          username={menuUser.username}
          size="sm"
          avatarColor={
            authDisabled ? getLocalWorkspaceAvatarClass(localWorkspaceAvatarColor) : undefined
          }
        />
        {!collapsed && (
          <span className="min-w-0 truncate text-[12px] font-medium leading-none">
            {triggerDisplayName}
          </span>
        )}
      </button>
    </DropdownMenuTrigger>
  );

  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {triggerDisplayName}
          </TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent
        side={collapsed ? 'right' : 'top'}
        align={collapsed ? 'end' : 'start'}
        sideOffset={collapsed ? 4 : 8}
        className="w-48"
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-2">
            <UserAvatar
              name={menuUser.name}
              username={menuUser.username}
              size="sm"
              avatarColor={
                authDisabled ? getLocalWorkspaceAvatarClass(localWorkspaceAvatarColor) : undefined
              }
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium">{triggerDisplayName}</span>
              {authDisabled && triggerDisplayName !== 'Local profile' && (
                <span className="text-xs text-muted-foreground">Local profile</span>
              )}
              {menuUser.username && menuUser.name && (
                <span className="text-xs text-muted-foreground">@{menuUser.username}</span>
              )}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="flex cursor-pointer items-center gap-2">
          <Link href="/settings/profile">
            <User className="h-4 w-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="flex cursor-pointer items-center gap-2">
          <Link href="/settings/preferences">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        {showSignOut && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => clear()}
              className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
