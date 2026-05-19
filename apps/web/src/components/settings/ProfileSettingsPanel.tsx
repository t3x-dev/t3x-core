'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useAuthMe } from '@/hooks/shared/useAuthMe';
import { useSession } from '@/hooks/shared/useSession';
import { useSettingsStore } from '@/store/settingsStore';
import { cn } from '@/utils/cn';
import {
  getLocalWorkspaceAvatarClass,
  LOCAL_WORKSPACE_AVATAR_OPTIONS,
} from '@/utils/localWorkspaceAvatar';

interface ProfileViewModel {
  name: string | null;
  username: string | null;
  email: string | null;
}

export function ProfileSettingsPanel() {
  const { loadAuthMe } = useAuthMe();
  const { getKey, getUser } = useSession();
  const localWorkspaceName = useSettingsStore((state) => state.localWorkspaceName);
  const localWorkspaceAvatarColor = useSettingsStore((state) => state.localWorkspaceAvatarColor);
  const setLocalWorkspaceName = useSettingsStore((state) => state.setLocalWorkspaceName);
  const setLocalWorkspaceAvatarColor = useSettingsStore(
    (state) => state.setLocalWorkspaceAvatarColor
  );
  const authDisabled = process.env.NEXT_PUBLIC_AUTH_DISABLED?.toLowerCase() === 'true';
  const [profile, setProfile] = useState<ProfileViewModel | null>(authDisabled ? null : null);

  useEffect(() => {
    if (authDisabled) {
      setProfile(null);
      return;
    }

    const sessionKey = getKey();
    if (!sessionKey) {
      setProfile(null);
      return;
    }

    const cachedUser = getUser();
    if (cachedUser) {
      setProfile({
        name: cachedUser.name,
        username: cachedUser.username,
        email: null,
      });
    }

    loadAuthMe()
      .then((user) => {
        setProfile({
          name: user.name,
          username: user.username,
          email: user.email,
        });
      })
      .catch(() => {
        // Keep cached local session info if the background refresh fails.
      });
  }, [authDisabled, getKey, getUser, loadAuthMe]);

  const localInitial = useMemo(
    () => (localWorkspaceName.trim().charAt(0) || 'L').toUpperCase(),
    [localWorkspaceName]
  );

  if (authDisabled) {
    return (
      <section className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Local profile</h2>
          <p className="text-xs text-[var(--text-tertiary)]">
            Customize how this local workspace appears in the app.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)] p-5">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-[var(--on-accent)]',
                getLocalWorkspaceAvatarClass(localWorkspaceAvatarColor)
              )}
            >
              {localInitial}
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="local-workspace-name"
                  className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]"
                >
                  Workspace name
                </label>
                <Input
                  id="local-workspace-name"
                  value={localWorkspaceName}
                  onChange={(event) => setLocalWorkspaceName(event.target.value)}
                  placeholder="Local Workspace"
                  maxLength={40}
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
                  Avatar color
                </p>
                <div className="flex flex-wrap gap-2">
                  {LOCAL_WORKSPACE_AVATAR_OPTIONS.map((option) => {
                    const isActive = option.value === localWorkspaceAvatarColor;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-label={`Avatar color ${option.value}`}
                        aria-pressed={isActive}
                        onClick={() => setLocalWorkspaceAvatarColor(option.value)}
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 transition-transform hover:scale-105',
                          option.className,
                          isActive
                            ? 'ring-2 ring-[var(--text-primary)] ring-offset-[var(--surface-primary)]'
                            : 'ring-1 ring-[var(--stroke-default)]'
                        )}
                      >
                        {isActive && (
                          <span className="h-2 w-2 rounded-full bg-[var(--surface-card)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl bg-[var(--surface-secondary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                Settings stay local to this browser. Manage model providers from the Providers tab
                when you need API-backed features.
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const displayName = profile?.name || profile?.username || 'Account';

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Account</h2>
        <p className="text-xs text-[var(--text-tertiary)]">
          Manage how this workspace identifies you in the settings experience.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)] p-5">
        <div className="space-y-1">
          <p className="text-sm font-medium text-[var(--text-primary)]">{displayName}</p>
          {profile?.username && (
            <p className="text-xs text-[var(--text-secondary)]">@{profile.username}</p>
          )}
          {profile?.email && (
            <p className="text-xs text-[var(--text-secondary)]">{profile.email}</p>
          )}
        </div>

        {profile ? (
          <p className="mt-4 text-xs text-[var(--text-secondary)]">
            Account details come from your current signed-in session.
          </p>
        ) : (
          <p className="mt-4 text-xs text-[var(--text-secondary)]">
            Sign in to view account details for this workspace.
          </p>
        )}
      </div>
    </section>
  );
}
