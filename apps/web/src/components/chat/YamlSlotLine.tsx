'use client';

/**
 * YamlSlotLine — Single slot row with 6 CSS-driven visual states
 *
 * States: default | hover (CSS) | editing | saved | deleted | added
 * Performance: hover ✕ uses group-hover:opacity-100 (zero React re-renders).
 */

import { Undo2, X } from 'lucide-react';
import { useCallback } from 'react';
import { useInlineEdit } from '@/hooks/useInlineEdit';
import { useSlotActions } from '@/hooks/useSlotActions';
import { useCommandStore } from '@/store/commandStore';

export interface SlotChange {
  type: 'edited' | 'deleted' | 'added';
  oldValue?: string;
}

interface YamlSlotLineProps {
  nodeId: string;
  slotKey: string;
  value: string;
  change?: SlotChange;
}

const MONO = { fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 11 } as const;

export function YamlSlotLine({ nodeId, slotKey, value, change }: YamlSlotLineProps) {
  const { isEditing, inputRef, startEdit, cancelEdit, onKeyDown } = useInlineEdit(nodeId, slotKey);
  const { deleteSlot } = useSlotActions();
  const undo = useCommandStore((s) => s.undo);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      deleteSlot(nodeId, slotKey);
    },
    [nodeId, slotKey, deleteSlot]
  );

  const handleUndo = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      undo();
    },
    [undo]
  );

  // ── Deleted state ──
  if (change?.type === 'deleted') {
    return (
      <div className="group flex items-stretch" style={{ minHeight: 26 }}>
        <div className="shrink-0 w-1 bg-red-400" />
        <div className="flex-1 min-w-0 flex items-center gap-1 px-2 py-0.5" style={MONO}>
          <span className="text-[var(--text-tertiary)] line-through opacity-50 truncate">
            {'  '}
            {slotKey}: {value}
          </span>
          <button
            type="button"
            onClick={handleUndo}
            className="shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <Undo2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  // ── Editing state ──
  if (isEditing) {
    return (
      <div className="flex items-stretch" style={{ minHeight: 26 }}>
        <div className="shrink-0 w-1 bg-purple-400" />
        <div className="flex-1 min-w-0 flex items-center gap-1 px-2 py-0.5 bg-purple-400/[0.06]" style={MONO}>
          <span className="shrink-0 text-[var(--text-secondary)]">
            {'  '}
            {slotKey}:{' '}
          </span>
          <input
            ref={inputRef}
            defaultValue={value}
            onKeyDown={onKeyDown}
            onBlur={() => cancelEdit()}
            className="flex-1 min-w-0 bg-transparent border-0 border-b-[1.5px] border-b-purple-400 outline-none text-[var(--text-primary)]"
            style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
          />
          <span className="shrink-0 text-[8px] text-[var(--text-tertiary)] whitespace-nowrap">
            Enter ↵ · Esc ✕
          </span>
        </div>
      </div>
    );
  }

  // ── Saved (edited) state ──
  if (change?.type === 'edited') {
    return (
      <div className="group flex items-stretch" style={{ minHeight: 26 }}>
        <div className="shrink-0 w-1 bg-green-400" />
        <div
          className="flex-1 min-w-0 flex items-center gap-1 px-2 py-0.5 bg-green-400/5 cursor-text"
          style={MONO}
          onClick={startEdit}
        >
          <span className="shrink-0 text-[var(--text-secondary)]">
            {'  '}
            {slotKey}:{' '}
          </span>
          <span className="text-red-400/60 line-through mr-1 truncate">{change.oldValue}</span>
          <span className="text-green-400 truncate">{value}</span>
          <button
            type="button"
            onClick={handleUndo}
            className="shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <Undo2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  // ── Added state ──
  if (change?.type === 'added') {
    return (
      <div className="group flex items-stretch" style={{ minHeight: 26 }}>
        <div className="shrink-0 w-1 bg-blue-400" />
        <div
          className="flex-1 min-w-0 flex items-center gap-1 px-2 py-0.5 cursor-text bg-blue-400/5"
          style={MONO}
          onClick={startEdit}
        >
          <span className="text-blue-400 truncate">
            {'  '}
            {slotKey}: {value}
          </span>
          <span className="shrink-0 text-[8px] text-blue-400 bg-blue-400/15 px-1 py-0.5 rounded ml-1">
            manual
          </span>
        </div>
      </div>
    );
  }

  // ── Default state (with hover ✕) ──
  return (
    <div className="group flex items-stretch" style={{ minHeight: 26 }}>
      <div className="shrink-0 w-1 bg-green-400 group-hover:bg-yellow-400 transition-colors" />
      <div
        className="flex-1 min-w-0 flex items-center gap-1 px-2 py-0.5 cursor-text group-hover:bg-white/[0.04] transition-colors"
        style={MONO}
        onClick={startEdit}
      >
        <span className="shrink-0 text-[var(--text-secondary)]">
          {'  '}
          {slotKey}:{' '}
        </span>
        <span className="text-[var(--text-primary)] truncate">{value}</span>
        <button
          type="button"
          onClick={handleDelete}
          className="shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-tertiary)] hover:text-red-400 cursor-pointer"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
