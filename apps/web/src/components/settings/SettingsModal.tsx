'use client';

import { Blocks, CircleUserRound, SlidersHorizontal, X } from 'lucide-react';
import { ModalProvidersPanel } from '@/components/settings/ModalProvidersPanel';
import { PreferencesSettingsPanel } from '@/components/settings/PreferencesSettingsPanel';
import { ProfileSettingsPanel } from '@/components/settings/ProfileSettingsPanel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type SettingsModalTab, useSettingsModalStore } from '@/store/settingsModalStore';
import { cn } from '@/utils/cn';

const TAB_CONFIG: Array<{
  icon: typeof CircleUserRound;
  label: string;
  value: SettingsModalTab;
}> = [
  {
    value: 'profile',
    label: 'Profile',
    icon: CircleUserRound,
  },
  {
    value: 'preferences',
    label: 'Preferences',
    icon: SlidersHorizontal,
  },
  {
    value: 'providers',
    label: 'Providers',
    icon: Blocks,
  },
];

export function SettingsModal() {
  const isOpen = useSettingsModalStore((state) => state.isOpen);
  const selectedTab = useSettingsModalStore((state) => state.selectedTab);
  const close = useSettingsModalStore((state) => state.close);
  const setSelectedTab = useSettingsModalStore((state) => state.setSelectedTab);

  return (
    <Dialog open={isOpen} onOpenChange={(nextOpen) => (!nextOpen ? close() : undefined)}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/35 backdrop-blur-[6px] dark:bg-black/20 dark:backdrop-blur-[10px]"
        className="h-[min(620px,calc(100vh-2rem))] w-[min(680px,calc(100vw-1.5rem))] max-w-none overflow-hidden border-[var(--stroke-divider)] bg-background/95 p-0 backdrop-blur-md dark:border-[var(--stroke-divider)] dark:bg-[var(--surface-panel)]"
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Global settings modal with profile, preferences, and providers tabs.
        </DialogDescription>

        <Tabs
          value={selectedTab}
          onValueChange={(value) => setSelectedTab(value as SettingsModalTab)}
          orientation="vertical"
          className="grid h-full min-h-0 gap-0 md:grid-cols-[148px_minmax(0,1fr)]"
        >
          <aside className="border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)]/70 md:border-r md:border-b-0">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-3 py-3">
              <h2 className="text-sm font-semibold text-foreground">Settings</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={close}
                aria-label="Close settings"
                className="h-7 w-7 shrink-0 rounded-md"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <TabsList
              aria-label="Settings sections"
              className="flex h-auto w-full flex-col items-stretch gap-1 bg-transparent p-2"
            >
              {TAB_CONFIG.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  onClick={() => setSelectedTab(tab.value)}
                  className={cn(
                    'h-9 w-full justify-start gap-2 rounded-lg border border-transparent px-2.5 py-2 text-left',
                    'data-[state=active]:border-[var(--stroke-strong)] data-[state=active]:bg-background data-[state=active]:shadow-sm',
                    'dark:data-[state=active]:border-[var(--stroke-strong)]'
                  )}
                >
                  <tab.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-xs font-medium">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </aside>

          <div className="flex min-h-0 h-full flex-col">
            <TabsContent
              value="profile"
              className="m-0 flex h-full flex-1 flex-col overflow-y-auto"
            >
              <ProfileSettingsPanel />
            </TabsContent>
            <TabsContent
              value="preferences"
              className="m-0 flex h-full flex-1 flex-col overflow-y-auto"
            >
              <PreferencesSettingsPanel />
            </TabsContent>
            <TabsContent
              value="providers"
              className="m-0 flex h-full flex-1 flex-col overflow-y-auto"
            >
              <ModalProvidersPanel />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
