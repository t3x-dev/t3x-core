'use client';

/**
 * UserMenu — Avatar + dropdown menu for the sidebar bottom area.
 *
 * Collapsed: circular avatar with first letter of display name.
 * Expanded: avatar + username text.
 * Click: DropdownMenu with Profile / Settings / Sign Out.
 *
 * When local auth is disabled, still renders a local workspace menu so
 * Settings remains reachable in source-dev and self-hosted local mode.
 * Otherwise reads from localStorage on mount, lazy-refreshes from /auth/me
 * in background, and hides until a session exists.
 */

import { LogOut, Settings, User } from 'lucide-react';
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
import { useSettingsModalStore } from '@/store/settingsModalStore';
import { useSettingsStore } from '@/store/settingsStore';
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
  const openSettingsModal = useSettingsModalStore((state) => state.openSettingsModal);
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

  const menuUser = authDisabled ? { name: localWorkspaceName, username: null } : user;
  const showSignOut = !authDisabled;

  if (!mounted) {
    return (
      <div
        aria-hidden="true"
        className={cn('rounded-lg', collapsed ? 'h-9 w-9' : 'h-8 w-full')}
      />
    );
  }

  if ((!authEnabled || !user) && !authDisabled) return null;
  if (!menuUser) return null;

  const displayName = menuUser.name || menuUser.username || 'User';

  const trigger = (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        className={cn(
          'flex w-full items-center rounded-lg',
          'text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]',
          'transition-all duration-[var(--motion-base)] ease-[var(--ease-out-soft)]',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]/50',
          collapsed ? 'h-9 w-9 justify-center' : 'h-8 gap-2 px-1.5'
        )}
        aria-label={displayName}
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
            {displayName}
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
            {displayName}
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
              <span className="text-sm font-medium">{displayName}</span>
              {menuUser.username && menuUser.name && (
                <span className="text-xs text-muted-foreground">@{menuUser.username}</span>
              )}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => openSettingsModal('profile')}
          className="flex items-center gap-2 cursor-pointer"
        >
          <User className="h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => openSettingsModal('preferences')}
          className="flex items-center gap-2 cursor-pointer"
        >
          <Settings className="h-4 w-4" />
          Settings
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
