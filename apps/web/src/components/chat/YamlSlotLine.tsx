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
        <div
          className="flex-1 flex items-center gap-1 px-2 py-0.5"
          style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 11 }}
        >
          <span className="text-[var(--text-tertiary)] line-through opacity-50">
            {'  '}
            {slotKey}: {value}
          </span>
          <button
            type="button"
            onClick={handleUndo}
            className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
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
        <div
          className="flex-1 flex items-center gap-1 px-2 py-0.5"
          style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 11 }}
        >
          <span className="text-[var(--text-secondary)]">
            {'  '}
            {slotKey}:{' '}
          </span>
          <input
            ref={inputRef}
            defaultValue={value}
            onKeyDown={onKeyDown}
            onBlur={() => {
              // Cancel on blur — saves are explicit via Enter
              cancelEdit();
            }}
            className="flex-1 bg-transparent border-none outline-none text-[var(--text-primary)]"
            style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
          />
          <span className="text-[8px] text-[var(--text-tertiary)] whitespace-nowrap">
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
          className="flex-1 flex items-center gap-1 px-2 py-0.5 bg-green-400/5 cursor-text"
          style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 11 }}
          onClick={startEdit}
        >
          <span className="text-[var(--text-secondary)]">
            {'  '}
            {slotKey}:{' '}
          </span>
          <span className="text-red-400/60 line-through mr-1">{change.oldValue}</span>
          <span className="text-green-400">{value}</span>
          <button
            type="button"
            onClick={handleUndo}
            className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
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
          className="flex-1 flex items-center gap-1 px-2 py-0.5 cursor-text"
          style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 11 }}
          onClick={startEdit}
        >
          <span className="text-blue-400">
            {'  '}
            {slotKey}: {value}
          </span>
          <span className="text-[8px] text-blue-400 bg-blue-400/15 px-1 py-0.5 rounded ml-1">
            manual
          </span>
        </div>
      </div>
    );
  }

  // ── Default state (with hover ✕) ──
  return (
    <div className="group flex items-stretch" style={{ minHeight: 26 }}>
      <div className="shrink-0 w-1 bg-green-400" />
      <div
        className="flex-1 flex items-center gap-1 px-2 py-0.5 cursor-text"
        style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 11 }}
        onClick={startEdit}
      >
        <span className="text-[var(--text-secondary)]">
          {'  '}
          {slotKey}:{' '}
        </span>
        <span className="text-[var(--text-primary)]">{value}</span>
        <button
          type="button"
          onClick={handleDelete}
          className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-tertiary)] hover:text-red-400 cursor-pointer"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
