'use client';

import type { LucideIcon } from 'lucide-react';
import {
  ChevronDown,
  FileText,
  GitBranch,
  GitPullRequest,
  ListTree,
  SquarePen,
} from 'lucide-react';
import { cn } from '@/utils/cn';

export type WorkspaceRailId = 'compose' | 'review' | 'structure' | 'render';

interface WorkspaceReviewLeftRailProps {
  active: WorkspaceRailId;
  availableBranches: string[];
  branchSelectorDisabled: boolean;
  onBranchChange?: (branch: string) => Promise<void> | void;
  onSelect: (id: WorkspaceRailId) => void;
  selectedBranch: string;
}

const RAIL_ITEMS: Array<{ icon: LucideIcon; id: WorkspaceRailId; label: string }> = [
  { id: 'compose', icon: SquarePen, label: 'Compose' },
  { id: 'review', icon: GitPullRequest, label: 'Review' },
  { id: 'structure', icon: ListTree, label: 'Structure diff' },
  { id: 'render', icon: FileText, label: 'Render' },
];

export function WorkspaceReviewLeftRail({
  active,
  availableBranches,
  branchSelectorDisabled,
  onBranchChange,
  onSelect,
  selectedBranch,
}: WorkspaceReviewLeftRailProps) {
  return (
    <nav
      aria-label="Workspace workflow"
      className="flex h-full w-[176px] shrink-0 flex-col border-r border-[#E7EAEF] bg-[var(--surface-card)] px-2.5 py-3"
    >
      <div className="relative mb-3">
        <GitBranch
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--accent-branch)] opacity-90"
        />
        <select
          aria-label="Branch workspace"
          className="h-8 w-full appearance-none rounded-[8px] border border-[#E1E4EA] bg-white pl-8 pr-7 text-[13px] font-semibold text-[#374151] shadow-[0_1px_2px_rgba(16,24,40,.04)] outline-none transition-colors hover:border-[var(--stroke-strong)] focus-visible:border-[var(--accent-commit)] focus-visible:ring-2 focus-visible:ring-[var(--accent-commit)]/20 disabled:cursor-default disabled:opacity-100"
          disabled={branchSelectorDisabled}
          onChange={(event) => {
            const nextBranch = event.target.value;
            if (nextBranch !== selectedBranch) void onBranchChange?.(nextBranch);
          }}
          value={selectedBranch}
        >
          {availableBranches.map((branch) => (
            <option key={branch} value={branch}>
              {branch}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#9CA3AF]"
        />
      </div>

      <div aria-label="Workspace workflow tabs" className="flex flex-col gap-0.5" role="tablist">
        {RAIL_ITEMS.map((item) => {
          const selected = item.id === active;
          const Icon = item.icon;
          return (
            <button
              aria-label={item.label}
              aria-selected={selected}
              className={cn(
                'relative flex h-9 w-full items-center gap-2.5 rounded-[8px] px-3 text-left text-[13.5px] transition-colors',
                selected
                  ? "bg-[#F3F4F6] font-semibold text-[#111827] before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r-[2px] before:bg-[#2563EB] before:content-['']"
                  : 'font-medium text-[#4B5563] hover:bg-[#F9FAFB] hover:text-[#111827]'
              )}
              key={item.id}
              onClick={() => onSelect(item.id)}
              role="tab"
              type="button"
            >
              <Icon
                aria-hidden="true"
                className={cn('size-4 shrink-0', selected ? 'text-[#2563EB]' : 'text-[#6B7280]')}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
