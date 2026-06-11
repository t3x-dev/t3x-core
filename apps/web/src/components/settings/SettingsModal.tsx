'use client';

import { Blocks, Monitor, Settings, User } from 'lucide-react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useSettingsModalStore } from '@/store/settingsModalStore';
import { useSettingsStore } from '@/store/settingsStore';
import { cn } from '@/utils/cn';

export function SettingsModal() {
  const isOpen = useSettingsModalStore((state) => state.isOpen);
  const activeTab = useSettingsModalStore((state) => state.activeTab);
  const closeSettingsModal = useSettingsModalStore((state) => state.closeSettingsModal);
  const density = useSettingsStore((state) => state.density);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeSettingsModal()}>
      <DialogContent className="w-[min(520px,calc(100vw-24px))] overflow-hidden border-0 bg-transparent p-0 shadow-none">
        <div
          data-testid="settings-modal-shell"
          className="overflow-hidden rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)] shadow-[var(--fx-shadow-lg)]"
        >
          <div className="border-b border-[var(--stroke-divider)] px-5 py-4">
            <DialogTitle className="text-[15px] font-semibold text-[var(--text-primary)]">
              Quick Settings
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              Fast local changes and readiness shortcuts.
            </DialogDescription>
          </div>

          <div className="space-y-2 p-3">
            <QuickSettingRow
              icon={User}
              title="Local profile"
              detail="Display name, avatar, and edit author."
              href="/settings/profile"
              isActive={activeTab === 'profile'}
              onNavigate={closeSettingsModal}
            />
            <QuickSettingRow
              icon={Monitor}
              title="Appearance"
              detail={`Density is currently ${density}.`}
              href="/settings/preferences"
              isActive={activeTab === 'preferences'}
              onNavigate={closeSettingsModal}
            />
            <QuickSettingRow
              icon={Blocks}
              title="Provider readiness"
              detail="Check model, extraction, and generation credentials."
              href="/settings/providers"
              isActive={activeTab === 'providers'}
              onNavigate={closeSettingsModal}
            />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[var(--stroke-divider)] px-5 py-4">
            <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
              <Settings className="h-3.5 w-3.5" />
              Full configuration stays in Settings.
            </div>
            <Link
              href="/settings"
              onClick={closeSettingsModal}
              className="rounded-lg bg-[var(--accent-commit)] px-3 py-2 text-xs font-semibold text-[var(--on-accent)] transition-opacity hover:opacity-90"
            >
              Open full settings
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface QuickSettingRowProps {
  icon: typeof User;
  title: string;
  detail: string;
  href: string;
  isActive?: boolean;
  onNavigate: () => void;
}

function QuickSettingRow({
  icon: Icon,
  title,
  detail,
  href,
  isActive,
  onNavigate,
}: QuickSettingRowProps) {
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-[var(--hover-bg)]',
        isActive && 'bg-[var(--hover-bg)] ring-1 ring-[var(--ring)]/35'
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] text-[var(--text-secondary)]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[var(--text-primary)]">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-[var(--text-secondary)]">{detail}</span>
      </span>
    </Link>
  );
}
