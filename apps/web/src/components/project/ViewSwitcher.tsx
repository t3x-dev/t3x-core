'use client';

import { Clock, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useSettingsStore, type ViewMode } from '@/store/settingsStore';

interface ViewSwitcherProps {
  value: ViewMode;
  onChange: (view: ViewMode) => void;
}

const views: { value: ViewMode; icon: typeof LayoutGrid; label: string; disabled?: boolean }[] = [
  { value: 'canvas', icon: LayoutGrid, label: 'Canvas' },
  { value: 'timeline', icon: Clock, label: 'Timeline' },
  { value: 'list', icon: List, label: 'List' },
];

export function ViewSwitcher({ value, onChange }: ViewSwitcherProps) {
  const setDefaultView = useSettingsStore((s) => s.setDefaultView);

  const handleChange = (next: ViewMode) => {
    onChange(next);
    setDefaultView(next);
  };

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-0.5">
      {views.map((v) => (
        <Tooltip key={v.value}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={v.disabled}
              onClick={() => handleChange(v.value)}
              className={cn(
                'h-7 w-7 rounded-md',
                value === v.value
                  ? 'bg-[var(--accent-commit)]/10 text-[var(--accent-commit)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              )}
              aria-label={v.label}
            >
              <v.icon className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{v.label}</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
