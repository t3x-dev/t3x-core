'use client';

/**
 * UserMenu — Avatar + dropdown menu for the sidebar bottom area.
 *
 * Collapsed: avatar-only trigger.
 * Expanded: avatar + display name.
 * Click: DropdownMenu with Profile / Settings / Sign Out.
 *
 * In auth-enabled mode it reads from localStorage, listens for same-tab
 * session profile updates, and lazy-refreshes from /auth/me in the background.
 * In auth-disabled local dev it still renders a stable global settings entry.
 */

import { LogOut, Settings, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { UserAvatar } from '@/components/shared/UserAvatar';
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
import { cn } from '@/utils/cn';

// ============================================================
// UserMenu
// ============================================================

interface UserMenuProps {
  collapsed: boolean;
}

export function UserMenu({ collapsed }: UserMenuProps) {
  const [user, setMenuUser] = useState<{
    avatar_url: string | null;
    name: string | null;
    username: string | null;
  }>({
    avatar_url: null,
    name: 'Local Workspace',
    username: null,
  });
  const [authEnabled, setAuthEnabled] = useState(false);
  const { loadAuthMe } = useAuthMe();
  const { clear, getKey, getUser, setUser } = useSession();
  const openSettingsModal = useSettingsModalStore((state) => state.open);

  const getFallbackUser = () => ({
    avatar_url: null,
    name: 'Local Workspace',
    username: null,
  });

  useEffect(() => {
    // Check if user has a session (auth is active)
    const sessionKey = getKey();
    if (!sessionKey) {
      setAuthEnabled(false);
      setMenuUser((current) => current ?? getFallbackUser());
      return;
    }

    setAuthEnabled(true);

    const syncUserFromSession = () => {
      const cached = getUser();
      setMenuUser(
        cached
          ? {
              name: cached.name,
              username: cached.username,
              avatar_url: cached.avatar_url ?? null,
            }
          : getFallbackUser()
      );
    };

    // Read cached user from localStorage
    syncUserFromSession();
    window.addEventListener('t3x-session-user-changed', syncUserFromSession);

    // Lazy refresh from API in background
    loadAuthMe()
      .then((data) => {
        setUser({
          id: data.id,
          name: data.name,
          username: data.username,
          avatar_url: data.avatar_url,
        });
      })
      .catch(() => {
        // Ignore — we already have cached data or no user
      });

    return () => {
      window.removeEventListener('t3x-session-user-changed', syncUserFromSession);
    };
  }, [getKey, getUser, loadAuthMe, setUser]);

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
        <UserAvatar name={user.name} username={user.username} avatarUrl={user.avatar_url} />
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
      <DropdownMenuContent
        side="top"
        align={collapsed ? 'start' : 'center'}
        sideOffset={10}
        className="w-56 overflow-hidden rounded-2xl p-0"
      >
        <DropdownMenuLabel className="px-3 py-3 font-normal">
          <div className="flex items-center gap-3">
            <UserAvatar
              name={user.name}
              username={user.username}
              avatarUrl={user.avatar_url}
              size="sm"
            />
            <div className="min-w-0 flex flex-col">
              <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                {displayName}
              </span>
              {user.username && user.name && (
                <span className="truncate text-xs text-[var(--text-tertiary)]">
                  @{user.username}
                </span>
              )}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => openSettingsModal('profile')}
          className="mx-1 my-1 flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5"
        >
          <User className="h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => openSettingsModal('preferences')}
          className="mx-1 mb-1 flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5"
        >
          <Settings className="h-4 w-4" />
          Settings
        </DropdownMenuItem>
        {authEnabled && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => clear()}
              className="mx-1 my-1 flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-destructive focus:text-destructive"
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
