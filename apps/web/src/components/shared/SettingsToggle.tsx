'use client';

import { Code, Sparkles } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/store/settingsStore';

interface SettingsToggleProps {
  collapsed: boolean;
}

export function SettingsToggle({ collapsed }: SettingsToggleProps) {
  const developerMode = useSettingsStore((s) => s.developerMode);
  const toggle = useSettingsStore((s) => s.toggleDeveloperMode);

  const button = (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'flex items-center gap-3 rounded-xl transition-all duration-[var(--motion-base)] ease-[var(--ease-out-soft)]',
        collapsed ? 'h-10 w-10 justify-center' : 'h-10 w-full px-3',
        developerMode
          ? 'text-[var(--accent-commit)] hover:bg-[var(--hover-bg-strong)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
      )}
      aria-label={developerMode ? 'Switch to default mode' : 'Switch to developer mode'}
    >
      <span className="shrink-0">
        {developerMode ? <Code className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </span>
      {!collapsed && (
        <span className="text-sm font-medium truncate">
          {developerMode ? 'Developer' : 'Friendly'}
        </span>
      )}
    </button>
  );

  if (!collapsed) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {developerMode ? 'Developer Mode (on)' : 'Developer Mode (off)'}
      </TooltipContent>
    </Tooltip>
  );
}
