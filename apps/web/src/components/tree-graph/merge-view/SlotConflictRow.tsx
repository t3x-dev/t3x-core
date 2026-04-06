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
    <div className="rounded border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30 p-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
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
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-500'
              : 'border-zinc-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-700'
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
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-500'
              : 'border-zinc-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-700'
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
      <Check className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
      <span className="text-zinc-500 dark:text-zinc-400 shrink-0">{slotKey}:</span>
      <span className="text-foreground">{formatSlotValue(value)}</span>
    </div>
  );
}
