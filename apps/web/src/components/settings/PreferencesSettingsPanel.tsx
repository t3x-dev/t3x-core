'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ModelSelector } from '@/components/shared/ModelSelector';
import { Button } from '@/components/ui/button';
import { formatUserFacingError } from '@/domain/format/errors';
import { useAuthMe } from '@/hooks/shared/useAuthMe';
import { useSession } from '@/hooks/shared/useSession';
import { cn } from '@/utils/cn';

const APPEARANCE_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

interface ModelDefaultsState {
  provider: string | null;
  model: string | null;
}

export function PreferencesSettingsPanel() {
  const { theme, setTheme } = useTheme();
  const { loadAuthMe, saveAuthMe } = useAuthMe();
  const { getKey } = useSession();
  const authDisabled = process.env.NEXT_PUBLIC_AUTH_DISABLED?.toLowerCase() === 'true';
  const hasSession = !authDisabled && Boolean(getKey());
  const [mounted, setMounted] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(hasSession);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [savedDefaults, setSavedDefaults] = useState<ModelDefaultsState>({
    provider: null,
    model: null,
  });
  const [draftDefaults, setDraftDefaults] = useState<ModelDefaultsState>({
    provider: null,
    model: null,
  });

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!hasSession) {
      setSavedDefaults({ provider: null, model: null });
      setDraftDefaults({ provider: null, model: null });
      setLoadingDefaults(false);
      return;
    }

    let cancelled = false;
    setLoadingDefaults(true);

    loadAuthMe()
      .then((user) => {
        if (cancelled) return;
        const next = {
          provider: user.default_provider ?? null,
          model: user.default_model ?? null,
        };
        setSavedDefaults(next);
        setDraftDefaults(next);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error('Could not load account defaults');
      })
      .finally(() => {
        if (!cancelled) setLoadingDefaults(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasSession, loadAuthMe]);

  const isDirty = useMemo(
    () =>
      savedDefaults.provider !== draftDefaults.provider ||
      savedDefaults.model !== draftDefaults.model,
    [draftDefaults.model, draftDefaults.provider, savedDefaults.model, savedDefaults.provider]
  );

  async function handleSaveDefaults() {
    setSavingDefaults(true);
    try {
      const updated = await saveAuthMe({
        default_provider: draftDefaults.provider,
        default_model: draftDefaults.model,
      });
      const next = {
        provider: updated.default_provider ?? null,
        model: updated.default_model ?? null,
      };
      setSavedDefaults(next);
      setDraftDefaults(next);
      toast.success('Default model preference saved');
    } catch (error) {
      toast.error(formatUserFacingError(error, 'Failed to save model defaults.'));
    } finally {
      setSavingDefaults(false);
    }
  }

  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Appearance</h2>
          <p className="text-xs text-[var(--text-tertiary)]">
            Choose how T3X should look on this device.
          </p>
        </div>

        {mounted && (
          <div className="inline-flex items-center gap-1 rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-secondary)] p-1">
            {APPEARANCE_OPTIONS.map((option) => {
              const isActive = (theme ?? 'system') === option.value;
              const Icon = option.icon;

              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-[var(--surface-primary)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Model Defaults</h2>
          <p className="text-xs text-[var(--text-tertiary)]">
            Account-level defaults apply when a conversation or project has not pinned its own
            provider/model.
          </p>
        </div>

        {authDisabled ? (
          <div className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            User-level defaults are unavailable while auth is disabled. Chat and generation will
            fall back to conversation, project, and global provider settings.
          </div>
        ) : !hasSession ? (
          <div className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            Sign in to save account-level provider/model defaults.
          </div>
        ) : loadingDefaults ? (
          <div className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            Loading account defaults...
          </div>
        ) : (
          <div className="space-y-4 rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)] p-4">
            <ModelSelector
              initialProvider={draftDefaults.provider}
              initialModel={draftDefaults.model}
              onChange={(provider, model) => setDraftDefaults({ provider, model })}
            />

            <div className="rounded-xl bg-[var(--surface-secondary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
              Resolution order: conversation override, project default, account default, global
              provider order.
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => void handleSaveDefaults()}
                disabled={!isDirty || savingDefaults}
              >
                {savingDefaults ? 'Saving...' : 'Save Defaults'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={savingDefaults || (!draftDefaults.provider && !draftDefaults.model)}
                onClick={() => setDraftDefaults({ provider: null, model: null })}
              >
                Clear
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
