'use client';

import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { Box, Link as LinkIcon, Paperclip, Shield } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { FrameNodeData } from './frameGraphUtils';

// ── Extended node data with delta state markers ──

interface FrameNodeDataWithState extends FrameNodeData {
  state?: 'added' | 'updated' | 'removed' | 'conflict';
  updatedSlots?: string[];
}

type FrameNodeProps = NodeProps & { data: FrameNodeDataWithState };

// ── Helpers ──

/** Convert snake_case to Title Case: "travel_plan" → "Travel Plan" */
function toTitleCase(s: string): string {
  return s
    .split('_')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

/** Format a number with locale separators */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

/** Truncate string to maxLen, appending ellipsis */
function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}

// ── Slot value renderer ──

function isSlotRef(v: unknown): v is { ref: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'ref' in v &&
    typeof (v as { ref: unknown }).ref === 'string'
  );
}

function isInlineFrame(v: unknown): v is { type: string; slots: Record<string, unknown> } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'type' in v &&
    'slots' in v &&
    typeof (v as { type: unknown }).type === 'string'
  );
}

function SlotValueDisplay({ value }: { value: unknown }) {
  if (typeof value === 'string') {
    const display = truncate(value, 30);
    return (
      <span className="text-foreground" title={value.length > 30 ? value : undefined}>
        &quot;{display}&quot;
      </span>
    );
  }

  if (typeof value === 'number') {
    return <span className="text-blue-600 dark:text-blue-400">{formatNumber(value)}</span>;
  }

  if (isSlotRef(value)) {
    return (
      <span className="text-purple-600 dark:text-purple-400 inline-flex items-center gap-0.5">
        <LinkIcon className="h-3 w-3" />
        <span>{value.ref}</span>
      </span>
    );
  }

  if (isInlineFrame(value)) {
    const slotCount = Object.keys(value.slots).length;
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <span>▶</span>
        <span>
          {toTitleCase(value.type)} ({slotCount} slot{slotCount !== 1 ? 's' : ''})
        </span>
      </span>
    );
  }

  if (Array.isArray(value)) {
    return (
      <span className="flex flex-col gap-0.5">
        {value.map((item, i) => (
          <span key={`item-${i}`} className="flex items-start gap-1">
            <span className="text-muted-foreground">•</span>
            <SlotValueDisplay value={item} />
          </span>
        ))}
      </span>
    );
  }

  // fallback
  return <span className="text-muted-foreground">{String(value)}</span>;
}

// ── FrameNode Component ──

function FrameNodeComponent({ data, selected }: FrameNodeProps) {
  const { frameType, slots, source, confidence, state, updatedSlots } = data;
  const updatedSet = new Set(updatedSlots ?? []);

  // State-based container classes
  const stateClasses = cn(
    // Base
    'rounded-lg border bg-white dark:bg-zinc-900 shadow-sm min-w-[200px] max-w-[320px]',
    // Normal border
    !state && !selected && 'border-zinc-200 dark:border-zinc-700',
    // Selected
    selected && 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30',
    // State markers
    state === 'added' && 'border-l-4 border-l-green-500',
    state === 'updated' && 'border-l-4 border-l-orange-500',
    state === 'removed' && 'opacity-40 line-through',
    state === 'conflict' && 'border-2 border-red-500'
  );

  return (
    <div className={stateClasses}>
      {/* Connection handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-zinc-400 dark:!bg-zinc-500"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-zinc-400 dark:!bg-zinc-500"
      />

      {/* Title bar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 rounded-t-lg border-b border-zinc-200 dark:border-zinc-700">
        <Box className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" />
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
          {toTitleCase(frameType)}
        </span>
      </div>

      {/* Slots area */}
      {Object.keys(slots).length > 0 && (
        <div className="px-3 py-2 space-y-1 border-b border-zinc-100 dark:border-zinc-800">
          {Object.entries(slots).map(([key, value]) => (
            <div
              key={key}
              className={cn(
                'flex items-start gap-1.5 text-xs font-mono',
                updatedSet.has(key) && 'bg-orange-50 dark:bg-orange-950/30 -mx-1 px-1 rounded'
              )}
            >
              <span className="text-zinc-500 dark:text-zinc-400 shrink-0">{key}:</span>
              <SlotValueDisplay value={value} />
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {(source || confidence !== undefined) && (
        <div className="flex items-center justify-between px-3 py-1 text-[10px] text-zinc-400 dark:text-zinc-500">
          {source && (
            <span className="inline-flex items-center gap-0.5">
              <Paperclip className="h-2.5 w-2.5" />
              <span>{source}</span>
            </span>
          )}
          {confidence !== undefined && (
            <span className="inline-flex items-center gap-0.5">
              <Shield className="h-2.5 w-2.5" />
              <span>{confidence.toFixed(2)}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export const FrameNode = memo(FrameNodeComponent);
