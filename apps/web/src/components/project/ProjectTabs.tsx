import {
  BookOpen,
  Boxes,
  FileCheck2,
  GitCommitHorizontal,
  MessageCircle,
  PanelTop,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { PROJECT_TABS, type ProjectTabId } from '@/components/project/projectTabModel';
import { cn } from '@/utils/cn';

const tabIcons: Record<ProjectTabId, ComponentType<{ className?: string }>> = {
  overview: BookOpen,
  state: GitCommitHorizontal,
  schemas: ShieldCheck,
  workspaces: Boxes,
  reviews: FileCheck2,
  outputs: PanelTop,
  community: MessageCircle,
  settings: Settings,
};

export interface ProjectTabsProps {
  activeTab: ProjectTabId;
  onTabChange: (tab: ProjectTabId) => void;
}

export function ProjectTabs({ activeTab, onTabChange }: ProjectTabsProps) {
  return (
    <div
      aria-label="Project views"
      className="flex min-h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3"
      role="tablist"
    >
      {PROJECT_TABS.map((tab) => {
        const Icon = tabIcons[tab.id];
        const selected = activeTab === tab.id;

        return (
          <button
            aria-label={tab.label}
            aria-selected={selected}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--status-info)]/30',
              selected
                ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
            )}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            role="tab"
            type="button"
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
