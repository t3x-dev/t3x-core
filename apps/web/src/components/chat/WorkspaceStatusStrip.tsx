'use client';

import type {
  WorkspaceStatusSegment,
  WorkspaceWorkbenchView,
} from '@/domain/workspace/actionBarState';
import { cn } from '@/utils/cn';

interface WorkspaceStatusStripProps {
  segments: WorkspaceStatusSegment[];
  activeView: WorkspaceWorkbenchView;
  onSelectView: (view: WorkspaceWorkbenchView) => void;
}

function toneClass(segment: WorkspaceStatusSegment): string {
  switch (segment.tone) {
    case 'source':
      return 'text-[var(--source)]';
    case 'pending':
      return 'text-[var(--accent-pending)]';
    case 'commit':
      return 'text-[var(--accent-commit)]';
    case 'warning':
      return 'text-[var(--status-warning)]';
    case 'neutral':
      return 'text-[var(--text-secondary)]';
  }
}

export function WorkspaceStatusStrip({
  segments,
  activeView,
  onSelectView,
}: WorkspaceStatusStripProps) {
  return (
    <fieldset
      aria-label="Workspace status"
      className="m-0 grid min-w-0 grid-cols-5 border-0 border-b border-[var(--stroke-divider)] bg-[var(--panel)] p-0"
    >
      {segments.map((segment) => {
        const targetView = segment.targetView;
        const active = targetView !== null && targetView === activeView;
        const content = (
          <>
            <span className="truncate text-[9px] font-bold uppercase tracking-[0] text-[var(--text-tertiary)]">
              {segment.label}
            </span>
            <span
              className={cn('truncate font-mono text-[11px] font-semibold', toneClass(segment))}
            >
              {segment.value}
            </span>
          </>
        );
        const className = cn(
          'flex min-w-0 flex-col gap-0.5 border-r border-[var(--stroke-divider)] px-2.5 py-1.5 text-left last:border-r-0',
          toneClass(segment),
          active && 'bg-[var(--hover-bg)]',
          segment.targetView && 'transition-colors hover:bg-[var(--hover-bg)]'
        );

        if (!targetView) {
          return (
            <div
              key={segment.id}
              data-testid={`workspace-status-${segment.id}`}
              title={segment.detail ?? undefined}
              className={className}
            >
              {content}
            </div>
          );
        }

        return (
          <button
            key={segment.id}
            type="button"
            data-testid={`workspace-status-${segment.id}`}
            aria-current={active ? 'page' : undefined}
            aria-label={`${segment.label} ${segment.value}`}
            title={segment.detail ?? undefined}
            onClick={() => onSelectView(targetView)}
            className={className}
          >
            {content}
          </button>
        );
      })}
    </fieldset>
  );
}
