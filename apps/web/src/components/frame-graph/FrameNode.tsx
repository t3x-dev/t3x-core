'use client';

import type { SlotValue } from '@t3x/core';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { Box, Link as LinkIcon, Paperclip, Shield } from 'lucide-react';
import { memo, useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { FrameNodeData } from './frameGraphUtils';

// ── Extended node data with delta state markers + edit callbacks ──

interface FrameNodeDataWithState extends FrameNodeData {
  state?: 'added' | 'updated' | 'removed' | 'conflict';
  updatedSlots?: string[];
  onSlotEdit?: (frameId: string, key: string, value: SlotValue) => void;
  onTypeEdit?: (frameId: string, newType: string) => void;
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

/** Convert a user-entered string back to snake_case */
function toSnakeCase(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_');
}

/** Format a number with locale separators */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

/** Truncate string to maxLen, appending ellipsis */
function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}

/** Parse a string as a number if it looks numeric, otherwise return as string */
function parseSlotValue(raw: string): SlotValue {
  const trimmed = raw.trim();
  if (trimmed === '') return trimmed;
  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== '') return num;
  return trimmed;
}

// ── Inline Editable Text ──

function InlineEdit({
  value,
  onCommit,
  className,
  inputClassName,
}: {
  value: string;
  onCommit: (newValue: string) => void;
  className?: string;
  inputClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(() => {
    setDraft(value);
    setEditing(true);
    // Focus after React renders the input
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [value]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onCommit(trimmed);
    }
  }, [draft, value, onCommit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
      } else if (e.key === 'Escape') {
        setEditing(false);
        setDraft(value);
      }
    },
    [commitEdit, value]
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={handleKeyDown}
        className={cn(
          'bg-white dark:bg-zinc-800 border border-blue-400 rounded px-1 py-0 text-xs outline-none w-full min-w-[60px]',
          inputClassName
        )}
        // Prevent ReactFlow from capturing key events
        onMouseDown={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className={cn(
        'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded px-0.5',
        className
      )}
      onDoubleClick={startEdit}
      title="Double-click to edit"
    >
      {value}
    </span>
  );
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

// ── Editable slot value ──

function EditableSlotValue({
  frameId,
  slotKey,
  value,
  onSlotEdit,
}: {
  frameId: string;
  slotKey: string;
  value: unknown;
  onSlotEdit?: (frameId: string, key: string, value: SlotValue) => void;
}) {
  // Only string and number values are inline-editable
  const editable = onSlotEdit && (typeof value === 'string' || typeof value === 'number');

  if (!editable) {
    return <SlotValueDisplay value={value} />;
  }

  const displayStr = typeof value === 'string' ? value : String(value);

  return (
    <InlineEdit
      value={displayStr}
      onCommit={(newVal) => onSlotEdit(frameId, slotKey, parseSlotValue(newVal))}
      className="text-foreground"
    />
  );
}

// ── FrameNode Component ──

function FrameNodeComponent({ data, selected, id }: FrameNodeProps) {
  const { frameType, slots, source, confidence, state, updatedSlots, onSlotEdit, onTypeEdit } =
    data;
  const updatedSet = new Set(updatedSlots ?? []);

  // State-based container classes
  const stateClasses = cn(
    // Base
    'relative overflow-visible rounded-lg border bg-white dark:bg-zinc-900 shadow-sm min-w-[200px] max-w-[320px]',
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

  // Inline style for the origin-pulse glow on newly added nodes
  const addedGlowStyle: React.CSSProperties | undefined =
    state === 'added'
      ? {
          boxShadow: '0 0 12px 2px rgba(34, 197, 94, 0.5)',
          animation: 'frameOriginPulse 2s ease-out forwards',
        }
      : undefined;

  const handleTypeCommit = useCallback(
    (newTitle: string) => {
      const newType = toSnakeCase(newTitle);
      if (newType && newType !== frameType) {
        onTypeEdit?.(id, newType);
      }
    },
    [id, frameType, onTypeEdit]
  );

  return (
    <div className={stateClasses} style={addedGlowStyle}>
      {/* Gate status badge */}
      {data.gateStatus === 'warning' && (
        <div
          className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-amber-500 flex items-center justify-center z-10"
          title={data.gateIssueSummary ?? 'Quality warning'}
          aria-label={`${data.gateIssueCount ?? 0} quality warnings`}
        >
          <span className="text-[8px] text-white font-bold">{data.gateIssueCount ?? '!'}</span>
        </div>
      )}
      {data.gateStatus === 'error' && (
        <div
          className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-500 flex items-center justify-center z-10"
          title={data.gateIssueSummary ?? 'Quality error'}
          aria-label={`${data.gateIssueCount ?? 0} quality errors`}
        >
          <span className="text-[8px] text-white font-bold">{data.gateIssueCount ?? '!'}</span>
        </div>
      )}
      {/* Keyframe for origin pulse glow */}
      {state === 'added' && (
        <style>{`
          @keyframes frameOriginPulse {
            0% { box-shadow: 0 0 12px 2px rgba(34, 197, 94, 0.5); }
            50% { box-shadow: 0 0 18px 4px rgba(34, 197, 94, 0.35); }
            100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
          }
        `}</style>
      )}
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
        {onTypeEdit ? (
          <InlineEdit
            value={toTitleCase(frameType)}
            onCommit={handleTypeCommit}
            className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate"
            inputClassName="text-sm font-medium"
          />
        ) : (
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
            {toTitleCase(frameType)}
          </span>
        )}
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
              <EditableSlotValue frameId={id} slotKey={key} value={value} onSlotEdit={onSlotEdit} />
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
