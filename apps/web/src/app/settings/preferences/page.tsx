'use client';

import type { ExtractionStyleConfig } from '@t3x-dev/core';
import { Code, Layout, Monitor, Moon, Sun, Users } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { ExtractionStylePanel } from '@/components/settings/ExtractionStylePanel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type UserExperience, useSettingsStore, type ViewMode } from '@/store/settingsStore';

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
  const defaultView = useSettingsStore((s) => s.defaultView);
  const setDefaultView = useSettingsStore((s) => s.setDefaultView);
  const density = useSettingsStore((s) => s.density);
  const setDensity = useSettingsStore((s) => s.setDensity);
  const developerMode = useSettingsStore((s) => s.developerMode);
  const setDeveloperMode = useSettingsStore((s) => s.setDeveloperMode);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [extractionStyle, setExtractionStyle] = useState<ExtractionStyleConfig | null>(null);
  const [styleLoaded, setStyleLoaded] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/auth/me`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setExtractionStyle(data.data.default_extraction_style ?? null);
        }
        setStyleLoaded(true);
      })
      .catch(() => setStyleLoaded(true));
  }, []);

  const handleStyleChange = (style: ExtractionStyleConfig | null) => {
    setExtractionStyle(style);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/auth/me`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_extraction_style: style }),
    });
  };

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

      {/* Default View */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Default View</h2>
        <p className="text-xs text-[var(--text-tertiary)] mb-3">
          Choose how projects open by default.
        </p>
        <div className="flex flex-col gap-3">
          <OptionCard<ViewMode>
            value="canvas"
            current={defaultView}
            onChange={setDefaultView}
            icon={<Layout className="h-5 w-5" />}
            title="Canvas"
            description="Visual node graph with drag-and-drop interactions."
          />
          <OptionCard<ViewMode>
            value="timeline"
            current={defaultView}
            onChange={setDefaultView}
            icon={<Monitor className="h-5 w-5" />}
            title="Timeline"
            description="Chronological view of commits and activity."
          />
        </div>
      </section>

      {/* Density, Extraction Style, Developer Mode — removed (non-core) */}
    </div>
  );
}
