'use client';

import { Button } from '@/components/ui/button';
import { useSettingsModalStore } from '@/store/settingsModalStore';
import { cn } from '@/utils/cn';

interface ProviderSetupBannerProps {
  className?: string;
  variant?: 'setup' | 'api-unavailable';
}

const COPY = {
  setup: {
    title: 'Set up a generation provider',
    description: 'Connect a provider in Settings to pick a model and start chatting.',
  },
  'api-unavailable': {
    title: 'API server unavailable',
    description: 'WebUI cannot reach the T3X API, so model keys from your config file cannot load.',
  },
} as const;

export function ProviderSetupBanner({ className, variant = 'setup' }: ProviderSetupBannerProps) {
  const openSettingsModal = useSettingsModalStore((state) => state.openSettingsModal);
  const copy = COPY[variant];

  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-4 py-3',
        'shadow-sm',
        className
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-[var(--text-primary)]">{copy.title}</p>
          <p className="text-sm text-[var(--text-tertiary)]">{copy.description}</p>
        </div>

        {variant === 'setup' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => openSettingsModal('providers')}
          >
            Open provider settings
          </Button>
        )}
      </div>
    </div>
  );
}
