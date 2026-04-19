'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

interface PreferencesSettingsPanelProps {
  className?: string;
}

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

export function PreferencesSettingsPanel({ className }: PreferencesSettingsPanelProps) {
  const { theme, setTheme } = useTheme();
  const currentTheme = theme ?? 'system';

  return (
    <div className={cn('mx-auto w-full max-w-xl px-5 py-5', className)}>
      <div className="mb-4">
        <h1 className="text-sm font-semibold text-[var(--text-primary)]">Preferences</h1>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          Local display settings for this workspace.
        </p>
      </div>

      <section className="space-y-2">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            Appearance
          </h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Choose your color theme.</p>
        </div>

        <div className="inline-flex rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)]/50 p-1">
          {THEME_OPTIONS.map((option) => {
            const isActive = currentTheme === option.value;
            return (
              <Button
                key={option.value}
                type="button"
                variant="ghost"
                onClick={() => setTheme(option.value)}
                className={cn(
                  'h-8 rounded-md px-3 text-xs font-medium',
                  isActive
                    ? 'bg-background text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)]'
                )}
              >
                <option.icon className="h-3.5 w-3.5" />
                {option.label}
              </Button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
