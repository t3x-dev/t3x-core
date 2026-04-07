'use client';

import type { SlotConflict, SlotValue } from '@t3x-dev/core';
import { AlertTriangle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type SlotChoice, formatSlotValue } from './mergeViewHelpers';

export function SlotConflictRow({
  conflict,
  choice,
  onChoose,
}: {
  conflict: SlotConflict;
  choice: SlotChoice | undefined;
  onChoose: (key: string, choice: SlotChoice) => void;
}) {
  return (
    <div className="rounded border border-[var(--status-error)]/30 bg-[var(--status-error-muted)] p-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--status-error)]">
        <AlertTriangle className="h-3 w-3" />
        <span className="font-mono">{conflict.key}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Source (Branch A) */}
        <button
          type="button"
          onClick={() => onChoose(conflict.key, 'source')}
          className={cn(
            'text-left rounded border p-2 text-xs transition-colors cursor-pointer',
            choice === 'source'
              ? 'border-[var(--status-info)] bg-[var(--status-info-muted)] ring-1 ring-[var(--status-info)]'
              : 'border-zinc-200 dark:border-zinc-700 hover:border-[var(--status-info)]/50'
          )}
        >
          <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-0.5">
            Branch A (Source)
          </div>
          <div className="font-mono text-foreground">{formatSlotValue(conflict.sourceValue)}</div>
        </button>

        {/* Target (Branch B) */}
        <button
          type="button"
          onClick={() => onChoose(conflict.key, 'target')}
          className={cn(
            'text-left rounded border p-2 text-xs transition-colors cursor-pointer',
            choice === 'target'
              ? 'border-[var(--status-info)] bg-[var(--status-info-muted)] ring-1 ring-[var(--status-info)]'
              : 'border-zinc-200 dark:border-zinc-700 hover:border-[var(--status-info)]/50'
          )}
        >
          <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-0.5">
            Branch B (Target)
          </div>
          <div className="font-mono text-foreground">{formatSlotValue(conflict.targetValue)}</div>
        </button>
      </div>
    </div>
  );
}

export function AgreedSlotRow({ slotKey, value }: { slotKey: string; value: SlotValue }) {
  return (
    <div className="flex items-start gap-1.5 text-xs font-mono px-1">
      <Check className="h-3 w-3 text-[var(--status-success)] mt-0.5 shrink-0" />
      <span className="text-zinc-500 dark:text-zinc-400 shrink-0">{slotKey}:</span>
      <span className="text-foreground">{formatSlotValue(value)}</span>
    </div>
  );
}
