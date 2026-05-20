'use client';

import { Settings, SlidersHorizontal, User } from 'lucide-react';
import { PreferencesSettingsPanel } from '@/components/settings/PreferencesSettingsPanel';
import { ProfileSettingsPanel } from '@/components/settings/ProfileSettingsPanel';
import { ProvidersSettingsPanel } from '@/components/settings/ProvidersSettingsPanel';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type SettingsModalTab, useSettingsModalStore } from '@/store/settingsModalStore';
import { cn } from '@/utils/cn';

const SETTINGS_TABS: Array<{
  value: SettingsModalTab;
  label: string;
  icon: typeof User;
}> = [
  { value: 'profile', label: 'Profile', icon: User },
  { value: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
  { value: 'providers', label: 'Providers', icon: Settings },
];

export function SettingsModal() {
  const isOpen = useSettingsModalStore((state) => state.isOpen);
  const activeTab = useSettingsModalStore((state) => state.activeTab);
  const closeSettingsModal = useSettingsModalStore((state) => state.closeSettingsModal);
  const setActiveTab = useSettingsModalStore((state) => state.setActiveTab);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeSettingsModal()}>
      <DialogContent className="h-[94vh] w-[96vw] max-w-[1760px] sm:max-w-[1760px] overflow-hidden border-0 bg-transparent p-0 shadow-none">
        <div
          data-testid="settings-modal-shell"
          className="flex h-full overflow-hidden rounded-[34px] border border-[var(--stroke-divider)] bg-[color-mix(in_srgb,var(--surface-panel)_96%,white_4%)] shadow-[var(--fx-shadow-lg)]"
        >
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as SettingsModalTab)}
            className="flex h-full min-h-0 flex-1 flex-row gap-0"
          >
            <div
              data-testid="settings-modal-rail"
              className="flex w-[250px] shrink-0 flex-col border-r border-[var(--stroke-divider)] bg-[color-mix(in_srgb,var(--surface-app)_92%,white_8%)] px-4 py-5"
            >
              <div className="px-1 pb-5">
                <DialogTitle className="text-[15px] font-semibold text-[var(--text-primary)]">
                  Settings
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs text-[var(--text-tertiary)]">
                  Configure your workspace, preferences, and providers.
                </DialogDescription>
              </div>

              <TabsList className="h-auto w-full shrink-0 flex-col items-stretch justify-start gap-1 rounded-none bg-transparent p-0">
                {SETTINGS_TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className={cn(
                        'h-11 w-full justify-start gap-3 rounded-xl border border-transparent px-3 text-sm font-medium text-[var(--text-secondary)]',
                        'data-[state=active]:bg-[color-mix(in_srgb,var(--surface-panel)_85%,transparent)] data-[state=active]:text-[var(--text-primary)]'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="truncate">{tab.label}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            <div
              data-testid="settings-modal-panel"
              className="min-w-0 flex-1 bg-[var(--surface-card)]"
            >
              <TabsContent value="profile" className="m-0 h-full overflow-y-auto">
                <section
                  data-testid="settings-modal-canvas"
                  className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-10 py-12"
                >
                  <div className="mb-8">
                    <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                      Profile
                    </h2>
                  </div>
                  <ProfileSettingsPanel />
                </section>
              </TabsContent>
              <TabsContent value="preferences" className="m-0 h-full overflow-y-auto">
                <section
                  data-testid="settings-modal-canvas"
                  className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-10 py-12"
                >
                  <div className="mb-8">
                    <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                      Preferences
                    </h2>
                  </div>
                  <PreferencesSettingsPanel />
                </section>
              </TabsContent>
              <TabsContent value="providers" className="m-0 h-full overflow-y-auto">
                <section
                  data-testid="settings-modal-canvas"
                  className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-10 py-12"
                >
                  <div className="mb-8">
                    <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                      Providers
                    </h2>
                  </div>
                  <ProvidersSettingsPanel />
                </section>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
