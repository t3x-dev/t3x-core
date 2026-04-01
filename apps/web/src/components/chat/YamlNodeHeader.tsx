'use client';

/**
 * YamlNodeHeader — Node title row
 *
 * Hover shows +/✕ (CSS). ✕ deletes node (drop YOp).
 * Deleted state collapses to single line with slot count + undo.
 */

import { Plus, Undo2, X } from 'lucide-react';
import { useCallback } from 'react';
import { useSlotActions } from '@/hooks/useSlotActions';
import { useCommandStore } from '@/store/commandStore';
import { useEditingStore } from '@/store/editingStore';

interface YamlNodeHeaderProps {
  nodeId: string;
  slotCount: number;
  isDeleted?: boolean;
}

export function YamlNodeHeader({ nodeId, slotCount, isDeleted }: YamlNodeHeaderProps) {
  const { deleteNode } = useSlotActions();
  const startAdding = useEditingStore((s) => s.startAdding);
  const undo = useCommandStore((s) => s.undo);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      deleteNode(nodeId);
    },
    [nodeId, deleteNode]
  );

  const handleAdd = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      startAdding(nodeId);
    },
    [nodeId, startAdding]
  );

  const handleUndo = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      undo();
    },
    [undo]
  );

  if (isDeleted) {
    return (
      <div className="group flex items-stretch" style={{ minHeight: 26 }}>
        <div className="shrink-0 w-1 bg-red-400" />
        <div
          className="flex-1 flex items-center gap-2 px-2 py-0.5"
          style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 11 }}
        >
          <span className="text-[var(--text-tertiary)] line-through opacity-50 font-semibold">
            {nodeId}:
          </span>
          <span className="text-[9px] text-[var(--text-tertiary)] opacity-50">
            {slotCount} slots
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

  return (
    <div className="group flex items-stretch" style={{ minHeight: 26 }}>
      <div className="shrink-0 w-1 bg-green-400" />
      <div
        className="flex-1 flex items-center gap-1 px-2 py-0.5"
        style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 11 }}
      >
        <span className="text-[var(--text-primary)] font-semibold">{nodeId}:</span>
        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={handleAdd}
            className="text-[var(--text-tertiary)] hover:text-blue-400 cursor-pointer"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="text-[var(--text-tertiary)] hover:text-red-400 cursor-pointer"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
