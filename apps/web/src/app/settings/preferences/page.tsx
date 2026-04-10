'use client';

import { Code, Monitor, Moon, Sun, Users } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { type UserExperience, useSettingsStore } from '@/store/settingsStore';

interface OptionCardProps<T extends string> {
  value: T;
  current: T;
  onChange: (v: T) => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}

function OptionCard<T extends string>({
  value,
  current,
  onChange,
  icon,
  title,
  description,
}: OptionCardProps<T>) {
  const isActive = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={cn(
        'flex items-start gap-3 rounded-lg border p-4 text-left transition-colors',
        isActive
          ? 'border-[var(--accent-commit)] bg-[var(--accent-commit)]/5'
          : 'border-[var(--stroke-divider)] hover:border-[var(--stroke-default)]'
      )}
    >
      <div
        className={cn(
          'mt-0.5 shrink-0',
          isActive ? 'text-[var(--accent-commit)]' : 'text-[var(--text-tertiary)]'
        )}
      >
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{description}</p>
      </div>
    </button>
  );
}

export default function PreferencesPage() {
  const userExperience = useSettingsStore((s) => s.userExperience);
  const setUserExperience = useSettingsStore((s) => s.setUserExperience);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">Preferences</h1>
      <p className="text-sm text-[var(--text-secondary)] mt-1 mb-8">
        Customize your T3X experience. Changes are saved automatically.
      </p>

      {/* Appearance */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Appearance</h2>
        <p className="text-xs text-[var(--text-tertiary)] mb-3">
          Choose your preferred color theme.
        </p>
        {mounted && (
          <div className="flex flex-col gap-3">
            <OptionCard<string>
              value="light"
              current={theme ?? 'system'}
              onChange={setTheme}
              icon={<Sun className="h-5 w-5" />}
              title="Light"
              description="Clean light background for daytime use."
            />
            <OptionCard<string>
              value="dark"
              current={theme ?? 'system'}
              onChange={setTheme}
              icon={<Moon className="h-5 w-5" />}
              title="Dark"
              description="Reduced glare for low-light environments."
            />
            <OptionCard<string>
              value="system"
              current={theme ?? 'system'}
              onChange={setTheme}
              icon={<Monitor className="h-5 w-5" />}
              title="System"
              description="Automatically match your operating system preference."
            />
          </div>
        )}
      </section>

      {/* Experience Level */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Experience Level</h2>
        <p className="text-xs text-[var(--text-tertiary)] mb-3">
          Controls terminology used throughout the interface.
        </p>
        <div className="flex flex-col gap-3">
          <OptionCard<UserExperience>
            value="general"
            current={userExperience}
            onChange={setUserExperience}
            icon={<Users className="h-5 w-5" />}
            title="General User"
            description="Simplified terminology. Commits → Snapshots, Branches → Versions."
          />
          <OptionCard<UserExperience>
            value="developer"
            current={userExperience}
            onChange={setUserExperience}
            icon={<Code className="h-5 w-5" />}
            title="Developer"
            description="Full Git terminology. Commits, branches, merges, and diffs."
          />
        </div>
      </section>


      {/* Density, Extraction Style, Developer Mode — removed (non-core) */}
    </div>
  );
}
