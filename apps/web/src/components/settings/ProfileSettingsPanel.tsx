'use client';

import { Loader2 } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthMe } from '@/hooks/shared/useAuthMe';
import { useSession } from '@/hooks/shared/useSession';
import { cn } from '@/utils/cn';

interface ProfileSettingsPanelProps {
  className?: string;
}

interface ProfileFormState {
  avatar_url: string;
  name: string;
}

function normalizeEditableValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeValueForSave(value: string): string {
  return value.trim();
}

export function ProfileSettingsPanel({ className }: ProfileSettingsPanelProps) {
  const { getUser, setUser } = useSession();
  const { loadAuthMe, updateAuthMe } = useAuthMe();
  const cachedUser = useMemo(() => getUser(), [getUser]);

  const [username, setUsername] = useState(cachedUser?.username ?? null);
  const [form, setForm] = useState<ProfileFormState>({
    name: cachedUser?.name ?? '',
    avatar_url: cachedUser?.avatar_url ?? '',
  });
  const [savedForm, setSavedForm] = useState<ProfileFormState>({
    name: cachedUser?.name ?? '',
    avatar_url: cachedUser?.avatar_url ?? '',
  });
  const [loading, setLoading] = useState(!cachedUser);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadAuthMe()
      .then((data) => {
        if (cancelled) return;

        const nextForm = {
          name: data.name ?? '',
          avatar_url: data.avatar_url ?? '',
        };

        setUsername(data.username);
        setForm(nextForm);
        setSavedForm(nextForm);
        setError(null);
        setUser({
          id: data.id,
          name: data.name,
          username: data.username,
          avatar_url: data.avatar_url,
        });
      })
      .catch((loadError) => {
        if (cancelled) return;
        if (!cachedUser) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load profile');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cachedUser, loadAuthMe, setUser]);

  const isDirty = useMemo(
    () => form.name !== savedForm.name || form.avatar_url !== savedForm.avatar_url,
    [form, savedForm]
  );

  const displayName = normalizeEditableValue(form.name) ?? username ?? 'User';

  const handleChange =
    (field: keyof ProfileFormState) => (event: ChangeEvent<HTMLInputElement>) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      setSavedMessage(null);
      if (error) {
        setError(null);
      }
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isDirty) return;

    setSaving(true);
    setError(null);
    setSavedMessage(null);

    try {
      const updated = await updateAuthMe({
        name: normalizeValueForSave(form.name),
        avatar_url: normalizeValueForSave(form.avatar_url),
      });

      const nextForm = {
        name: updated.name ?? '',
        avatar_url: updated.avatar_url ?? '',
      };

      setUsername(updated.username);
      setForm(nextForm);
      setSavedForm(nextForm);
      setSavedMessage('Profile updated.');
      setUser({
        id: updated.id,
        name: updated.name,
        username: updated.username,
        avatar_url: updated.avatar_url,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn('mx-auto w-full max-w-xl px-5 py-5', className)}>
      <div className="mb-4">
        <h1 className="text-sm font-semibold text-[var(--text-primary)]">Profile</h1>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          Name and avatar shown in the workspace.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <div className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)]/40 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <UserAvatar
              name={normalizeEditableValue(form.name)}
              username={username}
              avatarUrl={normalizeEditableValue(form.avatar_url)}
              size="lg"
            />
            <div className="min-w-0 space-y-1">
              <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                {displayName}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                {username ? `@${username}` : 'Username unavailable'}
              </p>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                Updates appear anywhere this user is shown.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 rounded-lg border border-[var(--stroke-divider)] bg-background p-4">
          <div className="grid gap-2">
            <Label htmlFor="settings-profile-name" className="text-xs">
              Display name
            </Label>
            <Input
              id="settings-profile-name"
              value={form.name}
              onChange={handleChange('name')}
              placeholder="How your name should appear"
              disabled={loading || saving}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="settings-profile-avatar-url" className="text-xs">
              Avatar URL
            </Label>
            <Input
              id="settings-profile-avatar-url"
              type="url"
              value={form.avatar_url}
              onChange={handleChange('avatar_url')}
              placeholder="https://example.com/avatar.png"
              disabled={loading || saving}
            />
            <p className="text-[11px] text-[var(--text-tertiary)]">
              Leave blank to keep the generated initials avatar.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="settings-profile-username" className="text-xs">
              Username
            </Label>
            <Input
              id="settings-profile-username"
              value={username ?? ''}
              readOnly
              disabled
              className="text-[var(--text-secondary)]"
            />
            <p className="text-[11px] text-[var(--text-tertiary)]">
              Username is read-only in this flow.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] text-[var(--text-tertiary)]">
            {savedMessage ?? (loading ? 'Loading profile…' : 'Changes are saved to your account.')}
          </div>
          <Button type="submit" size="sm" disabled={loading || saving || !isDirty}>
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              'Save changes'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
