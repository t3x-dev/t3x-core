// @ts-nocheck — tree-primary migration: needs rework
'use client';

import { History } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

interface FrameHistoryPopoverProps {
  frameId: string;
}

const SOURCE_LABELS: Record<string, string> = {
  pipeline: 'AI',
  manual: 'Manual',
  answer: 'Answer',
  collapse: 'Collapse',
  commit_marker: 'Commit',
  compress: 'Compress',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function FrameHistoryPopover({ frameId }: FrameHistoryPopoverProps) {
  const deltaLog = useExtractionPanelStore((s) => s.deltaLog);

  // Filter entries that affect this frame
  const entries = deltaLog.filter((entry) =>
    entry.delta.changes.some(
      (c) =>
        (c.action === 'add' && c.frame.id === frameId) ||
        (c.action !== 'add' && c.target === frameId)
    )
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded p-0.5 text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          aria-label="Frame history"
        >
          <History className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          History
        </p>

        {entries.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">No changes recorded</p>
        ) : (
          <ol className="relative border-l border-[var(--stroke-default)] pl-4">
            {entries.map((entry) => {
              const changes = entry.delta.changes.filter(
                (c) =>
                  (c.action === 'add' && c.frame.id === frameId) ||
                  (c.action !== 'add' && c.target === frameId)
              );
              const action = changes[0]?.action ?? 'update';
              const sourceLabel = SOURCE_LABELS[entry.source] ?? entry.source;

              return (
                <li key={entry.id} className="mb-3 last:mb-0">
                  {/* Timeline dot */}
                  <span className="absolute -left-[5px] mt-0.5 h-2.5 w-2.5 rounded-full border border-[var(--stroke-default)] bg-[var(--surface-panel)]" />

                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-[var(--hover-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                      {sourceLabel}
                    </span>
                    <span className="text-[10px] text-[var(--text-tertiary)]">
                      {formatTime(entry.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs capitalize text-[var(--text-primary)]">{action}</p>
                </li>
              );
            })}
          </ol>
        )}
      </PopoverContent>
    </Popover>
  );
}
