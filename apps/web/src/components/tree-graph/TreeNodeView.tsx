'use client';

import type { SlotValue } from '@t3x-dev/core';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { Box, Link as LinkIcon, Paperclip } from 'lucide-react';
import { memo, useCallback, useRef, useState } from 'react';
import { truncate } from '@/domain/format/truncate';
import { cn } from '@/lib/utils';
import type { TreeNodeData } from './treeGraphUtils';

// ── Extended node data with delta state markers + edit callbacks ──

interface TreeNodeDataWithState extends TreeNodeData {
  state?: 'added' | 'updated' | 'removed' | 'conflict';
  updatedSlots?: string[];
  onSlotEdit?: (treeId: string, key: string, value: SlotValue) => void;
  onTypeEdit?: (treeId: string, newType: string) => void;
}

type TreeNodeProps = NodeProps & { data: TreeNodeDataWithState };

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
          'bg-white dark:bg-zinc-800 border border-[var(--status-info)] rounded px-1 py-0 text-xs outline-none w-full min-w-[60px]',
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
        'cursor-pointer hover:bg-[var(--hover-bg)] rounded px-0.5',
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

function isInlineNode(v: unknown): v is { type: string; slots: Record<string, unknown> } {
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
    return <span className="text-[var(--status-info)]">{formatNumber(value)}</span>;
  }

  if (isSlotRef(value)) {
    return (
      <span className="text-[var(--source)] inline-flex items-center gap-0.5">
        <LinkIcon className="h-3 w-3" />
        <span>{value.ref}</span>
      </span>
    );
  }

  if (isInlineNode(value)) {
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
  treeId,
  slotKey,
  value,
  onSlotEdit,
}: {
  treeId: string;
  slotKey: string;
  value: unknown;
  onSlotEdit?: (treeId: string, key: string, value: SlotValue) => void;
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
      onCommit={(newVal) => onSlotEdit(treeId, slotKey, parseSlotValue(newVal))}
      className="text-foreground"
    />
  );
}

// ── TreeNodeView Component ──

function TreeNodeComponent({ data, selected, id }: TreeNodeProps) {
  const { treeType, slots, source, state, updatedSlots, onSlotEdit, onTypeEdit } =
    data;
  const updatedSet = new Set(updatedSlots ?? []);

  // State-based container classes
  const stateClasses = cn(
    // Base
    'relative overflow-visible rounded-lg border bg-white dark:bg-zinc-900 shadow-sm min-w-[200px] max-w-[320px]',
    // Normal border
    !state && !selected && 'border-zinc-200 dark:border-zinc-700',
    // Selected
    selected && 'border-[var(--status-info)] bg-[var(--status-info-muted)]',
    // State markers
    state === 'added' && 'border-l-4 border-l-[var(--status-success)]',
    state === 'updated' && 'border-l-4 border-l-[var(--accent-pending)]',
    state === 'removed' && 'opacity-40 line-through',
    state === 'conflict' && 'border-2 border-[var(--status-error)]'
  );

  // Inline style for the origin-pulse glow on newly added nodes
  const addedGlowStyle: React.CSSProperties | undefined =
    state === 'added'
      ? {
          boxShadow: '0 0 12px 2px color-mix(in srgb, var(--status-success) 50%, transparent)',
          animation: 'frameOriginPulse 2s ease-out forwards',
        }
      : undefined;

  const handleTypeCommit = useCallback(
    (newTitle: string) => {
      const newType = toSnakeCase(newTitle);
      if (newType && newType !== treeType) {
        onTypeEdit?.(id, newType);
      }
    },
    [id, treeType, onTypeEdit]
  );

  return (
    <div className={stateClasses} style={addedGlowStyle}>
      {/* Keytree for origin pulse glow */}
      {state === 'added' && (
        <style>{`
          @keyframes frameOriginPulse {
            0% { box-shadow: 0 0 12px 2px color-mix(in srgb, var(--status-success) 50%, transparent); }
            50% { box-shadow: 0 0 18px 4px color-mix(in srgb, var(--status-success) 35%, transparent); }
            100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--status-success) 0%, transparent); }
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
            value={toTitleCase(treeType)}
            onCommit={handleTypeCommit}
            className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate"
            inputClassName="text-sm font-medium"
          />
        ) : (
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
            {toTitleCase(treeType)}
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
                updatedSet.has(key) && 'bg-[var(--status-warning-muted)] -mx-1 px-1 rounded'
              )}
            >
              <span className="text-zinc-500 dark:text-zinc-400 shrink-0">{key}:</span>
              <EditableSlotValue treeId={id} slotKey={key} value={value} onSlotEdit={onSlotEdit} />
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {source && (
        <div className="flex items-center justify-between px-3 py-1 text-[10px] text-zinc-400 dark:text-zinc-500">
          <span className="inline-flex items-center gap-0.5">
            <Paperclip className="h-2.5 w-2.5" />
            <span>{source}</span>
          </span>
        </div>
      )}
    </div>
  );
}

export const TreeNodeView = memo(TreeNodeComponent);
