'use client';

import { Code, Sparkles } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/store/settingsStore';

interface SettingsToggleProps {
  collapsed: boolean;
}

export function SettingsToggle({ collapsed }: SettingsToggleProps) {
  const developerMode = useSettingsStore((s) => s.developerMode);
  const toggle = useSettingsStore((s) => s.toggleDeveloperMode);

  const icon = developerMode ? (
    <Code className="h-5 w-5 text-[var(--accent-commit)]" />
  ) : (
    <Sparkles className="h-5 w-5" />
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={toggle}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-[var(--motion-base)]',
              'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
            )}
            aria-label="Developer Mode"
          >
            {icon}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          Developer Mode
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div
      className={cn(
        'flex h-10 w-full items-center gap-3 rounded-xl px-3',
        'text-[var(--text-secondary)]'
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 text-sm font-medium truncate">Dev Mode</span>
      <Switch checked={developerMode} onCheckedChange={toggle} aria-label="Developer Mode" />
    </div>
  );
}
