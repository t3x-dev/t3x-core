import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SchemaFamilyPreview } from '@/types/schemas';

interface SchemaFamilyTabsProps {
  activeFamilyId: string;
  families: SchemaFamilyPreview[];
  onSelectFamily: (familyId: string) => void;
}

export function SchemaFamilyTabs({
  activeFamilyId,
  families,
  onSelectFamily,
}: SchemaFamilyTabsProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 overflow-hidden border-t border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 pt-2.5 min-[721px]:flex-row min-[721px]:items-end min-[721px]:gap-5">
      <p className="pb-2.5 text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-tertiary)] min-[721px]:w-[92px]">
        Schema family
      </p>
      <Tabs className="min-w-0 flex-1 gap-0" onValueChange={onSelectFamily} value={activeFamilyId}>
        <TabsList
          aria-label="Schema families"
          aria-orientation="horizontal"
          className="flex h-auto w-full max-w-full justify-start gap-5 overflow-x-auto overscroll-x-contain rounded-none bg-transparent p-0 text-[var(--text-secondary)] shadow-none dark:rounded-none dark:border-0 dark:bg-transparent dark:p-0"
        >
          {families.map((family) => {
            const currentRelease = family.releases.find(
              (release) => release.id === family.currentReleaseId && release.status === 'active'
            );

            return (
              <TabsTrigger
                aria-label={`${family.name} ${currentRelease?.version ?? 'no current version'}`}
                className="h-[42px] flex-none whitespace-nowrap rounded-none border-0 border-b-2 border-b-transparent bg-transparent px-0 py-0 text-[13px] [font-weight:650] text-[var(--text-secondary)] shadow-none hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-commit)] focus-visible:ring-offset-2 data-[state=active]:border-b-[var(--accent-commit)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-none dark:px-0 dark:py-0 dark:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]"
                key={family.id}
                value={family.id}
              >
                <span>{family.name}</span>
                <Badge
                  className="font-mono text-[10px]"
                  variant={family.id === activeFamilyId ? 'commit' : 'outline'}
                >
                  {currentRelease?.version ?? 'no current'}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </div>
  );
}
